'use client'

/**
 * Web port of the original ZCode UnifiedBrowserView navigation engine
 * (packages/ui/src/browser-use/UnifiedBrowserView.tsx, Apache-2.0).
 *
 * The original renders pages in an Electron `<webview>` guest and drives chrome
 * state from webview events. This port keeps the same architecture and test-id
 * contract but hosts the guest on the browser-service mini-service: a real
 * Chromium page streamed over CDP (screencast frames + input dispatch), so real
 * websites render and behave exactly like the original webview — same session,
 * same native history (back/forward restore through Page.navigateToHistoryEntry),
 * same load-failure and loading semantics.
 *
 * Internal pages (PaySwap sandbox storefront) render React above the live guest —
 * the equivalent of browser-internal pages, keeping the guest session alive while
 * they are displayed. about:blank shows the original empty state.
 *
 * Everything the user sees — toolbar layout, address bar semantics, back/forward/
 * reload, free-size viewport, empty/load-error states — mirrors the original.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  DEFAULT_BROWSER_URL,
  INITIAL_BROWSER_STATE,
  displayBrowserUrl,
  normalizeBrowserUrl,
  type BrowserGuestFailure,
  type BrowserState,
} from '@/lib/zcode/browser/embeddedBrowserHelpers'
import { useWebElementPicker } from '@/lib/zcode/browser/useWebElementPicker'
import {
  DEFAULT_AGENT_BROWSER_VIEWPORT,
  DEFAULT_BROWSER_VIEWPORT_ZOOM,
  resolveBrowserViewportScale,
  type BrowserViewportSize,
  type BrowserViewportZoom,
} from '@/lib/zcode/browser/browser-viewport'
import { cn } from '@/lib/utils'
import {
  BrowserEmptyState,
  BrowserLoadErrorState,
  BrowserToolbar,
  BrowserGuestFailureState,
  SandboxBadge,
} from './browser-toolbar'
import { BrowserViewportToolbar } from './browser-viewport-toolbar'
import {
  RemoteBrowserGuest,
  type RemoteGuestEvents,
  type RemoteGuestHandle,
} from './remote-browser-guest'

const EMPTY_ENTRY = 'about:blank'

export interface ZcodeBrowserInternalPage {
  /** Whether this renderer handles the history entry. */
  matches: (entry: string) => boolean
  /** Render the guest surface for the entry; navigate() pushes a new history entry. */
  render: (entry: string, navigate: (entry: string) => void, reloadKey: number) => ReactNode
}

interface HistoryEntry {
  entry: string
  /** Position in the live remote session history; null = not a live remote entry. */
  remoteIdx: number | null
}

type NavigationIntent = 'goto' | 'restore-stepped' | 'restore-remote' | null

function isExternalEntry(entry: string): boolean {
  return entry.startsWith('http://') || entry.startsWith('https://')
}

