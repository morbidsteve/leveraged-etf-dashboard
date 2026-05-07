# Roadmap — Best-in-Class Leveraged ETF Trading Dashboard

> **The vision (in user's words):** *"I want to set up a buy trigger — the RSI situation I described — and a sell trigger that fires at my entry price + some percent, automatically. If I could have a system do that, I'd be a millionaire very soon."*

That's the North Star. Everything in this roadmap leads there.

This is a prioritized, iterative plan. Each tier delivers usable value on its own — we don't have to finish a tier to benefit from earlier work. Effort estimates are rough half-day units (S = ½ day, M = 1 day, L = 2–3 days, XL = a week+).

---

## North Star: A composable strategy engine

The trader should be able to write something like this once and let the system watch and act:

```
strategy "RSI scalp on SOXL"
  ticker: SOXL
  size: 1% of account risk

  ON ENTRY when rsi(period=250) crosses_below 50
    -> buy market

  ON EXIT when price >= entry_price * 1.015
    -> sell market   # the +1.5% target

  ON STOP when price <= entry_price * 0.99
    -> sell market

  COOLDOWN 5 minutes after exit
```

Once that exists, the trader composes more strategies (RSI cross + VWAP support, RSI cross with confirmation candle, etc.) and runs many in parallel across different tickers — manually-confirmed at first, fully automatic once trust is built.

To get there, we need:

1. **A condition DSL** that's expressive enough to describe these rules
2. **An evaluator** that runs the conditions against live data every tick
3. **A backtester** so the trader can validate a rule on history before going live
4. **A paper-trading mode** so the trader can run the rule live without real money first
5. **A manual-confirm execution mode** (suggest the trade; trader presses YES)
6. **A broker integration** (Schwab) for full auto-execution
7. **Hard guardrails** so a bug or a bad rule can't blow up the account

Tier 0 lays the foundations. Tiers 1–3 build the engine top-to-bottom. Tiers 4+ polish the surface around it.

---

## Honest current-state audit

### What works today
- Single-page command center: chart, watchlist, positions, RSI gauge, signal, day P&L
- Drawer system for trades log, analytics, scanner, calculator, alerts, settings
- RSI(250) / 50 / 55 defaults aligned with the live strategy
- Polished glass UI, sub-second-feeling local interactions
- Yahoo Finance polling at 1s, localStorage persistence
- Dockerized standalone deploy (156 MB image)

### What's missing (motivates the roadmap)
- **No alert engine.** `useAlertStore.addAlert` exists but nothing calls it. Settings UI saves thresholds that nothing reads. → blocks Tier 0.
- **No event/condition system.** Everything is "compute current RSI value"; there's no "did RSI just cross 50" detection at runtime. → blocks Tier 1.
- **No backtest infrastructure.** Scanner does fixed 7d/60d windows; not a real backtester. → blocks Tier 2.
- **No broker integration.** Trades typed manually. → blocks Tier 3.
- **`src/lib/indicators.ts` unused.** EMA / MACD / Bollinger / ATR exist but aren't on the chart and aren't available to conditions.
- **Pure polling, no streaming.** WebSocket would cut detection latency from ~1s to <100ms.

---

## Tier 0 — Foundations the engine will sit on

> Even before the strategy engine is built, we need these. They're useful on their own and required for everything later.

### 0.1  Live alert engine + browser notifications · **M** · 🔥

**Goal:** when any condition fires, the trader gets a notification within ~2s — even if the tab isn't focused.

This is the *transport layer* for the strategy engine. Same plumbing later carries "buy trigger fired" messages.

**Build:**
- `src/lib/alertEngine.ts` — pure function `detectCrossings(prevRSI, currRSI, config) → Crossing[]`
- `src/hooks/useAlertEngine.ts` — runs every poll, calls `addAlert()` on cross + plays sound + fires `Notification`
- `src/lib/sound.ts` — pre-loaded buy.mp3 / sell.mp3
- Service worker for notifications when tab unfocused
- Cooldown enforcement (already in settings)
- Toast slot in top bar

**Acceptance:**
- [ ] Tab hidden, RSI crosses 50 on SOXL → OS-level notification within 3s.
- [ ] Cooldown prevents repeats.
- [ ] Alerts panel populates with real entries.

---

### 0.2  Wire technical indicators into the chart · **M**

**Goal:** EMA / VWAP / Bollinger / MACD on the chart. Conditions need them.

**Build:**
- Indicator toggles in chart header
- `CandlestickChart.tsx` adds series for each
- Persist in settings store
- Expose indicator values as a context the strategy engine can read

**Acceptance:**
- [ ] All four indicators toggleable.
- [ ] VWAP available as a value the rules engine can compare against (`price > vwap`).

---

### 0.3  Position sizing calculator · **S**

**Goal:** "$X risk + Y stop = Z shares" instant answer. Required input for the strategy engine's `size:` clause.

**Build:**
- Inputs in calculator drawer: account size, risk %, entry, stop. Output: shares + exposure + R:R.
- Persist account size in settings.

---

### 0.4  Multi-ticker signal radar · **M**

**Goal:** see live BUY/HOLD/SELL state for every watchlist ticker simultaneously.

**Build:**
- Top-strip with mini-sparkline + RSI value + status dot per ticker
- Sort by "most recently fired"
- Click to switch chart

---

### 0.5  Smart polling (market-hours aware) · **S**

**Goal:** stop hammering Yahoo at 1s overnight. Faster polling = faster engine reactions during market hours.

**Build:**
- `src/lib/marketHours.ts`
- `usePriceData` reads dynamic interval
- Top-bar shows current cadence

---

## Tier 1 — Strategy Engine MVP (the centerpiece)

> Goal: the user types one strategy in plain language → the system watches live data → fires notifications when triggers hit → the user clicks YES to confirm. No real auto-execution yet (Tier 3), but the full rule lifecycle works.

### 1.1  Strategy data model + condition DSL · **L**

**Goal:** a flexible, type-safe representation of a strategy.

**Design sketch (TypeScript shape, draft):**
```ts
type ConditionLeaf =
  | { type: 'compare', left: ValueRef, op: '>' | '<' | '>=' | '<=' | '==', right: ValueRef }
  | { type: 'cross', target: ValueRef, threshold: ValueRef, dir: 'above' | 'below' }
  | { type: 'time', op: 'after' | 'before' | 'between', t: string };

type ConditionTree =
  | ConditionLeaf
  | { type: 'and', children: ConditionTree[] }
  | { type: 'or', children: ConditionTree[] }
  | { type: 'not', child: ConditionTree };

type ValueRef =
  | { kind: 'literal', value: number }
  | { kind: 'price' }
  | { kind: 'rsi', period: number }
  | { kind: 'ema', period: number }
  | { kind: 'vwap' }
  | { kind: 'entry_price' }                // only valid in EXIT/STOP context
  | { kind: 'pct_of', base: ValueRef, pct: number };  // entry_price * 1.015

type Strategy = {
  id: string;
  name: string;
  ticker: string;
  enabled: boolean;
  mode: 'paper' | 'manual_confirm' | 'auto'; // Tier 1 ships paper + manual_confirm
  size: { kind: 'shares', n: number } | { kind: 'risk_pct', pct: number, stop: ValueRef };
  entry: { when: ConditionTree, action: 'buy_market' };
  exit:  { when: ConditionTree, action: 'sell_market' };
  stop?: { when: ConditionTree, action: 'sell_market' };
  cooldownMinutes: number;
};
```

**Build:**
- `src/types/strategy.ts` — types above
- `src/lib/strategy/dsl.ts` — parser + serializer (DSL ↔ object). Start simple: forms-based UI generates the object, advanced users can hand-edit YAML / JSON.
- `src/lib/strategy/values.ts` — `evaluateValue(ref, ctx)` resolves a `ValueRef` against the current data context

**Acceptance:**
- [ ] Can construct user's example strategy as an object and round-trip it.
- [ ] Type system catches mistakes like using `entry_price` in an entry condition.

---

### 1.2  Strategy evaluator (the runtime) · **L**

**Goal:** every tick, walk through enabled strategies, evaluate triggers, fire actions when conditions hit.

**Build:**
- `src/lib/strategy/state.ts` — strategy instance state machine (`IDLE → ARMED → IN_POSITION → COOLDOWN → ARMED`)
- `src/lib/strategy/evaluator.ts` — `tick(strategy, prevCtx, currCtx) → Action[]`. Includes proper crossing detection (needs *previous* tick context, not just current).
- `src/hooks/useStrategyEngine.ts` — driver hook, runs on every price update, persists state to store
- `src/store/strategy.ts` — Zustand store for strategies + per-strategy state

**Per-strategy lifecycle:**
1. `IDLE` (disabled or in cooldown)
2. `ARMED` (waiting for entry condition) → entry condition fires → emit `BuyAction`
3. `IN_POSITION` (waiting for exit OR stop condition) → either fires → emit `SellAction`
4. `COOLDOWN` for `cooldownMinutes`, then back to `ARMED`

**Acceptance:**
- [ ] Construct user's example. Strategy hand-tested with synthetic ticks: entry fires when RSI crosses 50, exit fires when price hits entry × 1.015. ✅
- [ ] State machine is deterministic — given a tick stream and starting state, we always get the same actions.
- [ ] Multiple strategies on different tickers run independently.

---

### 1.3  Paper trading mode · **M**

**Goal:** strategies in paper mode "execute" virtually — fills at the current price, P&L tracked, no real money. Lets the trader build confidence in a strategy before flipping the auto-execute switch.

**Build:**
- `src/store/paperPortfolio.ts` — virtual portfolio (cash + positions + closed trades)
- When evaluator emits `BuyAction` in paper mode → record a paper entry at current price
- When `SellAction` fires → record a paper exit, compute P&L
- Paper portfolio shown alongside the real portfolio (clearly labeled)

**Acceptance:**
- [ ] Run user's strategy in paper mode for one full day; review the simulated trades vs. real prices.
- [ ] Paper P&L visible and tracked separately.

---

### 1.4  Manual-confirm execution mode · **M**

**Goal:** when a strategy in manual mode fires, the trader gets a big modal: "BUY SOXL — 125 shares @ $24.50? [YES] [NO] [SNOOZE 30s]". Pressing YES copies a ToS-ready order ticket to clipboard (or, when Tier 3 lands, sends to Schwab).

**Build:**
- `src/components/StrategyConfirmModal.tsx` — full-screen confirm with sound + vibration + 30s timeout (auto-dismiss)
- Order ticket includes ticker / side / shares / price / suggested stop / target — formatted for ToS paste
- Records the *suggested* trade in the trade log marked "auto-suggested, manually confirmed"

**Acceptance:**
- [ ] Strategy fires → modal up + sound. YES button works. Trade logged. NO button works. Auto-snooze works.

---

### 1.5  Strategy builder UI (forms-first) · **L**

**Goal:** non-developer-friendly UI to compose a strategy. Type-safe under the hood; readable on the surface.

**Build:**
- New drawer / route: list of strategies + "+ New Strategy" button
- Strategy form layout:
  - Header: name, ticker, enabled toggle, mode (paper / manual-confirm / [auto disabled])
  - **Entry section:** condition builder ("when [RSI(250)] [crosses below] [50]"), size selector
  - **Exit section:** condition builder with `entry_price` available as a value ("when [price] [>=] [entry_price * 1.015]")
  - **Stop section** (optional): same
  - **Cooldown:** minutes input
- Each condition is a tree: AND/OR group, leaves are comparisons
- Pre-built templates: "RSI cross + % target" (this is user's exact strategy), "VWAP bounce", "Mean reversion", etc.
- Live preview: "If this strategy were running now, what state would it be in?"

**Acceptance:**
- [ ] Build user's exact RSI-cross + 1.5%-target strategy in <2 minutes using the form.
- [ ] Save → strategy persists, shows up in strategy list.
- [ ] Toggle enabled → engine starts evaluating it on next tick.

---

### 1.6  Strategy event log · **S**

**Goal:** chronological log of every strategy event. Critical for debugging "why didn't my strategy fire?".

**Build:**
- Per-strategy event stream: `{ time, type: 'state_change' | 'condition_eval' | 'action_emitted', detail }`
- Visible in strategy detail view
- Filterable; last 24h kept by default

**Acceptance:**
- [ ] Walk through a strategy's day from arming to entry to exit by reading the event log.

---

## Tier 2 — Strategy Engine Power

> The engine works. Now make it trustworthy and powerful.

### 2.1  Full historical backtester · **L**

**Goal:** "Run this strategy on SOXL from Jan → today. Show every signal, P&L per trade, win rate, max drawdown, equity curve."

The strategy object from Tier 1.1 plus the evaluator from Tier 1.2 are exactly what we need to backtest. Same code path, just driven by historical candles instead of live ticks.

**Build:**
- `src/lib/strategy/backtest.ts` — feeds historical candles into the evaluator one bar at a time
- `POST /api/backtest` — accepts strategy + ticker + date range, returns trade list + metrics
- `BacktestPanel.tsx` — equity curve, trade table, vs buy-and-hold comparison
- Parameter sweep: "what's the win rate if I change oversold from 50 to 45 to 40?"

**Acceptance:**
- [ ] Backtest user's exact strategy on SOXL Jan→today in <5s.
- [ ] Win rate, profit factor, max DD all reported.
- [ ] Side-by-side comparison of two parameter sets.

---

### 2.2  Strategy library + sharing · **S**

**Goal:** save / clone / share strategies. Tag with notes ("works in trending days, fails in chop").

**Build:**
- Store has a `strategies` array (already in Tier 1.1)
- Export/import as JSON (paste-friendly)
- Built-in template library

---

### 2.3  Advanced conditions (multi-timeframe, sequence, time-window) · **M**

**Goal:** richer rules.

Examples that require new condition types:
- *Multi-timeframe confluence:* `rsi(250, tf=1m) < 50 AND rsi(50, tf=5m) < 60`
- *Sequence:* `rsi crossed below 50 AND in the last 5 candles, price has not gone below entry × 0.99`
- *Time window:* `time between 9:35 and 11:00 ET` (no signals in choppy lunchtime)
- *Volume:* `volume(last_minute) > avg_volume(20) × 1.5`

**Build:**
- Extend `ConditionLeaf` and `ValueRef` types
- Update evaluator + builder UI

---

### 2.4  Strategy A/B testing live · **M**

**Goal:** run two variants of the same strategy in paper mode side-by-side, compare 30-day P&L.

**Build:**
- "Clone strategy" button
- Comparative paper-portfolio view

---

## Tier 3 — Real auto-execution (Schwab)

> Strategies graduate from `manual_confirm` to `auto` mode. **Highest-risk tier** — extra care on guardrails.

### Schwab API research findings (verified 2026-05-07)

Before committing engineering effort to Tier 3, I researched the Schwab developer docs + community references. Summary of what's confirmed:

**✅ Feasible for our use case:**
- OAuth 2.0 flow for individual retail traders. App registration is free; approval takes 1–3 business days. Application description matters: "personal trading automation" gets approved; "advanced algorithmic trading system" tends to get flagged for institutional review.
- Read endpoints: positions, balances, order history, transaction history, account preferences.
- Write endpoints: place / replace / cancel orders for stocks and options.
- Order types: market, limit, stop, stop-limit, trailing-stop, trailing-stop-limit.
- Composite orders: **OCO** (one-cancels-other) and **TRIGGER** (one-triggers-other). A bracket order = `TRIGGER(entry) → OCO(target, stop)` composed manually. Schwab doesn't expose "bracket" as a single primitive but the composition pattern is standard.
- Streaming: native WebSocket-based Streamer API. Confirmed working streams: Level-1 quotes (bid/ask/volume), OHLCV charts (minute bars), Level-2 order book, account activity, screener. **This means we don't need a third-party WS provider (Finnhub / Alpaca) — Schwab's own streamer covers Tier 5.1.**
- Rate limit: up to 120 order requests/minute/account. Way more than our RSI strategy will ever need.

**⚠️ Real constraints we must design around:**
- **7-day refresh-token cap.** Access tokens last 30 min and auto-refresh; refresh tokens last 7 days and *cannot be extended*. After 7 days the user must repeat the browser-based OAuth flow. There is **no documented workaround** — this is by design. Mitigation: keep the engine continuously running so tokens auto-refresh every ~25 min; surface a clear "re-authenticate" UX when the 7-day window expires; consider a weekly reminder.
- **Account number hashing.** API endpoints expect the *hash* of the account number, not the raw number. Get the hash from `/accounts/accountNumbers`. This is documented sparsely; we'll cache the hash on first connect.
- **Thinkorswim-enabled brokerage account required.** Most modern Schwab accounts have this turned on by default but we should verify on first connect and surface a friendly error if not.
- **No fractional shares via API.** Whole shares only. Affects nothing for SOXL/TQQQ.
- **Callback URL** must be HTTPS, ≤256 chars, exact match. For local dev, `https://127.0.0.1:8443/callback` is the standard pattern (self-signed cert).
- **Tokens must live server-side.** They cannot sit in browser localStorage — they need refreshing every ~25 min and refresh tokens are sensitive. Our Next.js server (already running in the Docker container) is the natural home. We'll add an encrypted token store (single secured JSON file on disk or, with Tier 4.1, Supabase).

**❓ Still unclear, will confirm during implementation:**
- Whether real-time streaming has per-symbol or per-account limits for retail tier.
- Whether market-data subscription fees apply (typically free for thinkorswim-enabled accounts; legacy TD Ameritrade behavior — likely free here too).
- Whether automated trading needs any explicit acknowledgement / margin agreement beyond the standard account.

**Sources:**
- [Schwab Developer Portal](https://developer.schwab.com/) (gated; full docs available after app registration)
- [The Unofficial Guide to Schwab's Trader APIs (Carsten Savage, Medium)](https://medium.com/@carstensavage/the-unofficial-guide-to-charles-schwabs-trader-apis-14c1f5bc1d57)
- [Why Charles Schwab API for automation bots (Avetik Babayan, Medium)](https://medium.com/@avetik.babayan/why-charles-schwab-api-choosing-the-right-trading-platform-for-automation-bot-6bf6a687bb83)
- [schwab-py OrderBuilder reference](https://schwab-py.readthedocs.io/en/latest/order-builder.html) — open-source Python lib, mirrors actual API
- [schwab-py StreamClient docs](https://schwab-py.readthedocs.io/en/latest/streaming.html)
- [schwab-py Authentication docs](https://schwab-py.readthedocs.io/en/latest/auth.html)
- [Lumibot Schwab broker docs](https://lumibot.lumiwealth.com/brokers.schwab.html)
- [Schwab OAuth Restart vs Refresh Token (official Schwab user guide)](https://developer.schwab.com/user-guides/apis-and-apps/oauth-restart-vs-refresh-token)
- [About the Individual Developer Role (Schwab official)](https://developer.schwab.com/user-guides/individual-developer/about-individual-developer-role)

**Bottom line:** every Tier 3 item is technically achievable. The 7-day re-auth window is the only thing that meaningfully changes how we design the auto-execution UX — and it's manageable.

### Tier 3 prerequisites (do these first, no code yet)

- **3.0a** Register a Schwab Developer Portal account (1 hour). Submit an app named e.g. "Personal RSI Trading Dashboard" with a careful description — *"personal trading automation"* phrasing, not algorithmic.
- **3.0b** Wait for approval (1–3 business days).
- **3.0c** Verify the brokerage account is thinkorswim-enabled.
- **3.0d** Set up a callback URL — for local dev, `https://127.0.0.1:8443/callback` with a self-signed cert; for prod, the real domain over HTTPS.

### 3.1  Schwab API OAuth + read-only · **L**

**Goal:** authenticate with Schwab, pull positions + transactions read-only first.

**Build:**
- Server-side OAuth 2.0 flow:
  - `GET /api/schwab/authorize` — redirects to Schwab consent screen
  - `GET /api/schwab/callback` — exchanges auth code for access + refresh tokens
  - Encrypted token store (`tokens.encrypted.json` on disk, env-var-encrypted; replaceable with Supabase in Tier 4.1)
  - Background refresh worker that calls `/oauth/token` every 25 min
  - Re-auth banner that appears in the UI when refresh token has <24h until expiry
- Account number → hash lookup cached on connect
- `/api/schwab/positions` and `/api/schwab/transactions` proxy routes
- Sync positions into the dashboard (replaces manual entry); reconcile by transaction-ID dedup
- Settings panel: Connect / Disconnect Schwab + token-status indicator (next-refresh time, days-until-reauth)

**Acceptance:**
- [ ] Click "Connect Schwab" → browser auth flow → tokens stored.
- [ ] Yesterday's SOXL trades appear in the trades log auto-populated.
- [ ] Token auto-refresh visible in logs every ~25 min.
- [ ] At day 6 of refresh-token life, UI shows clear re-auth prompt.

---

### 3.2  Order placement (manual-confirm) · **M**

**Goal:** when a strategy fires in `manual_confirm` mode, the YES button now sends the actual order to Schwab.

**Build:**
- `POST /api/schwab/orders` proxy that accepts our internal Action shape and translates to Schwab's order JSON (`session`, `duration`, `orderType`, `complexOrderStrategyType`, `orderLegCollection`, etc.)
- Order template helpers: `buildMarketOrder()`, `buildLimitOrder()`. We're targeting whole-share equity orders only — no options, no fractional.
- Audit log: every Schwab API call recorded with request, response, latency
- Surface Schwab order ID + status in the trade record; poll `/orders/{id}` until filled

**Acceptance:**
- [ ] Click YES on a strategy modal → market buy order appears in Schwab within 2s.
- [ ] Order fill confirmation reflects in trade log automatically.

---

### 3.3  Auto-execution mode · **L** · ⚠️ HIGH RISK

**Goal:** flip a strategy to `auto` and the YES is implicit; orders go automatically.

**Build:**
- Per-strategy auto-mode toggle, gated behind a confirmation that requires typing "I UNDERSTAND THE RISK"
- Hard global kill switch (always visible, big red button) → disables ALL auto strategies instantly
- Daily auto-mode loss limit (`when day_pnl < -X, disable all auto strategies until tomorrow`)
- Daily auto-mode trade-count limit
- Heartbeat: if the engine misses 3 consecutive ticks, all auto strategies pause until acknowledged

**Acceptance:**
- [ ] Auto-execute a paper-validated strategy successfully.
- [ ] Kill switch instantly halts everything.
- [ ] Loss limit auto-disables and notifies.

---

### 3.4  Bracket orders via TRIGGER + OCO composition · **M**

**Goal:** when the entry fills, target + stop go in *immediately* as broker-side orders. Even if dashboard crashes or wifi dies, Schwab holds the safety net.

**Why this matters:** Schwab API doesn't have a single "bracket" primitive — but it has `OCO` (one-cancels-other) and `TRIGGER` (one-triggers-other) strategy types. The standard idiom is:

```
TRIGGER {
  entry: BUY MARKET 125 SOXL
  triggers: OCO {
    target: SELL LIMIT 125 SOXL @ entry × 1.015
    stop:   SELL STOP   125 SOXL @ entry × 0.99
  }
}
```

Once submitted, Schwab handles the rest server-side. Our local engine just listens for fill events.

**Build:**
- `buildBracketOrder(strategy, fillPrice)` helper that emits the TRIGGER+OCO JSON
- Wire into the strategy evaluator: when `mode === 'auto'` and entry condition fires, build + submit the bracket; transition strategy state to `IN_POSITION_BROKER_MANAGED`
- Listen for Schwab account-activity stream (Tier 5.1, now folded into Tier 3) to detect fills
- Reconcile: if for any reason the bracket fails to submit after entry fills, the engine alerts loudly + offers to submit manually

---

## Tier 4 — Reduce friction

### 4.1  Cloud sync (optional Supabase) · **M**

Already have env vars in `.env.example`; just need to wire it. Phone trader logs trade → desktop sees it.

### 4.2  Mobile "trader's watch" view · **S**

`/watch` route: full-screen BUY/SELL/HOLD verdict for the current strategy, day P&L, vibration on signal. PWA so it adds to home screen.

### 4.3  Strategy preview/share via URL · **S**

Encode a strategy in a URL fragment. Share with another trader; they import with one click.

### 4.4  Trade journal with chart snapshots · **M**

Every closed trade saves a 30-candle snapshot at entry + exit. Tag setups, analyze winners vs losers visually.

---

## Tier 5 — Better data, lower latency

### 5.1  WebSocket streaming (Schwab Streamer) · **M** · *consolidated with Tier 3*

Cut detection latency from ~1s to <100ms. Same change reduces Yahoo rate-limit risk.

**Update from Schwab API research:** Schwab's own Streamer API provides L1 quotes, OHLCV bars, L2 order book, and account activity over WebSocket — included with the same OAuth credentials we'll already have for Tier 3. We don't need a third-party provider (Finnhub / Alpaca) at all. This effort folds into Tier 3.1: once we're connected, we wire `LEVELONE_EQUITIES` and `CHART_EQUITY` subscriptions to replace Yahoo polling for any ticker we care about.

For users who never connect Schwab, Yahoo polling remains the fallback.

### 5.2  Pre-market / extended-hours data · **S**

Toggle to include pre/post candles. Critical for catching news-driven moves.

### 5.3  News & catalysts feed · **M**

Per-ticker headline strip; lets the trader skip "fade the news" trades.

### 5.4  Cache layer for historical candles · **S**

Backtest hits Yahoo every run; cache historical candles in IndexedDB. Faster sweeps, lower API pressure.

---

## Tier 6 — Discipline & risk

### 6.1  Hard daily guardrails · **S**

Max trades/day, max loss/day. When hit, all strategies (including paper) lock until tomorrow. The point is friction.

### 6.2  Stop-loss visualization on chart · **S**

Drag horizontal stop lines per open position. Engine watches them. Persisted on the trade record.

### 6.3  Sector / correlation exposure · **M**

Static correlation matrix for watchlist. Warns "long SOXL + TQQQ = effective 6x risk-on bet." Critical when running multiple auto-strategies.

### 6.4  Replay mode · **L**

Scrub any past trading day candle-by-candle to study setups (and verify a strategy's would-have-fired moments).

---

## Tier 7 — Stretch / experimental

### 7.1  ML signal scoring · **XL**

Train a small gradient-boosted model on backtest output. Features: RSI value, RSI rate-of-change, VWAP relation, time-of-day, volatility regime. Predict P(target_hit_before_stop). Surface as "Confidence: 73%" next to each fired signal.

### 7.2  Strategy marketplace · **XL**

Public, curated strategy library with backtest stats. Clone any. Voting / commentary. (Far future.)

### 7.3  Multi-broker support · **L**

After Schwab works, abstract the broker interface; add Alpaca, Tradier, IBKR. User can switch brokers without losing strategies.

---

## Suggested first sprint (concrete, ship-able in ~3 days)

To turn the dashboard into something that *catches* the trade instead of just *showing* it:

1. **Tier 0.1** (alert engine) — without this, nothing else fires.
2. **Tier 0.2** (indicators wired) — needed by conditions.
3. **Tier 1.1 + 1.2 + 1.3 + 1.4** (strategy data model + evaluator + paper mode + manual-confirm modal) — a working strategy engine with paper trading and manual confirmation. By the end of this sprint, the user can construct their *exact* RSI-cross + 1.5%-target strategy as their first strategy and run it in paper mode for a day.

After that, **Tier 1.5 + 1.6** (strategy builder UI + event log) finishes the first usable engine and **Tier 2.1** (backtester) delivers the highest-leverage validation tool. **Tier 3** (Schwab API) is when the dashboard stops being a tool and becomes an *autopilot*.

---

## Tracking

This file is the source of truth. As items ship: ✅ + date + commit ref. New ideas append to the right tier; if a tier outgrows itself, we split it.
