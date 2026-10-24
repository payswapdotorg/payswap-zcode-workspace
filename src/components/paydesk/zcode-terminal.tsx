'use client'

/**
 * ZCode terminal, ported for the PaySwap web workspace.
 *
 * The xterm setup, theme pipeline (`mergeTerminalTheme`), fit/resize flow and
 * clipboard handling are adapted from the original ZCode app
 * (payswapdotorg/ZCode-copy, packages/ui/src/terminal/TerminalSession.tsx —
 * Apache-2.0). The Electron/RPC transport underneath is replaced here with a
 * socket.io channel to the local terminal mini-service, which keeps a
 * persistent bash session per pane. See NOTICE.md.
 *
 * xterm is imported lazily inside the mount effect — it touches `self` at
 * module scope and must never execute during SSR.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { Terminal as XTerm } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'
import { Maximize2, Minimize2, RotateCw, SquareTerminal, X } from 'lucide-react'
import { mergeTerminalTheme } from '@/lib/zcode/terminal/terminalTheme'
import { cn } from '@/lib/utils'
import { C } from './bits'

export interface TerminalPaneProps {
  solo: boolean
  onToggleSolo: () => void
  onClose: () => void
}

type Phase = 'connecting' | 'ready' | 'exited' | 'error'

/** One socket.io-backed persistent bash session rendered through xterm.js. */
export function TerminalPane({ solo, onToggleSolo, onClose }: TerminalPaneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const sessionRef = useRef<string | null>(null)
  const resizeTimer = useRef<number | null>(null)
  const disposedRef = useRef(false)

  const [phase, setPhase] = useState<Phase>('connecting')
  const [shellLabel, setShellLabel] = useState<string | null>(null)
  const [restartTick, setRestartTick] = useState(0)

  const sendResize = useCallback(() => {
    const fit = fitRef.current
    const socket = socketRef.current
    const id = sessionRef.current
    if (!fit || !socket || !id) return
    const dims = fit.proposeDimensions()
    if (!dims || !dims.cols || !dims.rows) return
    if (resizeTimer.current) window.clearTimeout(resizeTimer.current)
    resizeTimer.current = window.setTimeout(() => {
      socket.emit('term:resize', { id, cols: dims.cols, rows: dims.rows })
    }, 400)
  }, [])

  const fitNow = useCallback(
    (initial: boolean) => {
      const fit = fitRef.current
      if (!fit) return
      try {
        fit.fit()
      } catch {
        return
      }
      const socket = socketRef.current
      if (!socket) return
      const dims = fit.proposeDimensions()
      if (!dims?.cols || !dims?.rows) return
      if (initial && !sessionRef.current) {
        // Fit BEFORE create so the PTY boots with the real pane size (original order).
        socket.emit(
          'term:create',
          { cols: dims.cols, rows: dims.rows, cwd: '/home/z/my-project' },
          (res: { id: string; shell: string }) => {
            if (disposedRef.current) return
            sessionRef.current = res.id
            setShellLabel(res.shell)
            setPhase('ready')
          },
        )
      } else {
        sendResize()
      }
    },
    [sendResize],
  )

  useEffect(() => {
    disposedRef.current = false
    const host = hostRef.current
    if (!host) return

    let cancelled = false
    let raf = 0
    let first = 0
    let ro: ResizeObserver | null = null
    let themeObserver: MutationObserver | null = null
    let resizeTimerLocal: number | null = null

    // --- transport (socket.io-client is SSR-safe)
    const socket = io('/?XTransformPort=3005', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 800,
      timeout: 10_000,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      if (disposedRef.current) return
      if (!sessionRef.current) fitNow(true)
    })
    socket.on('disconnect', () => {
      setPhase((p) => (p === 'ready' ? 'connecting' : p))
    })
    socket.on('term:data', ({ id, data }: { id: string; data: string }) => {
      if (id === sessionRef.current) termRef.current?.write(data)
    })
    socket.on('term:exit', ({ id }: { id: string }) => {
      if (id !== sessionRef.current) return
      termRef.current?.write('\r\n\x1b[38;5;245m[session exited — press ↻ to start a new shell]\x1b[0m\r\n')
      sessionRef.current = null
      setPhase('exited')
    })
    socket.on('connect_error', () => {
      if (disposedRef.current) return
      setPhase((p) => (p === 'ready' ? p : 'error'))
    })

    // --- xterm bootstrap (original ZCode setup), lazily imported for SSR
    void (async () => {
      const [{ Terminal: TerminalCtor }, { FitAddon: FitAddonCtor }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ])
      if (cancelled) return

      const term = new TerminalCtor({
        fontSize: 13,
        lineHeight: 1.25,
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
        cursorBlink: true,
        allowProposedApi: true,
        theme: mergeTerminalTheme(undefined),
        scrollback: 4000,
      })
      const fit = new FitAddonCtor()
      term.loadAddon(fit)
      term.open(host)
      termRef.current = term
      fitRef.current = fit

      // Re-resolve the theme when the app switches light/dark (original behavior).
      themeObserver = new MutationObserver(() => {
        term.options.theme = mergeTerminalTheme(undefined)
      })
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

      // Copy / paste chords (original behavior: copy-with-selection on Ctrl/Cmd+Shift+C).
      term.attachCustomKeyEventHandler((event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'c' && event.shiftKey && term.hasSelection()) {
          void navigator.clipboard?.writeText(term.getSelection()).catch(() => {})
          return false
        }
        if ((event.metaKey || event.ctrlKey) && event.key === 'v') {
          void navigator.clipboard
            ?.readText()
            .then((text) => {
              const id = sessionRef.current
              if (text && id && socketRef.current) {
                socketRef.current.emit('term:write', { id, data: text })
              }
            })
            .catch(() => {})
          return false
        }
        return true
      })

      term.onData((data) => {
        const id = sessionRef.current
        if (id) socket.emit('term:write', { id, data })
      })

      // --- sizing pipeline: ResizeObserver → rAF → fit (original order), debounced resize emit
      ro = new ResizeObserver(() => {
        if (disposedRef.current) return
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(() => fitNow(false))
      })
      ro.observe(host)

      if (socket.connected && !sessionRef.current) {
        first = window.setTimeout(() => fitNow(true), 40)
      }
    })()

    return () => {
      cancelled = true
      disposedRef.current = true
      window.clearTimeout(first)
      if (resizeTimerLocal) window.clearTimeout(resizeTimerLocal)
      if (resizeTimer.current) window.clearTimeout(resizeTimer.current)
      cancelAnimationFrame(raf)
      ro?.disconnect()
      themeObserver?.disconnect()
      const id = sessionRef.current
      if (id) socket.emit('term:dispose', { id })
      sessionRef.current = null
      socket.disconnect()
      socketRef.current = null
      termRef.current?.dispose()
      termRef.current = null
      fitRef.current = null
    }
    // restartTick intentionally remounts the whole session
  }, [restartTick])

  const restart = () => {
    setPhase('connecting')
    setShellLabel(null)
    setRestartTick((n) => n + 1)
  }

  return (
    <div
      data-testid="terminal"
      className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white')}
    >
      {/* Pane chrome */}
      <div
        data-testid="terminal-header"
        className={cn(
          'flex shrink-0 items-center gap-2 border-b border-[#dce5e9] bg-white px-3',
          solo ? 'h-12' : 'h-11',
        )}
      >
        <SquareTerminal className="h-4 w-4 shrink-0" style={{ color: C.greenDeep }} aria-hidden="true" />
        <span className="min-w-0 truncate text-[12.5px] font-medium text-[#102642]">
          Terminal
          <span className="ml-1.5 text-[11px] font-normal text-[#8ba0b3]">
            bash · sandbox{shellLabel ? ` · ${shellLabel}` : ''}
          </span>
        </span>
        <span
          className="ml-1 h-1.5 w-1.5 shrink-0 rounded-full"
          style={{
            background: phase === 'ready' ? C.green : phase === 'connecting' ? C.amberDot : C.red,
          }}
          aria-hidden="true"
        />
        <span className="sr-only" aria-live="polite">
          {phase === 'ready' ? 'Terminal ready' : phase === 'connecting' ? 'Terminal connecting' : `Terminal ${phase}`}
        </span>

        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={restart}
            aria-label="Restart terminal session"
            title="Restart session"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[#8ba0b3] hover:bg-[#f6f9fa] hover:text-[#102642]"
          >
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            data-testid="terminal-fullscreen"
            onClick={onToggleSolo}
            aria-label={solo ? 'Restore terminal into workspace' : 'Expand terminal to full window'}
            title={solo ? 'Dock back into workspace' : 'Occupy full window'}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[#8ba0b3] hover:bg-[#f6f9fa] hover:text-[#102642]"
          >
            {solo ? <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />}
          </button>
          <button
            type="button"
            data-testid="terminal-close-button"
            onClick={onClose}
            aria-label="Close terminal"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[#8ba0b3] hover:bg-[#f6f9fa] hover:text-[#102642]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* xterm host */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={hostRef}
          className="absolute inset-0 px-2 py-1.5"
          style={{ minHeight: 120 }}
          aria-label="Terminal session"
          role="region"
        />
        {phase !== 'ready' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="rounded-full bg-white/90 px-3 py-1 text-[11.5px] text-[#8ba0b3] shadow-sm">
              {phase === 'connecting'
                ? 'Connecting to sandbox shell…'
                : phase === 'error'
                  ? 'Terminal service unreachable — retrying…'
                  : 'Session exited'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
