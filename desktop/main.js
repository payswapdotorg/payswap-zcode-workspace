/**
 * PaySwap desktop shell (Electron) — mirrors the original ZCode desktop shape:
 * the Electron main process owns the lifecycle of the workspace UI server and
 * the two local guest services (real-Chromium browser guest + PTY terminal),
 * then opens a BrowserWindow that loads the workspace UI.
 *
 * Modes:
 *   default              spawn production server (.next/standalone) + both services
 *   PAYSWAP_DEV=1        spawn `bun run dev` instead of the production server
 *   PAYSWAP_SKIP_SERVICES=1  do not spawn anything (reuse already-running processes)
 *   PAYSWAP_APP_URL=...  load this URL instead of spawning a local server
 *   PAYSWAP_SMOKE=1      print PAYSWAP_SMOKE_OK after first load, then quit (CI)
 */
const { app, BrowserWindow, Menu, shell, dialog } = require('electron')
const { spawn } = require('node:child_process')
const http = require('node:http')
const path = require('node:path')
const fs = require('node:fs')

const DESKTOP_DIR = __dirname
const APP_ROOT = path.resolve(DESKTOP_DIR, '..')
const SMOKE = process.env.PAYSWAP_SMOKE === '1'
const DEV = process.env.PAYSWAP_DEV === '1'
const SKIP_SERVICES = process.env.PAYSWAP_SKIP_SERVICES === '1'
const APP_URL = process.env.PAYSWAP_APP_URL || 'http://localhost:3000'

const children = []
let quitting = false

function log(...args) {
  console.log('[payswap-desktop]', ...args)
}

function spawnChild(name, cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    cwd: opts.cwd || APP_ROOT,
    env: { ...process.env, ...(opts.env || {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (d) => log(`[${name}]`, String(d).trimEnd().slice(0, 400)))
  child.stderr.on('data', (d) => log(`[${name}!]`, String(d).trimEnd().slice(0, 400)))
  child.on('exit', (code) => {
    if (!quitting) log(`[${name}] exited (code ${code})`)
  })
  children.push(child)
  return child
}

function bunBin() {
  return process.env.BUN_BIN || 'bun'
}

function startServices() {
  if (SKIP_SERVICES) {
    log('PAYSWAP_SKIP_SERVICES=1 — reusing already-running processes')
    return
  }
  // Guest services: prefer the compiled single-file binaries (bun build --compile,
  // see mini-services/*/package.json build scripts), fall back to the bun runtime.
  const fsBin = path.join(APP_ROOT, 'desktop', 'bin', 'payswap-browser-service')
  const termBin = path.join(APP_ROOT, 'desktop', 'bin', 'payswap-terminal-service')
  const useBinaries = process.env.PAYSWAP_FORCE_BUN !== '1' && fs.existsSync(fsBin) && fs.existsSync(termBin)
  if (useBinaries) {
    log('using compiled service binaries from desktop/bin')
    spawnChild('browser', fsBin, [], {
      env: { CHROMIUM_PATH: process.env.CHROMIUM_PATH || '' },
    })
    spawnChild('terminal', termBin, [], {
      env: { WORKSPACE_ROOT: APP_ROOT },
    })
  } else {
    spawnChild('browser', bunBin(), ['index.ts'], {
      cwd: path.join(APP_ROOT, 'mini-services', 'browser-service'),
      env: { CHROMIUM_PATH: process.env.CHROMIUM_PATH || '' },
    })
    spawnChild('terminal', bunBin(), ['index.ts'], {
      cwd: path.join(APP_ROOT, 'mini-services', 'terminal-service'),
      env: { WORKSPACE_ROOT: APP_ROOT },
    })
  }
  // Workspace UI server
  const standalone = path.join(APP_ROOT, '.next', 'standalone', 'server.js')
  if (DEV || !fs.existsSync(standalone)) {
    log('starting Next.js in dev mode (run `bun run build` for production)')
    spawnChild('next', bunBin(), ['run', 'dev'], { cwd: APP_ROOT })
  } else {
    log('starting Next.js production server (standalone)')
    const nodeBin = process.env.NODE_BIN || 'node'
    spawnChild('next', nodeBin, [standalone], {
      cwd: APP_ROOT,
      env: {
        PORT: '3000',
        HOSTNAME: '127.0.0.1',
        NODE_ENV: 'production',
        DATABASE_URL: process.env.DATABASE_URL || `file:${path.join(APP_ROOT, 'db', 'custom.db')}`,
      },
    })
  }
}

function ping(url, timeoutMs = 90_000) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (quitting) return reject(new Error('quitting'))
      const req = http.get(url, (res) => {
        res.resume()
        if (res.statusCode && res.statusCode < 500) return resolve(true)
        retry()
      })
      req.on('error', retry)
      req.setTimeout(4000, () => {
        req.destroy()
        retry()
      })
    }
    const retry = () => {
      if (Date.now() - started > timeoutMs) return reject(new Error('server did not come up in time'))
      setTimeout(attempt, 700)
    }
    attempt()
  })
}

function killChildren() {
  for (const c of children) {
    try {
      if (!c.killed) c.kill('SIGTERM')
    } catch {
      /* already gone */
    }
  }
}

function buildMenu(win) {
  const template = [
    {
      label: 'PaySwap',
      submenu: [
        {
          label: 'About PaySwap',
          click: () =>
            dialog.showMessageBox(win, {
              type: 'info',
              title: 'PaySwap',
              message: 'PaySwap Workspace',
              detail: 'Economic-goal agents & automations on ZCode foundations.\nApache-2.0 — see NOTICE for attribution.',
            }),
        },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'PaySwap',
    backgroundColor: '#0b2b3d',
    show: false,
    webPreferences: {
      preload: path.join(DESKTOP_DIR, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })

  win.once('ready-to-show', () => win.show())
  buildMenu(win)

  // Open external links in the system browser; keep the app inside the window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_URL)) return { action: 'allow' }
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!APP_URL || APP_URL.startsWith('http://localhost')) {
    startServices()
    try {
      await ping(APP_URL)
      log('workspace UI is up at', APP_URL)
    } catch (error) {
      log('server wait failed:', String(error))
    }
  }

  await win.loadURL(APP_URL)
  log('window loaded', APP_URL)

  if (SMOKE) {
    setTimeout(() => {
      log('PAYSWAP_SMOKE_OK')
      app.quit()
    }, 3000)
  }
}

app.whenReady().then(() => {
  log('electron ready', app.getVersion())
  createWindow().catch((error) => {
    log('fatal:', error)
    app.quit()
  })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('before-quit', () => {
  quitting = true
  killChildren()
})

app.on('window-all-closed', () => {
  quitting = true
  killChildren()
  app.quit()
})

process.on('exit', killChildren)
