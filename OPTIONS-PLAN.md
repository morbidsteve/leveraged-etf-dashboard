# Options trading — full implementation plan

This is a planning doc, not yet committed scope. Adding options is roughly
**10–14 sprints of work** (≈3–5 focused weeks). It's a fundamentally
different domain than RSI scalping equities — different data shapes,
different broker endpoints, different risk model, different strategy
mental model. Read all of Phase 1 before deciding whether to commit.

---

## What makes options different

**Equity**: one symbol, one bid/ask, one P&L curve (linear). Risk = position
size × stop distance.

**Option**: per underlying you get a *chain* — every (expiration, strike,
call/put) is its own contract with its own bid/ask, IV, Greeks, open
interest, volume. The chain for SOXL alone has ~500 active contracts on
any given day. A "position" is rarely one contract; it's typically 2–4 legs
that net into a defined-risk structure.

Key new concepts:
- **Greeks**: delta (Δ direction), gamma (Δ-of-Δ), theta (time decay), vega
  (vol sensitivity), rho (rate sensitivity). All position-level, all
  changing every tick.
- **Implied volatility**: the market's forward vol expectation per
  contract. Drives most of the price after intrinsic value.
- **Multi-leg structures**: vertical spreads, calendars, iron condors,
  butterflies, straddles. Each has its own P&L curve and breakevens.
- **Time decay**: positions age. A position that's neutral on direction
  can still profit (theta) or lose (negative theta).
- **Margin / buying power**: short-options structures consume buying power
  defined by max loss, not notional.

The dashboard's current strategy engine assumes linear directional P&L. It
won't work for options without significant DSL extensions.

---

## Phase 1 — Data & read-only chain viewer · 3 sprints

Get options data flowing in, render the chain. No trading yet.

### Sprint O1 (M) — Schwab options chain API

**What we build:**
- `src/lib/schwab/options.ts`:
  - `getOptionChain(symbol, opts)` → calls Schwab's `/marketdata/v1/chains?symbol=...`. Returns full chain keyed by expiration → strike → { call, put }.
  - Per-contract data: symbol, bid, ask, last, mark, volume, openInterest, IV, delta, gamma, theta, vega, rho, daysToExpiry.
  - `getOptionQuote(contractSymbol)` for single-contract refresh (e.g. tracking an open position).
- `src/types/options.ts`: `OptionContract`, `OptionChain`, `OptionExpiration`, `OptionLeg` interfaces.
- `src/app/api/options/chain/route.ts`: thin wrapper around the Schwab call. Caches 30s by (symbol, expiration) — chains are big (hundreds of strikes) and don't change THAT fast intra-bar.

**Why it's bigger than it looks:** Schwab's chain API returns deeply nested JSON with separate maps per expiration. Schwab also rate-limits chains more aggressively than quotes. We need a streaming/throttle strategy.

**Acceptance:** Can call the API and get back a parsed SOXL chain with at least 10 expirations × 30 strikes. Greeks are live, not stale.

### Sprint O2 (M) — Options chain viewer UI

**What we build:**
- `src/components/Options/OptionChainViewer.tsx`: tabular chain layout. Calls vs Puts side-by-side, expirations as horizontal tabs, strikes vertical. Visible columns toggleable: bid/ask, IV, OI, volume, delta, theta. ATM strike highlighted; ITM contracts shaded.
- `src/components/Options/ExpirationPicker.tsx`: 7d / 14d / 30d / 60d / quarterly quick-buttons + custom date picker.
- New drawer view `'options'` with a per-ticker chain picker. Default to underlying chart's ticker.
- Sticky header so strikes/expirations stay visible while scrolling.

**Why now:** The chain viewer is the foundation. Every other options feature (trading, analytics, strategies) needs it as the data picker.

**Acceptance:** Open Options drawer → pick SOXL → see live chain with toggleable columns. ATM marked. Click a contract → expanded panel shows full Greek breakdown.

### Sprint O3 (S) — Volatility surface + IV percentile

**What we build:**
- `src/lib/options/volatility.ts`: from a chain snapshot, compute IV term structure (IV by expiration at ATM) and IV smile (IV by strike at one expiration). Pure math.
- `src/components/Options/VolPanel.tsx`: small volatility surface chart (term structure curve + smile).
- IV percentile (current ATM IV vs trailing 252-day range) — requires either a separate IV history fetch or computing locally from cached chain snapshots over time. Start with "live IV only" then add history later.

