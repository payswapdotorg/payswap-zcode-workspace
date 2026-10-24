# NOTICE

This project (the "PaySwap Workspace") is a Next.js re-implementation of a
payments-oriented agent workspace. Portions of it are derived from, or closely
follow the design of, the ZCode project:

- Source: https://github.com/payswapdotorg/ZCode-copy
- License: Apache License 2.0

Derived / ported code (Apache-2.0, Copyright ZCode contributors):

- `src/lib/zcode/terminal/terminalTheme.ts` — copied from
  `packages/ui/src/terminal/terminalTheme.ts` (verbatim).
- `src/lib/zcode/terminal/terminalLinks.ts` — copied from
  `packages/ui/src/terminal/terminalLinks.ts` (verbatim).
- `src/components/paydesk/zcode-terminal.tsx` — the xterm.js bootstrap, theme
  pipeline, fit/resize flow and clipboard handling are adapted from
  `packages/ui/src/terminal/TerminalSession.tsx`; the transport underneath is
  replaced with socket.io (see `mini-services/terminal-service/`).
- `src/lib/zcode/browser/embeddedBrowserHelpers.ts` — copied from
  `packages/ui/src/embeddedBrowserHelpers.ts` (verbatim: URL normalization,
  allow-list, load-error classification, BrowserState contract).
- `src/lib/zcode/browser/browser-viewport.ts` — ported from
  `packages/shared/src/browser-use/command-metadata.ts` (viewport limits, zoom
  options) and `packages/ui/src/browser-use/browserViewportZoom.ts`
  (Fit scale resolution).
- `src/components/zcode-browser/browser-toolbar.tsx` — faithful port of the
  browser chrome in `packages/ui/src/EmbeddedBrowserPaneParts.tsx`
  (BrowserToolbar, BrowserEmptyState, BrowserLoadErrorState,
  BrowserGuestFailureState, more menu, test-id contract).
- `src/components/zcode-browser/browser-viewport-toolbar.tsx` — faithful port
  of `packages/ui/src/browser-use/BrowserViewportToolbar.tsx` (free-size
  width/height inputs, zoom select, range errors).
- `src/components/zcode-browser/zcode-browser.tsx` — web adaptation of the
  navigation engine in `packages/ui/src/browser-use/UnifiedBrowserView.tsx`
  (session history, back/forward/reload, address-bar semantics,
  prop-driven navigationRequest intake, redirect tracking) and the responsive
  viewport of `ResponsiveBrowserViewport.tsx` (scaled free-size frame).
- `src/lib/zcode/browser/webElementContext.ts` — copied from
  `packages/ui/src/lib/webElementContext.ts` (verbatim: element payload
  contract, `# Web page elements:` markdown builder and parser, window-event
  dispatch contract).
- `src/lib/zcode/browser/webElementPickerScript.ts` — copied from
  `packages/ui/src/lib/webElementPickerScript.ts` (verbatim: the
  self-contained in-page picker script with hover overlay, style popover,
  selector/xpath/html-excerpt capture and Escape/cancel semantics).
- `src/lib/zcode/browser/useWebElementPicker.ts` — ported from
  `packages/ui/src/hooks/useWebElementPicker.ts` (verbatim except logging):
  the transport-agnostic `executeJs` exit is wired to CDP `Runtime.evaluate`
  on the remote guest (`mini-services/browser-service/`, `guest:exec`).

The Electron `<webview>` guest of the original ZCode browser cannot run in a
plain web sandbox. In this port the guest surface is a **real Chromium page**
hosted by the `mini-services/browser-service/` companion service: the page is
streamed with the CDP screencast while pointer/keyboard/wheel input is
dispatched into the same page through the CDP Input domain — the same protocol
the original main process attaches for agent control. Navigation, session
history (back/forward restore via `Page.navigateToHistoryEntry`), load
failures and loading state map one-to-one onto the original's webview events
(did-navigate, did-navigate-in-page, did-fail-load, did-start/stop-loading,
canGoBack/canGoForward). The PaySwap sandbox storefront is mounted as an
internal page behind the same chrome, exactly like the original's internal
pages; the live guest session survives while an internal page is displayed.

Payments, rails, opportunities, node bids and ratings in this repository are
sandbox simulations for UX design purposes only. The conversational agent is a
real LLM runtime; nothing here moves real money.

All other files carry the Apache License 2.0 (see LICENSE).
