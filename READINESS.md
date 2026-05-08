# Readiness audit — leveraged-etf-dashboard

This is the honest "what's wired, what's deferred, what's not in this codebase" audit. Updated through the Polish A–J pass.

## What's actually live in the UI

### Charting + indicators
- Candlestick + RSI charts with bidirectional time-scale sync
- 250-period RSI with Wilder's smoothing (configurable)
- EMA20/EMA50, VWAP, Bollinger Bands, SMA20 toggleable per chart
- Pattern markers (hammer, engulfing, stars, soldiers) — Polish C
- Trade entry / stop-loss price lines per open position
- **Drag-to-edit stop-loss handles** — Polish H
- Volume series, multi-timeframe data hook (1m/5m/15m/1h/1D)

### Strategy engine
- ConditionTree DSL: cross-asset refs, multi-timeframe refs, options-aware refs
- Modes: paper / manual_confirm / auto
- Custom strategy wizard — RSI, breakout, EMA, MACD, **Pine Script import** (Polish E)
- Manual builder with ticker pinning + cross-asset condition support
- Backtest runner (single-window) + **walk-forward** (rolling IS/OOS) — Polish B
- Strategy explainer (English narrative)
- Heuristic signal score badge on each strategy — Polish A
- **Kelly criterion sizing card** per strategy — Polish D
- Regime classification chip in dashboard header — Polish A

### Trade tracking
- Manual trades (open/close, stop-loss, profit targets)
- Paper trade history with realized P&L
- Performance attribution: by ticker / strategy / hour / day-of-week / hold-time
- Tax-lot accounting + **tax-loss harvest suggestions with §1091 wash-sale awareness** — Polish D

### Schwab integration (optional)
- OAuth flow + encrypted token store at rest
- Place-order route with server-side guardrails (notional cap, daily cap, symbol allowlist)
- Order status polling → engine state with actual fill price + qty — Polish G
- OCO bracket order helper
- Real-time options-chain proxy

### Reliability + observability — Polish I
- Top-level React `ErrorBoundary` wraps the app shell
- `/api/health` endpoint reports Schwab + LLM + Finnhub state
- `HealthBadge` in header polls /api/health every 30s
- **Master kill-switch** toggle blocks all auto-mode order dispatches
- Structured server logger (one JSON line per call)
- `/api/log` endpoint accepts client error payloads

### Chat (optional) — Polish F
- StrategyChat falls back to deterministic local interpreter when no key
- `/api/chat` proxy uses ANTHROPIC_API_KEY or OPENAI_API_KEY (Anthropic preferred)
- User context (strategies, open trades, paper history) injected into prompt

## What works but isn't surfaced in the UI yet

- Snapshot capture for paper trades (captured, but no per-trade screenshot viewer)
- Webhook outbound system (`webhookStore`) — fires on `strategy.fired`, but management UI is minimal
- LayoutSwitcher persists named workspaces but only switches the radar layout

## What's deferred / not in this codebase

- **Sentry / Datadog hookup** — `/api/log` and `logger` are forward-compatible, but no DSN wiring yet
- **Server-resident strategy worker** — gated behind `SERVER_WORKER_ENABLED`, currently shadow-run only (logs what would fire, doesn't place orders)
- **Multi-account Schwab support** — pin to one account via `SCHWAB_ACCOUNT_HASH`
- **Authentication** — single-user dashboard; do not expose to the public internet without your own auth proxy
- **Mobile drag-and-drop on stop handles** — the chart drag uses pointer events so should work, but not exhaustively tested on touch
- **Real-time options Greeks streaming** — chains are polled per fetch; no streamer
- **Backtesting on options strategies** — backtest runner is equity-only

## Operational runbook

### First-time setup
1. Copy `.env.example` → `.env.local`. Yahoo Finance works without a key for basic data.
2. Optional: set `FINNHUB_API_KEY` for the news/insider/sentiment cards.
3. Optional: set `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) for real LLM chat. Without it, chat uses the local interpreter.
4. Optional: register a Schwab developer app, set the OAuth env vars, wait for "Ready for Use", then click Connect on the Schwab card in Settings.
5. `npm install && npm run dev` — http://localhost:3000

### Daily ops
- `npm run dev` for development; `npm run build && npm start` for production
- `npm test` runs the Vitest suite (189 tests as of Polish J)
- `npx tsc --noEmit` for a fast type check
- `curl localhost:3000/api/health` for a one-shot status

### Safe-mode escape hatches
- **Kill switch** (header HealthBadge → toggle): blocks all auto-mode Schwab orders without disabling strategies.
- **Disable individual strategies**: in Strategies panel.
- **Server-side allowlist**: `SCHWAB_SYMBOL_ALLOWLIST` enforces hard caps regardless of UI state.
- **Nuke tokens**: delete `~/.schwab-tokens.enc` (or container's `/app/data/schwab-tokens.enc`) to revoke all Schwab access.

### When something breaks
- React render error → ErrorBoundary catches it, shows stack, click Reset.
- Browser fetch failures → check `/api/health`.
- Schwab order failure → check the Strategy Events panel (the engine logs the error there with the orderId).
- Engine seems stuck → reload the page; engine state is in localStorage and re-hydrates.

## Tier completeness

| Tier | Topic | Status |
|------|-------|--------|
| 1 | Core RSI dashboard | done |
| 2 | Strategy DSL + paper trading | done |
| 3 | Schwab live trading | done (with kill-switch) |
| 4 | Backtest + walk-forward | done |
| 5 | Multi-asset, options, scanner | done (equity backtest only) |
| 6 | Performance attribution + analytics | done |
| 7 | Reliability + observability | done (Sentry hookup deferred) |

## Pre-flight checklist before flipping any strategy to `auto`

- [ ] Health badge is green
- [ ] Kill switch is OFF
- [ ] `SCHWAB_SYMBOL_ALLOWLIST` includes only the tickers you'd trade tonight
- [ ] `SCHWAB_MAX_ORDER_NOTIONAL` is below your "uh oh" threshold
- [ ] You ran the same strategy in paper mode for at least a session
- [ ] You ran a walk-forward backtest and the OOS decay is < 50%
- [ ] You can reach Settings → kill switch within 2 clicks if anything looks wrong