**Why:** "Sell options when IV is high, buy when IV is low" is the core options edge. Without a percentile readout the user is guessing.

**Acceptance:** SOXL chain shows IV percentile (e.g. "IV: 38% · 65th percentile YTD"). Term structure visible.

---

## Phase 2 — Manual trading · 3 sprints

Place options orders manually. No auto-mode yet.

### Sprint O4 (M) — Single-leg order ticket

**What we build:**
- `src/components/Options/OrderTicket.tsx`: dialog with action (Buy to open / Sell to open / Buy to close / Sell to close), contract ref, quantity (number of contracts, each = 100 shares), price input (with NBBO mid as default), duration.
- Order preview: estimated debit/credit, max profit, max loss, breakeven.
- Submit via new server route `/api/schwab/options/place` → `buildOptionOrder()` JSON for Schwab's TRADER API.
- Reuse existing `orderGuardrails.ts` with new option-specific caps:
  - `SCHWAB_MAX_OPTION_PREMIUM` (default $500)
  - `SCHWAB_MAX_OPTIONS_PER_DAY` (default 10)
  - `SCHWAB_OPTION_SYMBOL_ALLOWLIST` (defaults to underlying allowlist)
- Audit log entries flagged `kind: 'option'`.

**Why:** Trading single contracts is the gateway. Every multi-leg strategy is a sum of single-leg actions internally.

**Acceptance:** Click a strike → ticket opens with sensible defaults → submit → broker order appears in audit log + Schwab's order book.

### Sprint O5 (L) — Multi-leg strategy builder

