/**
 * PaySwap browser guest service (sandbox).
 *
 * The original ZCode browser renders pages in an Electron `<webview>` and drives
 * chrome state from webview events (did-navigate, did-fail-load, did-start/stop-loading,
 * page-title-updated) while the main process attaches CDP to the guest. This service
 * provides the same guest surface for the web sandbox: one real Chromium page per
 * connection, streamed with the CDP screencast and driven with CDP input dispatch,
 * so the ported ZCode browser chrome behaves exactly like the original.
 *
 * Transport: socket.io (create/attach, navigate, back/forward/history jump, reload,
 * viewport resize, mouse/key/wheel input, screencast frames back). Each connection
 * owns an isolated browser context (own cookies/storage); the context dies with the
 * connection. Agent-side CDP control of the guest mirrors the original
 * browserViewAttachGuest contract and can be layered on later through the same session.
 */
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright-core'
import { existsSync } from 'node:fs'
import { Server } from 'socket.io'

const PORT = Number(process.env.PORT) || 3010
/** Desktop override: CHROMIUM_PATH env -> playwright registry default -> bundled chromium guess. */
function resolveChromiumPath(): string {
  const candidates = [
    process.env.CHROMIUM_PATH,
    '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
    `${process.env.HOME ?? ''}/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome`,
    `${process.env.LOCALAPPDATA ?? ''}/ms-playwright/chromium-1200/chrome-win/chrome.exe`,
  ].filter(Boolean) as string[]
  for (const c of candidates) if (existsSync(c)) return c
  return candidates[0]
}
const CHROMIUM_PATH = resolveChromiumPath()
const FRAME_QUALITY = 60
const MAX_FRAME_EDGE = 2048

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

interface GuestSession {
  ctx: BrowserContext
  page: Page
  cdp: CDPSession
  mainFrameId: string | null
  docRequestId: string | null
  casting: boolean
  dead: boolean
  lastError: string | null
  lastErrorAt: number
}

let browserPromise: Promise<Browser> | null = null

function getBrowser(): Promise<Browser> {
  browserPromise ??= chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--mute-audio',
      '--force-color-profile=srgb',
    ],
  })
  return browserPromise
}

function clampViewport(v: { width?: number; height?: number } | undefined) {
  const width = Math.min(3840, Math.max(200, Math.round(Number(v?.width) || 1280)))
  const height = Math.min(2160, Math.max(150, Math.round(Number(v?.height) || 720)))
  return { width, height }
}

const io = new Server({ cors: { origin: '*', methods: ['GET', 'POST'] }, maxHttpBufferSize: 8e6 })

