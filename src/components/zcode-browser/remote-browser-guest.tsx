'use client'

/**
 * Real-Chromium guest surface for the ported ZCode browser.
 *
 * The original ZCode browser embeds pages in an Electron `<webview>`: Chromium
 * composites the pixels in place and input goes straight to the renderer. This
 * guest reproduces that exact contract for the web sandbox through the
 * browser-service mini-service: a real headless Chromium page is streamed with
 * CDP screencast frames while pointer/keyboard/wheel input is dispatched into
 * the same page via the CDP Input domain — the same protocol the original main
 * process attaches for agent control. Navigation, history traversal and load
 * events mirror the webview events (`did-navigate`, `did-navigate-in-page`,
 * `did-fail-load`, `did-start/stop-loading`, `canGoBack/canGoForward`).
 */

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { io, type Socket } from 'socket.io-client'
import { LoaderIcon } from 'lucide-react'
import type { BrowserViewportSize } from '@/lib/zcode/browser/browser-viewport'

export interface RemoteGuestNavigation {
  url: string
  canGoBack: boolean
  canGoForward: boolean
  historyIndex: number
  inPage: boolean
}

export interface RemoteGuestEvents {
  onAttached: (ok: boolean, error?: string) => void
  onNavigated: (navigation: RemoteGuestNavigation) => void
  onLoading: (loading: boolean) => void
  onLoadFailed: (errorText: string) => void
  onFailure: (reason: string) => void
}

export interface RemoteGuestHandle {
  navigate: (url: string) => void
  back: () => void
  forward: () => void
  navigateToHistoryEntry: (index: number) => void
  reload: () => void
  setViewport: (size: BrowserViewportSize) => void
  show: () => void
  hide: () => void
  /** Evaluate a script in the live guest page (original webview.executeJavaScript). */
  exec: (expression: string) => Promise<unknown>
}

/** Windows virtual key codes for non-printable keys (CDP Input domain contract). */
const SPECIAL_KEYS: Record<string, { code: string; vk: number; text?: string }> = {
  Enter: { code: 'Enter', vk: 13, text: '\r' },
  Backspace: { code: 'Backspace', vk: 8 },
  Tab: { code: 'Tab', vk: 9 },
  Escape: { code: 'Escape', vk: 27 },
  Delete: { code: 'Delete', vk: 46 },
  Insert: { code: 'Insert', vk: 45 },
  Home: { code: 'Home', vk: 36 },
  End: { code: 'End', vk: 35 },
  PageUp: { code: 'PageUp', vk: 33 },
  PageDown: { code: 'PageDown', vk: 34 },
  ArrowLeft: { code: 'ArrowLeft', vk: 37 },
  ArrowUp: { code: 'ArrowUp', vk: 38 },
  ArrowRight: { code: 'ArrowRight', vk: 39 },
  ArrowDown: { code: 'ArrowDown', vk: 40 },
}
for (let i = 1; i <= 12; i += 1) SPECIAL_KEYS[`F${i}`] = { code: `F${i}`, vk: 111 + i }

function modifierBitmask(native: KeyboardEvent): number {
  return (
    (native.altKey ? 1 : 0) |
    (native.ctrlKey ? 2 : 0) |
    (native.metaKey ? 4 : 0) |
    (native.shiftKey ? 8 : 0)
  )
}

function keyDownPayload(native: KeyboardEvent): Record<string, unknown> {
  const modifiers = modifierBitmask(native)
  const base = { modifiers, key: native.key, autoRepeat: native.repeat }
  const special = SPECIAL_KEYS[native.key]
  const plainChar =
    native.key.length === 1 && !native.ctrlKey && !native.metaKey && !native.altKey
  if (plainChar) {
    return {
      type: 'keyDown',
      ...base,
      code: native.code || undefined,
      windowsVirtualKeyCode: native.keyCode || native.key.toUpperCase().charCodeAt(0),
      nativeVirtualKeyCode: native.keyCode,
      text: native.key,
      unmodifiedText: native.key.toLowerCase(),
    }
  }
  if (special) {
    const withText = Boolean(special.text) && !native.ctrlKey && !native.metaKey
    return {
      type: withText ? 'keyDown' : 'rawKeyDown',
      ...base,
      code: special.code,
      windowsVirtualKeyCode: special.vk,
      nativeVirtualKeyCode: special.vk,
      ...(withText ? { text: special.text, unmodifiedText: special.text } : {}),
    }
  }
  return {
    type: 'rawKeyDown',
    ...base,
    code: native.code || undefined,
    windowsVirtualKeyCode: native.keyCode,
    nativeVirtualKeyCode: native.keyCode,
  }
}

