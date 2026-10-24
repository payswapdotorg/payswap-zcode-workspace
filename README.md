# PaySwap Workspace

A payments-oriented agent workspace: state an **economic goal** in plain words
and an agent loads a **routine** from the library, works it as a todo list,
opens merchant checkouts and swaps payment rails when they do not fit.

> Built on top of the UX language of [ZCode](https://github.com/payswapdotorg/ZCode-copy)
> (Apache-2.0). See [NOTICE.md](NOTICE.md) for exact attribution of ported code.

## What's inside

- **Unified New task page** — the app opens on *"What economic goal are we
  achieving?"* with quick-action chips, and the home widgets (workspace stats,
  continue-where-you-left-off, routines ready to load, open network
  opportunities) directly below the composer.
- **Routine library** — goals are fulfilled by loading routines; multiple
  matches produce a picker where you choose or let the agent decide. Routines
  execute as the original ZCode-style todo list, ticking off steps live.
  Third parties can publish routines (pending review) and both users and the
  agent rate them.
- **Real browser, simulated storefront** — the browser pane is a **real Chromium guest**
  (CDP pixel stream + input dispatch, mirroring the original ZCode webview contract) with
  the original chrome: address bar, back/forward history, reload, element picker. It can
  browse the live web; the sandbox storefront (jumia checkout, Pay with MoMo, receipts)
  is simulated.
- **Opportunities board** — payments with no fitting local rail are broadcast
  as opportunities to PaySwap nodes; nodes bid (fee bps, ETA, rating) and the
  best route wins.
- **Activity ledger** — one financial protocol view: obligations, funding,
  conversions, payouts, fees — with finality status and evidence references.
- **Dockable workspace** — the terminal, browser and any view can occupy the
  full window or share it as a docked side pane; the sidebar collapses for
  distraction-free full-window work.
- **Real terminal** — the original ZCode xterm.js terminal (theme, fit/resize,
  clipboard) wired to a persistent sandbox bash session over socket.io
  (`mini-services/terminal-service`).
- **Settings** — the full original ZCode settings surface (model providers
  with the GLM-5.3 / GLM-5.3-Flash models and plan/quota UI) plus PaySwap
  sections: payments & routing, connections, checkout, approvals, developer.

## Sandbox honesty

Payments, rails, node bids, ratings and the storefront are **simulations**
(sandbox receipt refs like `psbx_…`) for UX design purposes. The
conversational agent is a **real LLM runtime**. Nothing here moves real money.

## Run it

```bash
bun install
bun run db:push          # SQLite schema
bun run dev              # Next.js on :3000
(cd mini-services/browser-service && bun install && bun run dev)  # browser guest on :3010
(cd mini-services/terminal-service && bun install && bun run dev)  # terminal on :3005
```

Behind the Caddy gateway (`:81`), both services are reachable through the same
origin via `?XTransformPort=3010` and `?XTransformPort=3005`.

## Desktop app (Electron, ZCode shape)

The product form factor is a **desktop app like ZCode**: an Electron main
process spawns the workspace server and both guest services, then opens the
workspace in a native window.

```bash
bun run build                                  # production UI (standalone)
cd desktop && npm install && npm start         # window + server + browser + terminal
```

See [desktop/README.md](desktop/README.md) for modes (`PAYSWAP_DEV`,
`PAYSWAP_SKIP_SERVICES`, `PAYSWAP_APP_URL`, smoke testing) and the
`electron-builder` packaging targets (dmg / AppImage / deb / nsis).

## Source layout

```
src/app/page.tsx                    # workspace shell, routing, dock state, agent stream
src/components/paydesk/             # views (home/new-task, task, routines, opportunities, activity, settings, browser, terminal)
src/lib/agent-types.ts              # task/routine/gate/opportunity contracts
src/lib/zcode/terminal/             # verbatim ZCode terminal theme + links
src/server/                         # agent runtime, routine matching, payments, opportunities
mini-services/browser-service/      # real-Chromium guest over socket.io (CDP screencast + input)
mini-services/terminal-service/     # socket.io bash session service (PTY via script(1))
desktop/                            # Electron shell (main process, preload, packaging config)
prisma/schema.prisma                # tasks, messages, routines, opportunities, ledger, approvals
```

## License

Apache-2.0 — see [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