io.on('connection', (socket) => {
  let session: GuestSession | null = null

  const emit = (event: string, payload: unknown) => {
    if (!socket.connected) return
    socket.emit(event, payload)
  }

  async function startCasting(s: GuestSession, viewport: { width: number; height: number }) {
    if (s.casting) return
    s.casting = true
    try {
      await s.cdp.send('Page.startScreencast', {
        format: 'jpeg',
        quality: FRAME_QUALITY,
        everyNthFrame: 1,
        maxWidth: Math.min(MAX_FRAME_EDGE, viewport.width),
        maxHeight: Math.min(MAX_FRAME_EDGE, viewport.height),
      })
    } catch {
      s.casting = false
    }
  }

  async function stopCasting(s: GuestSession) {
    if (!s.casting) return
    s.casting = false
    try {
      await s.cdp.send('Page.stopScreencast')
    } catch {
      /* guest already gone */
    }
  }

  /** One-off frame so static pages (no compositor damage) still paint. */
  async function kickFrame(s: GuestSession) {
    if (s.dead || !socket.connected) return
    try {
      const shot = await s.cdp.send('Page.captureScreenshot', {
        format: 'jpeg',
        quality: FRAME_QUALITY,
      })
      emit('guest:frame', Buffer.from(shot.data, 'base64'))
    } catch {
      /* guest not ready yet */
    }
  }

  async function reportHistory(s: GuestSession, inPage: boolean) {
    if (s.dead) return
    try {
      const history = await s.cdp.send('Page.getNavigationHistory')
      const current = history.entries[history.currentIndex]
      emit('guest:navigated', {
        url: current?.url ?? 'about:blank',
        canGoBack: history.currentIndex > 0,
        canGoForward: history.currentIndex < history.entries.length - 1,
        historyIndex: history.currentIndex,
        inPage,
      })
    } catch {
      /* guest closed under us */
    }
  }

  /** Report a main-frame document load failure (short net:: error, deduped). */
  const failLoad = (s: GuestSession, errorText: string) => {
    const short = /net::ERR_[A-Z_]+/.exec(errorText)?.[0] ?? errorText.slice(0, 160)
    if (s.lastError === short && Date.now() - s.lastErrorAt < 3000) return
    s.lastError = short
    s.lastErrorAt = Date.now()
    emit('guest:load-failed', { errorText: short })
  }

  function wirePage(s: GuestSession) {
    const { cdp, page } = s

    cdp.on('Page.screencastFrame', (p) => {
      if (s.dead) return
      emit('guest:frame', Buffer.from(p.data, 'base64'))
      void cdp.send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {})
    })

    cdp.on('Page.frameNavigated', (p) => {
      if (p.frame.parentId) return
      // playwright's Frame type exposes the CDP frameId as `id`
      s.mainFrameId = String((p.frame as { id?: string }).id ?? '')
      s.docRequestId = null
      void reportHistory(s, false)
    })

    cdp.on('Page.navigatedWithinDocument', () => {
      void reportHistory(s, true)
    })

    cdp.on('Page.frameStartedLoading', (p: { frameId: string }) => {
      if (p.frameId === s.mainFrameId) emit('guest:loading', { loading: true })
    })

    cdp.on('Page.frameStoppedLoading', (p: { frameId: string }) => {
      if (p.frameId !== s.mainFrameId) return
      emit('guest:loading', { loading: false })
      void kickFrame(s)
    })

    cdp.on('Network.requestWillBeSent', (p) => {
      if (p.type === 'Document' && p.frameId === s.mainFrameId) s.docRequestId = p.requestId
    })

    cdp.on('Network.loadingFailed', (p) => {
      if (p.requestId !== s.docRequestId) return
      s.docRequestId = null
      // Canceled loads are superseded navigations, not failures.
      if (p.canceled || p.errorText === 'net::ERR_ABORTED') return
      failLoad(s, p.errorText)
    })

    page.on('crash', () => {
      s.dead = true
      emit('guest:failure', { reason: 'crashed' })
    })
  }

  async function foldPopupsIntoGuest(s: GuestSession) {
    s.ctx.on('page', async (popup) => {
      try {
        await popup.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {})
        const url = popup.url()
        try {
          await popup.close()
        } catch {
          /* already closing */
        }
        if (s.dead || !url || url === 'about:blank') return
        // The original webview without allowpopups keeps popups in the guest; fold them in.
        await s.page.goto(url, { waitUntil: 'commit', timeout: 30_000 })
      } catch {
        /* popup raced a teardown */
      }
    })
  }

  async function attach(viewportInput: { width?: number; height?: number } | undefined) {
    const viewport = clampViewport(viewportInput)
    const browser = await getBrowser()
    const ctx = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      userAgent: USER_AGENT,
      locale: 'en-US',
    })
    const page = await ctx.newPage()
    page.on('dialog', (dialog) => {
      void dialog.dismiss().catch(() => {})
    })
    const cdp = await page.context().newCDPSession(page)
    const s: GuestSession = {
      ctx,
      page,
      cdp,
      mainFrameId: null,
      docRequestId: null,
      casting: false,
      dead: false,
      lastError: null,
      lastErrorAt: 0,
    }
    wirePage(s)
    await foldPopupsIntoGuest(s)
    await cdp.send('Page.enable')
    await cdp.send('Network.enable')
    // Learn the main frame id up front so loading events match from the first navigation
    // (frameStartedLoading fires before the first frameNavigated of a goto).
    const { frameTree } = await cdp.send('Page.getFrameTree')
    s.mainFrameId = String((frameTree.frame as { id?: string }).id ?? '')
    await startCasting(s, viewport)
    void kickFrame(s)
    session = s
    return s
  }

  const withSession = (fn: (s: GuestSession) => Promise<void>) => {
    void (async () => {
      const s = session
      if (!s || s.dead) return
      try {
        await fn(s)
      } catch {
        /* guest races are expected (closed page, interrupted nav) */
      }
    })()
  }

  socket.on('guest:attach', (params: { viewport?: { width: number; height: number } }, ack?: (r: unknown) => void) => {
    void (async () => {
      try {
        await attach(params?.viewport)
        ack?.({ ok: true })
      } catch (error) {
        ack?.({ ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    })()
  })

  socket.on('guest:navigate', (params: { url: string }) => {
    const url = String(params?.url ?? '')
    if (!/^https?:\/\//.test(url)) return
    withSession(async (s) => {
      try {
        await s.page.goto(url, { waitUntil: 'commit', timeout: 30_000 })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/net::ERR_|NS_ERROR|ERR_/i.test(message)) {
          failLoad(s, message)
        }
      }
    })
  })

  socket.on('guest:back', () => {
    withSession(async (s) => {
      await s.page.goBack({ waitUntil: 'commit', timeout: 30_000 }).catch(() => {})
    })
  })

  socket.on('guest:forward', () => {
    withSession(async (s) => {
      await s.page.goForward({ waitUntil: 'commit', timeout: 30_000 }).catch(() => {})
    })
  })

  socket.on('guest:navigate-to-history', (params: { index: number }) => {
    const index = Math.round(Number(params?.index))
    if (!Number.isFinite(index) || index < 0) return
    withSession(async (s) => {
      const history = await s.cdp.send('Page.getNavigationHistory')
      const entry = history.entries[index]
      if (!entry) return
      await s.cdp.send('Page.navigateToHistoryEntry', { entryId: entry.id }).catch(() => {})
    })
  })

  socket.on('guest:reload', () => {
    withSession(async (s) => {
      await s.page.reload({ waitUntil: 'commit', timeout: 30_000 }).catch(() => {})
    })
  })

  socket.on('guest:viewport', (params: { width: number; height: number }) => {
    const viewport = clampViewport(params)
    withSession(async (s) => {
      await s.page.setViewportSize(viewport)
      await stopCasting(s)
      await startCasting(s, viewport)
      void kickFrame(s)
    })
  })

  socket.on('guest:hide', () => {
    const s = session
    if (s) void stopCasting(s)
  })

  socket.on('guest:show', () => {
    withSession(async (s) => {
      await startCasting(s, s.page.viewportSize() ?? { width: 1280, height: 720 })
      void kickFrame(s)
    })
  })

  socket.on('guest:mouse', (params: Record<string, unknown>) => {
    withSession(async (s) => {
      const type = String(params.type) as
        | 'mousePressed'
        | 'mouseReleased'
        | 'mouseMoved'
        | 'mouseWheel'
      if (!['mousePressed', 'mouseReleased', 'mouseMoved', 'mouseWheel'].includes(type)) return
      const x = Number(params.x) || 0
      const y = Number(params.y) || 0
      const modifiers = Number(params.modifiers) || 0
      if (type === 'mouseWheel') {
        await s.cdp.send('Input.dispatchMouseEvent', {
          type,
          x,
          y,
          deltaX: Number(params.deltaX) || 0,
          deltaY: Number(params.deltaY) || 0,
          modifiers,
          button: 'none',
          pointerType: 'mouse',
        })
        return
      }
      const buttons = Number(params.buttons) || 0
      const button = (
        type === 'mouseMoved'
          ? buttons & 1
            ? 'left'
            : buttons & 2
              ? 'right'
              : buttons & 4
                ? 'middle'
                : 'none'
          : String(params.button)
      ) as 'left' | 'middle' | 'right' | 'none'
      await s.cdp.send('Input.dispatchMouseEvent', {
        type,
        x,
        y,
        modifiers,
        buttons,
        button,
        ...(type === 'mousePressed' || type === 'mouseReleased'
          ? { clickCount: Math.max(1, Number(params.clickCount) || 1) }
          : {}),
        pointerType: 'mouse',
      })
    })
  })

  /* Arbitrary in-guest script evaluation (Runtime.evaluate) — the transport the
     original UnifiedBrowserView provided through webview.executeJavaScript.
     Powers the verbatim web element picker (awaitPromise + returnByValue). */
  socket.on('guest:exec', (params: { expression: string }, ack?: (r: unknown) => void) => {
    const expression = String(params?.expression ?? '')
    if (!expression) {
      ack?.({ ok: false, error: 'empty-expression' })
      return
    }
    const s = session
    if (!s || s.dead) {
      ack?.({ ok: false, error: 'guest-not-ready' })
      return
    }
    void (async () => {
      try {
        const result = await s.cdp.send('Runtime.evaluate', {
          expression,
          awaitPromise: true,
          returnByValue: true,
        })
        if (result.exceptionDetails) {
          const detail = result.exceptionDetails
          const text =
            (detail.exception as { description?: string } | undefined)?.description ??
            detail.text ??
            'evaluation-failed'
          ack?.({ ok: false, error: text })
          return
        }
        ack?.({ ok: true, result: result.result.value })
      } catch (error) {
        ack?.({ ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    })()
  })

  socket.on('guest:key', (params: Record<string, unknown>) => {
    withSession(async (s) => {
      const type = String(params.type)
      if (!['keyDown', 'rawKeyDown', 'keyUp', 'char'].includes(type)) return
      const payload: Record<string, unknown> = {
        type,
        modifiers: Number(params.modifiers) || 0,
      }
      if (params.key != null) payload.key = String(params.key)
      if (params.code != null) payload.code = String(params.code)
      if (params.text != null) payload.text = String(params.text)
      if (params.unmodifiedText != null) payload.unmodifiedText = String(params.unmodifiedText)
      if (params.windowsVirtualKeyCode != null)
        payload.windowsVirtualKeyCode = Number(params.windowsVirtualKeyCode)
      if (params.nativeVirtualKeyCode != null)
        payload.nativeVirtualKeyCode = Number(params.nativeVirtualKeyCode)
      if (params.autoRepeat != null) payload.autoRepeat = Boolean(params.autoRepeat)
      await s.cdp.send('Input.dispatchKeyEvent', payload as never)
    })
  })

  socket.on('disconnect', () => {
    const s = session
    session = null
    if (!s) return
    s.dead = true
    void s.ctx.close().catch(() => {})
  })
})

console.log(`[browser-service] listening on :${PORT} (chromium: ${CHROMIUM_PATH})`)
io.listen(PORT)