**What we build:**
- `src/components/Options/StrategyBuilder.tsx`: drag legs from the chain into a "ticket basket." UI shows P&L curve at expiration as legs are added (D3/SVG, no chart library needed for static curves).
- Pre-built templates: **Vertical** (bull call / bear put / bull put / bear call), **Iron condor**, **Calendar**, **Diagonal**, **Straddle**, **Strangle**. Each is a guided picker that fills the leg slots from the active chain.
- Net debit/credit calculation, max profit, max loss, breakeven points (1 or 2), probability of profit (using the legs' deltas as a rough proxy).
- Server-side validation: legs are on the same underlying, expirations are valid, ratios match the template (e.g. 1:1 for verticals).

**Why:** Real options edge is in spreads, not single contracts. Most retail "I lost everything on a 0DTE call" stories are people trading singles when they should have been spreading.

**Acceptance:** Build an iron condor on SOXL with one click → see the four legs auto-picked at sensible deltas → P&L curve renders → submit as a single combo order to Schwab.

### Sprint O6 (M) — Position store + management modal

**What we build:**
- `src/store/optionsStore.ts`: separate store for options positions. Each position is an array of legs with shared metadata (`structure: 'vertical' | 'iron_condor' | ...`, openedAt, costBasis, currentPrice).
- Live valuation: subscribe to per-contract quotes for legs in open positions, sum into total position P&L. Greeks aggregated across legs (sum delta/theta/vega; gamma sum is informative).
- `src/components/Options/PositionRow.tsx` + management modal:
  - **Close** at market or limit
  - **Roll** to a later expiration (close current, open same structure 1+ DTE further out)
  - **Adjust** — modify one leg (e.g., narrow the spread)
  - **Take partial profit** at +25%, +50%, +75% of max profit
- Same broker-confirmation pattern as PositionActionModal for equities.

**Why:** Options need active management because of theta. A 30 DTE iron condor needs to be checked daily and rolled or closed by ~7 DTE.

**Acceptance:** Open a vertical → next session, see live value updating → click "Close at +50%" → broker order goes out, position closes.

---

## Phase 3 — Strategy DSL extensions · 3 sprints

Make the strategy engine options-aware.

### Sprint O7 (L) — Options-aware ValueRefs + conditions

**What we build:**
- Extend `ValueRef` union with options-specific values:
  - `{ kind: 'iv'; period: 'live' | 'percentile_252' }`
  - `{ kind: 'delta'; underlying: string; daysToExpiry: number; type: 'call' | 'put' }`
  - `{ kind: 'days_to_expiry' }` (for position-relative conditions)
  - `{ kind: 'position_pnl_pct' }` (for "close at +50%" rules)
- Extend evaluator + values.ts to resolve them from a per-tick options data context.
- DSL strings: `iv(percentile_252) > 70`, `delta(SOXL, 7d, put) <= -0.10`, `days_to_expiry < 7`.

**Why now:** Without options-aware conditions, you can't write "Sell a 10-delta put on SOXL when IV > 70th percentile." The whole strategy edge is in those exact conditions.

**Acceptance:** Build a strategy in the wizard with `iv(percentile_252) > 70 AND delta(soxl, 7d, put) <= -0.10` → it parses, evaluates, and fires when both are true.

### Sprint O8 (M) — Strategy → contract resolution

**What we build:**
- `src/lib/strategy/optionsResolver.ts`: when a strategy fires for an underlying with options enabled, the resolver picks specific contracts from the live chain matching the rules. E.g., "10-delta put 7 DTE" → finds the put with delta closest to -0.10 in the nearest expiration ≥ 5 DTE.
- New strategy field: `Strategy.optionsRule?: OptionsResolverRule`. Backward-compat — strategies without it stay equity-only.
- Wizard adds a 4th option in the entry-action step: "Equity buy" / "Sell to open option" / "Buy to open option" with structure picker.

**Why:** Lets the user say "when conditions fire, sell a 10-delta put credit spread" without picking specific strikes manually each time.

**Acceptance:** Strategy fires → resolver picks the 10-delta SOXL put automatically → manual-confirm modal shows the resolved contract → user accepts → broker order goes out.

### Sprint O9 (M) — Options backtest

**What we build:**
- Extend `runBacktest()` to accept an options resolver. For each fire, mark the contract that *would have been* chosen using historical chains.
- Historical options data is the hard part — Schwab's API doesn't easily serve historical chains. Three options:
  1. Capture chains live every market close into a daily snapshot file (slow but free)
  2. Use a paid data provider (CBOE LiveVol, ORATS) — adds cost
  3. Approximate: use the equity backtest's IV from VIX as a proxy — fast but coarse
- Start with option 3 (VIX-as-proxy) for the MVP; add 1 (snapshot capture) as a follow-up.

**Why:** Without backtest, paper trading options is the only way to validate strategies, and it takes months because of the long expirations.

**Acceptance:** Backtest a "sell 10-delta put weekly when IV > 60th" strategy on a year of SOXL history. Equity curve renders. Win rate, avg P&L per trade.

---

## Phase 4 — Polish & analytics · 2 sprints

Make options ergonomic.

### Sprint O10 (M) — P&L curves + Greeks dashboard

**What we build:**
- Per-position P&L curve at expiration, plus a "now" curve (using current Greeks). Renders alongside chart.
- `src/components/Options/GreeksHeatmap.tsx`: aggregate delta/theta/vega across all open options positions. Summary card at top of the Options drawer.
- "Days to live" indicator per position with color coding (green > 21 DTE, amber 7–21, red < 7).
- Profit-target and stop-loss alerts: "ping me when this position hits +50%" using the AlertRule infra from Sprint 12.

**Acceptance:** Open Options drawer → top of drawer shows aggregate Greeks ("net delta -0.45, net theta +$23/day"). Each position shows P&L curve + days-to-live.

### Sprint O11 (M) — Risk engine + buying-power tracker

**What we build:**
- `src/lib/options/risk.ts`: from a position's structure, compute max loss, max profit, breakevens, margin requirement. Pure math, deterministic.
- "Available buying power" indicator pulled from Schwab account data. When opening a new position, show projected BP usage *before* submitting the order.
- Per-strategy BP cap so a runaway auto-mode strategy can't consume the whole account: `Strategy.maxBuyingPowerPct`.
- Hard-stop: if total BP usage > configured cap, all new entries are blocked (server-side, in `orderGuardrails.ts`).

**Acceptance:** Try to open a position that would exceed BP cap → blocked with a clear message. Open positions show their BP consumption.

---

## Phase 5 (stretch) — Pro features · 3 sprints

Defer until everything above is working.

### Sprint O12 — Streamer integration for live Greeks
Schwab WebSocket streamer pushes live options quotes. Integrate so position Greeks update without polling. Reduces broker rate-limit pressure for users tracking many positions.

### Sprint O13 — Earnings + IV crush avoidance
Pull earnings calendar (already wired in Sprint 19). For any open option position whose expiration straddles an earnings date, flag prominently. Auto-warn before opening positions through earnings without explicit acknowledgment.

### Sprint O14 — Probability calculator
"What's the probability this SPY iron condor expires worthless?" Black-Scholes-based using the position's legs' Greeks. Both at-expiration and at-any-touch flavors.

---

## Cross-cutting concerns

These touch every phase and need to be designed up front:

### Schwab options API specifics
- Authorization scope: confirm the existing OAuth scope covers options trading (`tradeoptions` if Schwab requires it explicitly).
- Order JSON for multi-leg: Schwab uses `complexOrderStrategyType` ("VERTICAL" | "IRON_CONDOR" | etc.) plus `orderLegCollection` with paired BUY/SELL legs. Document the JSON shapes per strategy type in `src/lib/schwab/options.ts`.
- Settlement/exercise: cash-settled vs share-settled — both happen automatically at the broker but P&L semantics differ. Record settlement method per contract.

### State model
- Options positions are NOT a single Trade row. The optionsStore needs its own type: `OptionPosition { id, legs: OptionLeg[], structure, openedAt, closedAt, costBasis, currentValue, ... }`.
- Mixing equity and options trades in the journal: extend the existing `Trade` interface with a discriminated union, or keep them as parallel stores. Recommend parallel stores for cleaner type narrowing.

### UI scope
- Options drawer parallel to existing drawers (don't shoehorn into Strategies). Has its own subviews: Chain, Positions, Strategies, Backtest.
- The mobile bottom-tab bar gets a 6th tab "Options" or replaces "More." Decide once Phase 1 is on-screen.

### Risk education
- First-time options users see a warning modal explaining defined-risk vs unlimited-risk structures. Default-disable any structure that has unlimited loss potential (naked calls/puts). Require an explicit env var + typed confirmation to enable them.
- Settings → Options has a "Max contracts per order," "Max DTE," "Allowed structures" allowlist. Defaults conservative.

### Tests (extend Vitest suite)
- Pure functions: `src/lib/options/volatility.ts`, `src/lib/options/risk.ts`, `src/lib/strategy/optionsResolver.ts`. Add ~30 tests.
- Schwab options client mocked against fixture chain JSON.
- Strategy DSL resolver against a synthetic chain with known deltas.

---

## Suggested order of operations

1. **First: Phase 1 entirely** (3 sprints). Get the chain on screen. This is the quickest "Aha — I can see options now" moment, and the foundation for everything else.
2. **Then: Sprint O4** (single-leg order ticket). Quickest "I can trade options now" moment, even before the multi-leg builder.
3. **Then: Sprint O6 + O5** (positions store, management modal, then multi-leg builder). At this point the user can manually trade options end-to-end.
4. **Then: Phase 3** (strategy DSL extensions). Now you can automate.
5. **Then: Phase 4** (analytics + risk). Quality of life + safety.
6. **Then: Phase 5** if any of those sprints prove load-bearing.

**Total**: 11 core sprints + 3 stretch. At the historical pace of 1 sprint
per session, ~14 sessions. Spread over a couple weeks.

---

## What this would NOT do (out of scope, even after all 14 sprints)

- **Futures options** (e.g. /ES, /CL options). Different API, different
  margin model. Punt.
- **Custom Greeks model**. We trust the broker's Greeks. We don't try to
  out-compute the market's IV.
- **0DTE-specific tooling**. 0DTE has its own pace and pitfalls; if you
  end up doing it heavily, the engine needs sub-second tick handling and
  the streamer integration. Address in a hypothetical Phase 6.
- **Cross-asset hedging tools** (e.g. "hedge my SOXL longs with QQQ
  puts"). Different domain; the Greeks-aggregation in Sprint O10 gets you
  most of the way there for free.

---

## Decision: commit or defer?

Before committing, the right question is *which problem options are
trying to solve.* If it's:

- **"I want defined-risk leverage on my RSI signals"** → Phase 1 + Sprint
  O4 + O6 only (5 sprints). You can manually translate a buy signal into
  a long call or put credit spread. Skip the auto-mode + DSL extensions.
- **"I want to systematically sell premium when IV is rich"** → all of
  Phase 1–3 (9 sprints). The DSL extensions are essential for this.
- **"I'm curious"** → don't commit. Watch a few weeks of paper-mode
  options on a regular broker app first. The mental shift from equities
  to options is bigger than the dashboard work.

This plan stays parked here until you decide.