export function ZcodeBrowser({
  url,
  /** Maps a requested URL to a history entry (PaySwap maps jumia hosts to the store). */
  resolveEntry,
  internalPage,
  /** Display URL override reported by the internal page for the current entry. */
  getInternalDisplayUrl,
  onOpenExternal,
  solo = false,
  onToggleSolo,
  onClose,
}: {
  /** Current URL requested by the host (agent navigation); null = blank tab. */
  url: string | null
  resolveEntry?: (url: string) => string
  internalPage?: ZcodeBrowserInternalPage
  getInternalDisplayUrl?: (entry: string) => string | null
  onOpenExternal?: (url: string) => void
  solo?: boolean
  onToggleSolo?: () => void
  onClose?: () => void
}) {
  /* ---------------- navigation history (original: webview session history) --------- */
  const [history, setHistory] = useState<{ entries: HistoryEntry[]; index: number }>(() => {
    const raw = url && url !== DEFAULT_BROWSER_URL ? url : EMPTY_ENTRY
    return { entries: [{ entry: resolveEntry ? resolveEntry(raw) : raw, remoteIdx: null }], index: 0 }
  })
  const [guestAttached, setGuestAttached] = useState(false)
  const [sessionEpoch, setSessionEpoch] = useState(0)
  const [guestFailure, setGuestFailure] = useState<BrowserGuestFailure | null>(null)
  const [guestRetryNonce, setGuestRetryNonce] = useState(0)
  const [remoteLoading, setRemoteLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [addressDraft, setAddressDraft] = useState<string | null>(null)
  /** Remount key for internal pages (original: reload remounts the guest surface). */
  const [guestInstance, setGuestInstance] = useState(0)

  /* The live guest mounts with the first external entry and stays mounted afterwards
     (hidden behind internal pages) so its session survives, like the webview. */
  const guestMounted = useMemo(
    () => history.entries.some((item) => isExternalEntry(item.entry)),
    [history.entries],
  )

  /* ---------------- free-size viewport (original responsive mode) ------------------ */
  const [isResponsiveMode, setIsResponsiveMode] = useState(false)
  const [viewportSize, setViewportSize] = useState<BrowserViewportSize>(
    DEFAULT_AGENT_BROWSER_VIEWPORT,
  )
  const [zoom, setZoom] = useState<BrowserViewportZoom>(DEFAULT_BROWSER_VIEWPORT_ZOOM)
  const [canvasSize, setCanvasSize] = useState<BrowserViewportSize | null>(null)
  const regionNodeRef = useRef<HTMLDivElement | null>(null)

  const guestHandleRef = useRef<RemoteGuestHandle | null>(null)
  const [remoteCan, setRemoteCan] = useState({ back: false, forward: false })
  const historyRef = useRef(history)
  useEffect(() => {
    historyRef.current = history
  })
  const remoteCurrentIdxRef = useRef(-1)
  const navIntentRef = useRef<NavigationIntent>(null)
  const lastNavigatedRef = useRef<string | null>(null)
  const eventsRef = useRef<RemoteGuestEvents>({
    onAttached: () => {},
    onNavigated: () => {},
    onLoading: () => {},
    onLoadFailed: () => {},
    onFailure: () => {},
  })

  const currentEntry = history.entries[history.index]?.entry ?? EMPTY_ENTRY
  const currentIsExternal = isExternalEntry(currentEntry)
  const internalMatches = internalPage?.matches(currentEntry) ?? false
  const showGuest = !internalMatches && currentIsExternal && !loadError && !guestFailure

  /* Host pushes (address bar / agent navigation) — the drive effect turns the new
     current entry into a guest navigation, exactly like the original loadURL. */
  const pushEntry = useCallback((entry: string, remoteIdx: number | null = null) => {
    setLoadError(null)
    setHistory((h) => {
      if (h.entries[h.index]?.entry === entry) return h
      return {
        entries: [...h.entries.slice(0, h.index + 1), { entry, remoteIdx }],
        index: h.index + 1,
      }
    })
  }, [])

  /* Prop-driven navigation (agent open_browser events → original navigationRequest). */
  const [syncedPropUrl, setSyncedPropUrl] = useState<string | null>(
    url && url !== DEFAULT_BROWSER_URL ? url : null,
  )
  if (url && url !== DEFAULT_BROWSER_URL && url !== syncedPropUrl) {
    // Adjust state during rendering (React "derive state from props" pattern) —
    // the equivalent of the original's navigationRequest intake. The drive effect
    // turns the new current entry into the guest navigation.
    setSyncedPropUrl(url)
    const entry = resolveEntry ? resolveEntry(url) : url
    if (entry !== currentEntry) {
      setLoadError(null)
      setHistory((h) => ({
        entries: [...h.entries.slice(0, h.index + 1), { entry, remoteIdx: null }],
        index: h.index + 1,
      }))
    }
  }

  const displayUrl = internalMatches
    ? getInternalDisplayUrl?.(currentEntry) ?? currentEntry
    : displayBrowserUrl(currentEntry)

  const browserState: BrowserState = {
    ...INITIAL_BROWSER_STATE,
    canGoBack: history.index > 0 || (currentIsExternal && remoteCan.back),
    canGoForward:
      history.index < history.entries.length - 1 || (currentIsExternal && remoteCan.forward),
    currentUrl: displayUrl || DEFAULT_BROWSER_URL,
    errorMessage: loadError,
    isReady: true,
    isLoading:
      currentIsExternal && guestMounted && !loadError && (remoteLoading || !guestAttached),
  }

  /* ---------------- remote guest events (original webview events) ------------------ */
  useEffect(() => {
    eventsRef.current = {
      onAttached: (ok, error) => {
        if (!ok) {
          setGuestFailure({ exitCode: 1, reason: error ?? 'browser-guest-launch-failed' })
          return
        }
        setGuestAttached(true)
        setRemoteCan({ back: false, forward: false })
        remoteCurrentIdxRef.current = -1
        lastNavigatedRef.current = null
        // New guest session: recorded remote history positions are stale, and the
        // drive effect re-navigation is triggered through the session epoch bump.
        setHistory((h) => {
          let changed = false
          const entries = h.entries.map((item) => {
            if (item.remoteIdx === null) return item
            changed = true
            return { ...item, remoteIdx: null }
          })
          return changed ? { entries, index: h.index } : h
        })
        setSessionEpoch((epoch) => epoch + 1)
      },
      onNavigated: (nav) => {
        setRemoteCan({ back: nav.canGoBack, forward: nav.canGoForward })
        remoteCurrentIdxRef.current = nav.historyIndex
        setRemoteLoading(false)
        if (!isExternalEntry(nav.url)) return
        const intent = navIntentRef.current
        navIntentRef.current = null
        lastNavigatedRef.current = nav.url
        setLoadError(null)
        setHistory((h) => {
          const current = h.entries[h.index]
          if (!current) return h
          if (current.entry === nav.url) {
            // Same page (redirect resolved / traversal restore): record live position.
            const entries = [...h.entries]
            entries[h.index] = { ...current, remoteIdx: nav.historyIndex }
            return { entries, index: h.index }
          }
          if (intent === 'goto' || intent === 'restore-stepped') {
            // Redirect resolution or stepped-restore mismatch: replace in place.
            const entries = [...h.entries]
            entries[h.index] = { entry: nav.url, remoteIdx: nav.historyIndex }
            return { entries, index: h.index }
          }
          // Unsolicited (in-guest link/form/SPA navigation, restore-remote): the
          // live guest owns the navigation — push a session entry like the webview.
          return {
            entries: [
              ...h.entries.slice(0, h.index + 1),
              { entry: nav.url, remoteIdx: nav.historyIndex },
            ],
            index: h.index + 1,
          }
        })
      },
      onLoading: (loading) => setRemoteLoading(loading),
      onLoadFailed: (errorText) => {
        navIntentRef.current = null
        setRemoteLoading(false)
        setLoadError(errorText)
      },
      onFailure: (reason) => {
        setRemoteLoading(false)
        setGuestFailure({ exitCode: 1, reason })
      },
    }
  })

  /* Drive the guest: hide behind internal pages, navigate on new external entries. */
  useEffect(() => {
    const handle = guestHandleRef.current
    if (!guestMounted || !handle) return
    if (!currentIsExternal) {
      handle.hide()
      return
    }
    if (loadError || guestFailure) return
    const liveRemoteIdx = history.entries[history.index]?.remoteIdx ?? null
    const atLiveRemotePage =
      liveRemoteIdx !== null && remoteCurrentIdxRef.current === liveRemoteIdx
    if (currentEntry === lastNavigatedRef.current && atLiveRemotePage) {
      handle.show()
      return
    }
    lastNavigatedRef.current = currentEntry
    navIntentRef.current = 'goto'
    handle.navigate(currentEntry)
  }, [guestMounted, currentIsExternal, currentEntry, loadError, guestFailure, sessionEpoch, history])

  /* Keep the remote viewport in sync with the visible surface (real reflow). */
  const guestViewportWidth = isResponsiveMode
    ? viewportSize.width
    : Math.max(200, canvasSize?.width ?? DEFAULT_AGENT_BROWSER_VIEWPORT.width)
  const guestViewportHeight = isResponsiveMode
    ? viewportSize.height
    : Math.max(150, canvasSize?.height ?? DEFAULT_AGENT_BROWSER_VIEWPORT.height)
  const guestViewport = useMemo<BrowserViewportSize>(
    () => ({ width: guestViewportWidth, height: guestViewportHeight }),
    [guestViewportWidth, guestViewportHeight],
  )

  useEffect(() => {
    if (!guestMounted) return
    guestHandleRef.current?.setViewport(guestViewport)
  }, [guestMounted, guestViewport])

  /* ---------------- navigation actions -------------------------------------------- */
  const stepIndex = useCallback((delta: -1 | 1) => {
    setLoadError(null)
    setHistory((h) => {
      const next = h.index + delta
      if (next < 0 || next >= h.entries.length) return h
      return { ...h, index: next }
    })
  }, [])

  const goBack = useCallback(() => {
    const h = historyRef.current
    const current = h.entries[h.index]
    const target = h.index > 0 ? h.entries[h.index - 1] : null
    if (current && isExternalEntry(current.entry) && current.remoteIdx !== null && remoteCan.back) {
      if (h.index === 0) {
        // Remote history runs ahead of the client mirror: restore on the guest only.
        navIntentRef.current = 'restore-remote'
        guestHandleRef.current?.back()
        return
      }
      if (target && isExternalEntry(target.entry) && target.remoteIdx !== null) {
        // Same live session: native history traversal (restores scroll/SPA state).
        navIntentRef.current = 'restore-stepped'
        stepIndex(-1)
        guestHandleRef.current?.navigateToHistoryEntry(target.remoteIdx)
        return
      }
    }
    if (h.index > 0) stepIndex(-1)
  }, [remoteCan.back, stepIndex])

  const goForward = useCallback(() => {
    const h = historyRef.current
    const current = h.entries[h.index]
    const target = h.index < h.entries.length - 1 ? h.entries[h.index + 1] : null
    if (current && isExternalEntry(current.entry) && current.remoteIdx !== null && remoteCan.forward) {
      if (h.index === h.entries.length - 1) {
        navIntentRef.current = 'restore-remote'
        guestHandleRef.current?.forward()
        return
      }
      if (target && isExternalEntry(target.entry) && target.remoteIdx !== null) {
        navIntentRef.current = 'restore-stepped'
        stepIndex(1)
        guestHandleRef.current?.navigateToHistoryEntry(target.remoteIdx)
        return
      }
    }
    if (h.index < h.entries.length - 1) stepIndex(1)
  }, [remoteCan.forward, stepIndex])

  const reload = useCallback(() => {
    const h = historyRef.current
    const current = h.entries[h.index]
    setLoadError(null)
    if (current && isExternalEntry(current.entry) && guestMounted) {
      navIntentRef.current = 'goto'
      setRemoteLoading(true)
      if (guestFailure) {
        // Failed guest: navigation restarts everything once reattached.
        guestHandleRef.current?.navigate(current.entry)
      } else {
        guestHandleRef.current?.reload()
      }
      return
    }
    // Internal page (or empty tab): remount the guest surface.
    setGuestInstance((n) => n + 1)
  }, [guestFailure, guestMounted])

  const navigateFromAddress = useCallback(
    (raw: string) => {
      const normalized = normalizeBrowserUrl(raw)
      if (!normalized) return
      if (normalized === DEFAULT_BROWSER_URL) {
        pushEntry(EMPTY_ENTRY)
        return
      }
      const entry = resolveEntry ? resolveEntry(normalized) : normalized
      // Optimistic spinner (original loadURL shows loading until did-stop-loading).
      if (isExternalEntry(entry)) setRemoteLoading(true)
      pushEntry(entry)
    },
    [pushEntry, resolveEntry],
  )

  const handleAddressSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (addressDraft !== null) {
        navigateFromAddress(addressDraft)
      }
      setAddressDraft(null)
    },
    [addressDraft, navigateFromAddress],
  )

  const handleOpenExternal = useCallback(() => {
    const target = browserState.currentUrl
    if (!target || !target.startsWith('http')) return
    if (onOpenExternal) {
      onOpenExternal(target)
    } else {
      window.open(target, '_blank', 'noopener,noreferrer')
    }
  }, [browserState.currentUrl, onOpenExternal])

  const retryGuest = useCallback(() => {
    setGuestFailure(null)
    setGuestRetryNonce((nonce) => nonce + 1)
  }, [])

  const attachRegion = useCallback((node: HTMLDivElement | null) => {
    regionNodeRef.current = node
  }, [])

  useEffect(() => {
    const node = regionNodeRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    // ResizeObserver always emits an initial callback, so the first measure lands here
    // without synchronous setState inside the effect body.
    const observer = new ResizeObserver(() => {
      setCanvasSize({ width: node.clientWidth, height: node.clientHeight })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [attachRegion])

  const scale = resolveBrowserViewportScale({ canvasSize, viewportSize, zoom })

  /* ---------------- element picker (original useWebElementPicker over CDP) --------- */
  const executeJs = useCallback(async (script: string) => {
    const handle = guestHandleRef.current
    if (!handle) throw new Error('guest-not-ready')
    return handle.exec(script)
  }, [])
  const { isPicking, togglePicking } = useWebElementPicker({
    executeJs,
    workspacePath: '/home/z/my-project',
  })
  const pickerAvailable = currentIsExternal && guestMounted && guestAttached && !guestFailure

  /* ---------------- guest surface --------------------------------------------------- */
  const showInternal = internalMatches
  const showEmpty = !showInternal && !currentIsExternal
  const showError = Boolean(loadError) && !showInternal
  const isEmptyBrowserState = showEmpty && !showError && !guestFailure

  return (
    <div className="flex h-full min-h-0 flex-col bg-white" data-testid="zcode-browser">
      <BrowserToolbar
        addressValue={addressDraft ?? displayUrl}
        browserState={browserState}
        permissionControl={<SandboxBadge />}
        onAddressChange={setAddressDraft}
        onAddressBlur={() => setAddressDraft(null)}
        onGoBack={goBack}
        onGoForward={goForward}
        onOpenExternal={handleOpenExternal}
        onReload={reload}
        onToggleResponsiveMode={() => setIsResponsiveMode((v) => !v)}
        pickerActive={isPicking}
        pickerDisabled={!pickerAvailable}
        onTogglePicker={() => void togglePicking().catch(() => {})}
        onSubmit={handleAddressSubmit}
        isResponsiveMode={isResponsiveMode}
        solo={solo}
        onToggleSolo={onToggleSolo}
        onClose={onClose}
      />
      {isResponsiveMode ? (
        <BrowserViewportToolbar
          isVisible
          onViewportSizeChange={setViewportSize}
          onZoomChange={setZoom}
          viewportSize={viewportSize}
          zoom={zoom}
        />
      ) : null}

      <div
        ref={attachRegion}
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-white"
      >
        {showError ? (
          <BrowserLoadErrorState errorMessage={loadError ?? ''} onRetry={reload} />
        ) : null}
        {isEmptyBrowserState ? (
          <BrowserEmptyState browserState={browserState} isGuestStarting={false} />
        ) : null}
        {guestFailure ? (
          <BrowserGuestFailureState guestFailure={guestFailure} onRetry={retryGuest} />
        ) : null}
        <div
          className={cn(
            'flex h-full w-full items-center justify-center',
            isResponsiveMode && 'p-4',
          )}
          data-testid={isResponsiveMode ? 'browser-responsive-viewport' : undefined}
        >
          <div
            className={cn(
              'relative overflow-hidden',
              isResponsiveMode && 'rounded-xl shadow-[0_0_0_1px_#dce5e9]',
            )}
            style={
              isResponsiveMode
                ? {
                    width: Math.round(viewportSize.width * scale),
                    height: Math.round(viewportSize.height * scale),
                  }
                : { width: '100%', height: '100%' }
            }
          >
            <div
              className={cn(
                'h-full w-full',
                showEmpty || showError || guestFailure ? 'invisible' : 'visible',
              )}
              style={
                isResponsiveMode
                  ? {
                      width: viewportSize.width,
                      height: viewportSize.height,
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      transform: `scale(${scale})`,
                      transformOrigin: 'top left',
                    }
                  : undefined
              }
            >
              {guestMounted ? (
                <div
                  className="absolute inset-0"
                  style={{ visibility: showInternal ? 'hidden' : 'visible' }}
                >
                  <RemoteBrowserGuest
                    key={guestRetryNonce}
                    viewport={guestViewport}
                    events={eventsRef}
                    guestRef={guestHandleRef}
                  />
                </div>
              ) : null}
              {showInternal ? (
                <div className="absolute inset-0 bg-white">
                  {internalPage?.render(currentEntry, pushEntry, guestInstance) ?? null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