function keyUpPayload(native: KeyboardEvent): Record<string, unknown> {
  const special = SPECIAL_KEYS[native.key]
  return {
    type: 'keyUp',
    modifiers: modifierBitmask(native),
    key: native.key,
    code: special?.code ?? native.code ?? undefined,
    windowsVirtualKeyCode: special?.vk ?? native.keyCode,
    nativeVirtualKeyCode: special?.vk ?? native.keyCode,
  }
}

function pointerModifiers(
  e: Pick<ReactPointerEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>,
): number {
  return (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0)
}

export function RemoteBrowserGuest({
  viewport,
  events,
  guestRef,
}: {
  viewport: BrowserViewportSize
  events: RefObject<RemoteGuestEvents>
  guestRef: RefObject<RemoteGuestHandle | null>
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<HTMLImageElement | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const attachedRef = useRef(false)
  const viewportRef = useRef(viewport)
  const frameUrlRef = useRef<string | null>(null)
  const clickRef = useRef({ x: 0, y: 0, time: 0, count: 0 })
  const pendingMoveRef = useRef<{
    x: number
    y: number
    buttons: number
    modifiers: number
  } | null>(null)
  const moveRafRef = useRef(0)
  const [awaitingFirstFrame, setAwaitingFirstFrame] = useState(true)

  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])

  /* ---- transport + guest lifecycle ------------------------------------------ */
  useEffect(() => {
    let disposed = false
    let attachTimeout = 0
    const socket = io('/?XTransformPort=3010', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 12,
      reconnectionDelay: 800,
      timeout: 10_000,
    })
    socketRef.current = socket

    const attach = () => {
      window.clearTimeout(attachTimeout)
      attachTimeout = window.setTimeout(() => {
        if (!attachedRef.current && !disposed) {
          events.current.onFailure('browser-guest-unreachable')
        }
      }, 15_000)
      socket.emit(
        'guest:attach',
        { viewport: viewportRef.current },
        (result: { ok: boolean; error?: string } | undefined) => {
          if (disposed) return
          window.clearTimeout(attachTimeout)
          const ok = Boolean(result?.ok)
          attachedRef.current = ok
          events.current.onAttached(ok, result?.error)
        },
      )
    }

    socket.on('connect', attach)
    socket.on('disconnect', () => {
      attachedRef.current = false
    })
    socket.on('guest:navigated', (nav: RemoteGuestNavigation) => {
      if (!disposed) events.current.onNavigated(nav)
    })
    socket.on('guest:loading', (payload: { loading: boolean }) => {
      if (!disposed) events.current.onLoading(Boolean(payload?.loading))
    })
    socket.on('guest:load-failed', (payload: { errorText: string }) => {
      if (!disposed) events.current.onLoadFailed(String(payload?.errorText ?? 'Page failed to load'))
    })
    socket.on('guest:failure', (payload: { reason: string }) => {
      if (!disposed) events.current.onFailure(String(payload?.reason ?? 'crashed'))
    })
    socket.on('guest:frame', (data: ArrayBuffer | Uint8Array) => {
      if (disposed) return
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
      const url = URL.createObjectURL(
        new Blob([bytes as unknown as BlobPart], { type: 'image/jpeg' }),
      )
      const img = frameRef.current
      if (img) {
        const previous = frameUrlRef.current
        frameUrlRef.current = url
        img.src = url
        if (previous) URL.revokeObjectURL(previous)
      } else {
        URL.revokeObjectURL(url)
      }
      setAwaitingFirstFrame(false)
    })

    return () => {
      disposed = true
      window.clearTimeout(attachTimeout)
      if (moveRafRef.current) {
        cancelAnimationFrame(moveRafRef.current)
        moveRafRef.current = 0
      }
      socket.disconnect()
      socketRef.current = null
      if (frameUrlRef.current) {
        URL.revokeObjectURL(frameUrlRef.current)
        frameUrlRef.current = null
      }
    }
  }, [events])

  /* ---- imperative guest control (original webview method surface) ------------ */
  useImperativeHandle(
    guestRef,
    () => ({
      navigate: (target: string) => {
        if (attachedRef.current) socketRef.current?.emit('guest:navigate', { url: target })
      },
      back: () => socketRef.current?.emit('guest:back'),
      forward: () => socketRef.current?.emit('guest:forward'),
      navigateToHistoryEntry: (index: number) =>
        socketRef.current?.emit('guest:navigate-to-history', { index }),
      reload: () => socketRef.current?.emit('guest:reload'),
      setViewport: (size: BrowserViewportSize) => {
        viewportRef.current = size
        socketRef.current?.emit('guest:viewport', size)
      },
      show: () => {
        if (attachedRef.current) socketRef.current?.emit('guest:show')
      },
      hide: () => {
        if (attachedRef.current) socketRef.current?.emit('guest:hide')
      },
      exec: (expression: string) =>
        new Promise<unknown>((resolve, reject) => {
          const socket = socketRef.current
          if (!socket || !attachedRef.current) {
            reject(new Error('guest-not-ready'))
            return
          }
          socket.emit(
            'guest:exec',
            { expression },
            (result: { ok: boolean; result?: unknown; error?: string } | undefined) => {
              if (result?.ok) resolve(result.result)
              else reject(new Error(result?.error ?? 'evaluation-failed'))
            },
          )
        }),
    }),
    [],
  )

  /* ---- input: pointer + wheel (CDP Input domain) ----------------------------- */
  const toPagePoint = (clientX: number, clientY: number) => {
    const node = containerRef.current
    if (!node) return null
    const rect = node.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    const vp = viewportRef.current
    const width = vp?.width || rect.width
    const height = vp?.height || rect.height
    return {
      x: ((clientX - rect.left) * width) / rect.width,
      y: ((clientY - rect.top) * height) / rect.height,
    }
  }

  const nextClickCount = (x: number, y: number) => {
    const now = Date.now()
    const last = clickRef.current
    const chained = now - last.time < 450 && Math.hypot(x - last.x, y - last.y) < 6
    const count = chained ? Math.min(3, last.count + 1) : 1
    clickRef.current = { x, y, time: now, count }
    return count
  }

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.focus({ preventScroll: true })
    const point = toPagePoint(e.clientX, e.clientY)
    if (!point) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* pointer already released */
    }
    socketRef.current?.emit('guest:mouse', {
      type: 'mousePressed',
      ...point,
      button: e.button === 0 ? 'left' : e.button === 1 ? 'middle' : 'right',
      buttons: e.buttons,
      modifiers: pointerModifiers(e),
      clickCount: nextClickCount(point.x, point.y),
    })
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const point = toPagePoint(e.clientX, e.clientY)
    if (!point) return
    pendingMoveRef.current = {
      x: point.x,
      y: point.y,
      buttons: e.buttons,
      modifiers: pointerModifiers(e),
    }
    if (!moveRafRef.current) {
      moveRafRef.current = requestAnimationFrame(() => {
        moveRafRef.current = 0
        const pending = pendingMoveRef.current
        pendingMoveRef.current = null
        if (pending) socketRef.current?.emit('guest:mouse', { type: 'mouseMoved', ...pending })
      })
    }
  }

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const point = toPagePoint(e.clientX, e.clientY)
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    if (!point) return
    socketRef.current?.emit('guest:mouse', {
      type: 'mouseReleased',
      ...point,
      button: e.button === 0 ? 'left' : e.button === 1 ? 'middle' : 'right',
      buttons: e.buttons,
      modifiers: pointerModifiers(e),
      clickCount: Math.max(1, clickRef.current.count),
    })
  }

  /* Wheel needs a non-passive native listener so preventDefault sticks. */
  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const point = toPagePoint(e.clientX, e.clientY)
      if (!point) return
      const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 400 : 1
      socketRef.current?.emit('guest:mouse', {
        type: 'mouseWheel',
        ...point,
        deltaX: e.deltaX * unit,
        deltaY: e.deltaY * unit,
        modifiers:
          (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0),
      })
    }
    node.addEventListener('wheel', handler, { passive: false })
    return () => node.removeEventListener('wheel', handler)
  }, [])

  /* ---- input: keyboard ------------------------------------------------------- */
  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // Every key belongs to the remote page (the host page must not scroll/tab).
    e.preventDefault()
    socketRef.current?.emit('guest:key', keyDownPayload(e.nativeEvent))
  }

  const handleKeyUp = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    socketRef.current?.emit('guest:key', keyUpPayload(e.nativeEvent))
  }

  return (
    <div
      ref={containerRef}
      data-testid="browser-webview"
      role="document"
      aria-label="Browser guest page"
      tabIndex={0}
      className="relative h-full w-full cursor-default overflow-hidden bg-white outline-none select-none"
      style={{ touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
    >
      <img
        ref={frameRef}
        alt=""
        draggable={false}
        className="h-full w-full"
        style={{ objectFit: 'fill' }}
      />
      {awaitingFirstFrame ? (
        <div className="absolute inset-0 flex items-center justify-center bg-white">
          <LoaderIcon
            className="size-10 animate-spin text-[#102642] opacity-30"
            aria-label="Loading page"
          />
        </div>
      ) : null}
    </div>
  )
}
