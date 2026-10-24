# PaySwap Desktop (Electron)

PaySwap ships as a **desktop app in the same shape as the original ZCode**: an
Electron main process owns the workspace UI server, the real-Chromium browser
guest service, and the PTY terminal service, then opens the workspace in a
native window. The web preview in the sandbox is just the dev view of the same
app.

```
desktop/main.js      Electron main process — spawns services, opens the window
desktop/preload.js   minimal contextBridge marker (window.payswapDesktop)
desktop/package.json electron + electron-builder config (mac/win/linux targets)
```

## Prerequisites

- Node.js 20+
- [bun](https://bun.sh) — runs the workspace server and the two guest services
- Playwright Chromium for the browser guest (auto-detected; override with
  `CHROMIUM_PATH=/path/to/chrome`)
- util-linux `script(1)` for the terminal PTY (present on any normal Linux
  desktop; on macOS the service falls back to plain bash pipes)

## Run (development)

```bash
# from the repo root — build the UI once for production mode
bun install && bun run build

# then start the desktop shell (spawns server + browser-service + terminal-service)
cd desktop && npm install && npm start
```

Useful modes:

| Command                       | What it does                                              |
| ----------------------------- | --------------------------------------------------------- |
| `npm start`                   | spawn production server + both services, open the window   |
| `npm run start:dev`           | same, but the UI runs in Next dev mode                     |
| `npm run start:reuse`         | attach to already-running processes (no spawning)          |
| `PAYSWAP_APP_URL=<url> npm start -- -- --` | point the window at a hosted deployment       |

Environment knobs: `PAYSWAP_DEV`, `PAYSWAP_SKIP_SERVICES`, `PAYSWAP_APP_URL`,
`PAYSWAP_SMOKE` (CI: prints `PAYSWAP_SMOKE_OK` then quits), `BUN_BIN`,
`NODE_BIN`, `CHROMIUM_PATH`.

## Package installers

```bash
cd desktop && npm run dist   # electron-builder -> dist/ (dmg/AppImage/deb/nsis)
```

The v1 package bundles the shell; the workspace (Next standalone output, the
two services, and the SQLite database) runs from the repo checkout next to it.
A fully self-contained installer (services compiled with `bun build --compile`,
resources unpacked per-OS) is the next packaging milestone.

## Desktop roadmap (ZCode parity)

- Swap the browser guest transport to a **native Electron `<webview>`** when
  `window.payswapDesktop.isDesktop` is true (the UI already isolates the guest
  behind `RemoteGuestHandle`, so this is a drop-in transport change).
- Move the terminal to **node-pty in the main process** via IPC, mirroring the
  original ZCode terminal service contract (the socket.io contract is already
  identical: create / write / resize / data / exit).
- Tray icon, deep links (`payswap://`), auto-update via electron-updater.
