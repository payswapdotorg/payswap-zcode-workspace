/**
 * PaySwap desktop preload — minimal, safe bridge.
 * Exposes a desktop marker so the workspace UI can later detect the Electron
 * shell (e.g. to swap the browser guest transport to a native <webview> or to
 * enable desktop-only integrations) without weakening context isolation.
 */
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('payswapDesktop', {
  isDesktop: true,
  platform: process.platform,
  version: process.versions.electron,
})
