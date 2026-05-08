# Leveraged ETF Command Center

Real-time RSI-driven trading dashboard for leveraged ETFs (SOXL/TQQQ/UPRO/etc.) with a custom strategy engine, paper trading, walk-forward backtest, optional Schwab broker integration, and an LLM strategy chat.

Built for personal use — not a SaaS, not multi-user.

## Quick start

```bash
cp .env.example .env.local       # at minimum: defaults work with Yahoo Finance
npm install
npm run dev                      # → http://localhost:3000
```

For first-time orientation, see [READINESS.md](./READINESS.md). For the operational runbook (kill switch, recovery, env vars), see the same file.

## Stack

- **Next.js 14** (App Router, output: standalone)
- **TypeScript** strict mode + **Zustand** with localStorage persistence
- **Tailwind CSS** — custom glass design tokens
- **lightweight-charts v5** (TradingView) for candles + RSI
- **Yahoo Finance** for price data; **Finnhub** (optional) for news/insider/sentiment
- **Schwab Trader API** (optional) for live order routing
- **Anthropic / OpenAI** (optional) for chat

## Trading strategy primer

Out of the box, the dashboard is wired for an RSI scalping strategy:

- 250-period RSI on 1m candles, Wilder's smoothing
- Buy signal when RSI drops below 50; sell signal at RSI above 55
- Target profit at 1.5–2%
- Stop-loss management with on-chart drag handles

You can build arbitrary strategies through the Strategy Wizard (UI), the Manual Builder, or by importing a TradingView Pine v5 source via the Pine import tab.

## Important docs

- [READINESS.md](./READINESS.md) — what's wired, what's deferred, pre-flight checklist
- [DEPLOY.md](./DEPLOY.md) — Cloudflare-tunneled deployment notes
- [ENTERPRISE-ROADMAP.md](./ENTERPRISE-ROADMAP.md) — long-form roadmap
- [CLAUDE.md](./CLAUDE.md) — workflow rules for AI-assisted edits

## Common commands

```bash
npm run dev                # dev server (preserve while editing)
npm run build              # production build (don't run while dev server is up)
npx tsc --noEmit           # fast type check
npm test                   # vitest suite
curl localhost:3000/api/health   # one-shot status probe
```

## Safety

This dashboard can place real Schwab orders when a strategy is in `auto` mode. Defense in depth:

- **Master kill switch** in the header HealthBadge — blocks all live order dispatches.
- **Server-side guardrails**: `SCHWAB_MAX_ORDER_NOTIONAL`, `SCHWAB_MAX_ORDERS_PER_DAY`, `SCHWAB_SYMBOL_ALLOWLIST` reject orders before they hit Schwab.
- **Daily P&L caps**: in-app guardrails pause strategies on configurable trade-count or loss-limit breaches.
- **Account pin**: set `SCHWAB_ACCOUNT_HASH` to lock the dashboard to one account.

Read the pre-flight checklist in [READINESS.md](./READINESS.md) before flipping any strategy to `auto`.

## License

Personal-use project. No license granted for redistribution.
