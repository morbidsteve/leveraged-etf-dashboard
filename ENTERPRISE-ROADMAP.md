# Enterprise Roadmap — every feature on the table

Where we are: ~30 sprints shipped (RSI scalping → multi-ticker strategies →
options Phase 1-5 → cross-asset triggers → Cmd+K control surface). 120
tests, ~7000 lines, zero broken tests. Solid foundation.

This document catalogs every feature worth considering to take the
dashboard from "great personal scalping tool" to "full enterprise-grade
trading platform." Organized in 7 tiers by dependency + value.

**Read top-to-bottom for prioritization.** Each tier assumes the previous
tier is in place. Pick a tier to commit to, not individual items in
isolation — they compound.

---

## Tier 1 — Polish & Core Strength · "make what exists bulletproof"

Don't add new domains until the existing ones are truly tight. Estimated
8–12 sprints.

### 1.1 Reliability
- **Server-resident strategy worker (full)** — currently shadow-runs only.
  Wire actual broker execution + reconciliation with browser engine
  (avoid duplicate fires when both run).
- **Schwab order status polling loop** — already have the endpoint; add
  the client-side polling that updates strategy runtimes with actual fill
  prices (vs limit prices submitted).
- **Bracket OCO submission on auto-mode buys** — broker-side safety net.
- **Schwab transaction sync** — UI button that pulls yesterday's trades
  into the journal automatically.
- **Position reconciliation** — Schwab vs internal state daily job;
  alert on mismatch.
- **Engine restart resilience** — strategies should resume cleanly after
  Docker container restart (state persistence verified).
- **Streamer integration** — replace polling with Schwab WebSocket
  streamer for live quotes + Greeks. Hugely reduces broker rate-limit
  pressure.

### 1.2 Test Coverage
- Component tests (Vitest + Testing Library) for the major panels
- E2E smoke (Playwright) for critical flows: open trade → close → broker
- Coverage report in CI; fail under 70%
- Snapshot tests for the chart rendering
- Backtest determinism tests against fixture data

### 1.3 Observability
- Structured logging from server (JSON, with request IDs)
- Sentry integration for error tracking
- Performance monitoring (RUM for the chart)
- Strategy-engine self-diagnostic dashboard (tick latency, evaluation
  errors, missed ticks)
- Health-check endpoint enriched with engine status

### 1.4 UX Polish
- Drag stops on chart (currently can edit numerically)
- Confirmation toasts on EVERY mutation (already partial)
- Skeleton loaders matching real content shape
- Success animations for strategy fires
- Keyboard nav inside drawers (Tab/Shift+Tab between fields)
- Better focus management (return focus on modal close)
- Light theme (currently dark only — partial through CSS)
- Density modes (compact / comfortable)
- Save layout views ("Open" / "After-hours" / "Vacation")

### 1.5 Mobile maturity
- Native PWA installation prompts
- iOS-style swipe gestures in the watchlist rail
- Apple Watch complication (live RSI of selected ticker)
- Better push notification handling
- Offline mode (read-only on cached data)

---

## Tier 2 — Enterprise Foundations · "more than one user can use it"

Required to even begin selling this. Estimated 10–15 sprints.

### 2.1 Multi-user
- Auth (email/password, magic link, then SSO: Google, Microsoft, Okta)
- Per-user data isolation in localStorage → server-side persistence
- Shared workspace concept (team account)
- Permission roles: viewer / trader / admin
- Audit log: who did what, when, on which strategy

### 2.2 Server-side persistence
- Migrate from localStorage to a database (Postgres recommended)
- Store: trades, strategies, paper history, alert rules, settings, watchlists
- Multi-device sync — change strategy on phone, see it on desktop
- Backup/restore at the user level

### 2.3 API access
- REST API for everything (currently web-app-only)
- API keys per user
- Rate limiting per key
- Webhook outbound (POST trade events to user's URL)
- Webhook inbound (third-party signals trigger strategies)
- OAuth 2.0 server (let other apps integrate)

### 2.4 Operational
- Multi-region deployment (us-east, us-west, eu)
- HA failover
- Backup / disaster recovery
- Compliance attestations (SOC 2, ISO 27001 if pursuing institutional)
- On-call rotation tooling
- Release management (canary deploys, feature flags)

### 2.5 Billing
- Subscription tiers (free / pro / enterprise)
- Usage tracking (API calls, paper backtests, options orders)
- Stripe integration
- Per-seat pricing for teams
- Invoicing for enterprise

---

## Tier 3 — Data Depth · "so it's not just Yahoo + Schwab"

Pro traders need more data than retail. Estimated 8–12 sprints.

### 3.1 Real-time streaming
- Schwab Streamer (already foundation in place — wire it)
- Polygon real-time feed (separate broker decision)
- IEX cloud (cheaper alternative for non-options)
- Tick-level data option (not just 1m bars)
- Order book / Level 2

### 3.2 Historical depth
- Historical options chains (ORATS or CBOE LiveVol — paid, ~$50-200/mo)
- Tick-level historical (Polygon / IQFeed)
- Multi-decade equity history (currently Yahoo, ~25 years)
- Splits/dividends adjusted historical
- Survivorship-bias-free stock universe

### 3.3 Alternative data
- News + sentiment (Finnhub already wired; expand to BenzingaAPI / NewsAPI)
- Earnings transcripts + AI summarization
- Insider transactions (Form 4 filings)
- Institutional ownership (13F quarterly)
- Short interest reports
- Regulatory filings (10-K, 10-Q, 8-K full text + AI summary)
- Dark pool prints
- Twitter/X sentiment via Cashtags
- Reddit sentiment (r/wallstreetbets etc.)
- Options unusual activity scanner

### 3.4 Asset coverage
- Futures (/ES, /NQ, /CL, /GC) — different margin/contract model
- Forex (FX pairs)
- Crypto (Coinbase + Kraken APIs)
- Bonds / fixed income
- International stocks (LSE, TSE, etc.)
- Mutual funds with look-through to underlyings
- Custom indices (build your own)

### 3.5 Macro data
- Economic calendar (already partial via Finnhub earnings)
- Fed rate decisions
- CPI / PPI / unemployment / GDP releases
- Treasury auctions
- IPO / spinoff calendar
- Event-driven backtest support (FOMC days, CPI days)

---

## Tier 4 — Strategy Sophistication · "stop being just RSI"

Where institutions live. Estimated 12–18 sprints.

### 4.1 Indicator library
- Custom indicator authoring (write JS/TS in a sandboxed editor)
- Community indicator marketplace
- Pine Script importer (TradingView's syntax)
- 100+ classical indicators (Stochastic, ATR, ADX, Ichimoku, Heikin-Ashi,
  Renko, etc.)
- Statistical indicators (Z-score, percentile rank, kurtosis)
- Volume profile / TPO / market profile
- Order-flow indicators (cumulative delta)
- Composite indicators (combine N into one)

### 4.2 Pattern recognition
- Chart patterns (head & shoulders, triangles, wedges, flags)
- Candlestick patterns (engulfing, hammer, morning star, etc.)
- Harmonic patterns (Gartley, butterfly, bat)
- Support/resistance auto-detection
- Trend-line auto-detection
- Pivot points (Fibonacci, Camarilla)
- Elliott wave counting

### 4.3 Multi-strategy / portfolio
- Portfolio-level risk caps (max correlated exposure)
- Cross-strategy capital allocation (Kelly, equal-weight, vol-targeted)
- Strategy blending (weight signals from N strategies into one decision)
- Markowitz mean-variance optimization
- Risk parity allocation
- Factor exposure tracking (size, value, momentum, quality, low-vol)
- Hedging strategies (VIX calls when long beta exposure)

### 4.4 Adaptive / regime-aware
- Regime detection (bull / bear / sideways / high-vol / low-vol)
- Per-regime strategy parameters
- Volatility-targeted position sizing
- Correlation-aware sizing
- Walk-forward analysis (rolling re-optimization)
- Out-of-sample validation
- Live A/B testing infrastructure
- Strategy decay detection (alert on win-rate drop)

### 4.5 ML / AI
- LLM strategy assistant (chat: "build me a strategy that..." → ConditionTree)
- Backtesting via natural language ("how would I have done buying every
  RSI cross on SOXL in 2024?")
- Signal confidence scoring (ML model trained on backtest data)
- Pattern classifier (computer vision on chart images)
- Sentiment-aware entry timing
- Reinforcement learning agents (long-tail)
- Genetic algorithms for parameter discovery
- Time-series forecasting (ARIMA / LSTM / Transformer)
- Anomaly detection (alert when conditions out-of-distribution)

### 4.6 Backtest sophistication
- Realistic transaction costs (commission, spread, slippage, market impact)
- Multiple cost models (fixed, per-share, percentage)
- Liquidity constraints (can't fill 100k shares of an illiquid stock)
- Borrow availability for shorts
- Realistic options fills (mid-spread vs limit)
- Walk-forward optimization
- Monte Carlo robustness testing
- Out-of-sample / in-sample split
- Cross-validation across regimes
- Equity curve attribution by signal type
- Per-trade Greeks attribution (for options strategies)

---

## Tier 5 — Pro Execution · "for serious size"

Where you stop hand-clicking buttons. Estimated 10–15 sprints.

### 5.1 Smart execution
- TWAP / VWAP execution algorithms
- Iceberg orders
- Dynamic limit-order placement (chase the spread)
- Smart order routing across venues
- Slippage tracking + analytics
- Pre-trade impact estimation
- Post-trade transaction cost analysis (TCA)

### 5.2 Multi-broker
- Alpaca integration (commission-free, well-documented API)
- Tradier integration
- Interactive Brokers (TWS / Gateway)
- Tastytrade (options-focused)
- Robinhood (community demand, public-API limitations)
- Crypto: Coinbase Pro / Kraken / Binance.US
- Multi-broker arbitrage helper

### 5.3 Order types
- Trailing stops (broker-managed, not engine-managed)
- Conditional orders (one-triggers-other chains, properly nested)
- Time-based orders (sell at 3:55pm regardless)
- Volume-triggered orders ("sell when volume spikes 3σ")
- Spread orders (calendar / diagonal as single order)
- Algorithmic order types (broker's algo families)

### 5.4 Direct market access
- Cheaper / faster than broker API for size
- FIX protocol support
- Co-located deployment option (~5ms latency to NY exchanges)
- Custom matching for cross trades (internal liquidity)
- Hardware acceleration (FPGA-based execution — only if going seriously HFT)

### 5.5 Risk management infrastructure
- Pre-trade risk checks (margin, BP, concentration, limit checks)
- Real-time position-level Greeks for entire book
- VaR (Value at Risk) calculation (parametric + Monte Carlo)
- Stress testing (2008 / COVID / Volmageddon scenarios)
- Beta-adjusted exposure tracking
- Sector concentration limits with auto-block
- Currency exposure (for international)
- Margin call simulation
- Forced-liquidation circuit breakers

---

## Tier 6 — Compliance & Reporting · "tax season is coming"

Required for institutional and helpful for serious retail. 6–10 sprints.

### 6.1 Tax tools
- Tax-loss harvesting suggestions (with wash-sale rule awareness)
- Wash-sale tracking across all positions
- Cost-basis methods: FIFO / LIFO / Average / Specific lot
- After-tax return optimization
- IRA / 401k / taxable account differentiation
- Form 8949 generation
- Schedule D generation
- Foreign tax credit tracking (for international)
- Section 1256 contracts (futures + index options)
- Wash-sale clean-room (separate IRA from taxable)

### 6.2 Compliance / audit
- Immutable audit log (every order, fill, modification)
- Time-stamped trade rationale (was this entry random or planned?)
- Customer-supplied trade attestation
- KYC / AML for multi-tenant
- Pattern day trader tracking
- Margin maintenance tracking
- Position transparency
- Trade confirmation generation

### 6.3 Reporting
- Monthly / quarterly / annual statements
- Custom date-range performance reports
- Per-strategy / per-account / per-asset breakdowns
- Tax-software integration (TurboTax / FreeTaxUSA / H&R Block)
- QuickBooks / Quicken sync
- CSV / Excel / PDF export
- Audit-ready package (everything for a CPA in one zip)

---

## Tier 7 — AI / Research / Discovery · "the moonshot"

Differentiation if you go after the high-end. 10+ sprints, ongoing.

### 7.1 LLM-native research
- Chat-with-your-strategies ("how did my RSI scalp do in March 2024?")
- Auto-explain trade decisions ("you bought because... here's the data")
- Strategy refinement via conversation ("make this less risky" → tweaks)
- Idea generation ("show me 5 strategies similar to mine but on
  different sectors")
- News-to-strategy translation ("Fed cut rates → which strategies
  benefit?")

### 7.2 Knowledge base
- Semantic search across all your trades + strategies
- Trade-similar lookup ("show me times like today")
- Outcome prediction ("based on history, what's likely to happen?")
- Regime explanation ("we're in a high-vol bear regime; here's
  what's worked historically")

### 7.3 Discovery
- Auto-generated strategy ideas from your trade history
- "What if I had..." counterfactuals
- Backtest-by-narrative ("backtest 'sell rallies in tech during Fed
  hikes'")
- Strategy fingerprinting (find your style)
- Signal blending suggestions ("strategies A + B together: better
  Sharpe than either alone")

### 7.4 Notebook / scripting
- Embedded JavaScript notebooks (Observable-style)
- Python via Pyodide for data scientists
- Strategy authoring in TypeScript with autocomplete on the DSL
- Backtest library exposed as importable SDK
- Plotting library (D3 / Plotly) bundled
- Notebook → strategy conversion (publish a notebook as a runnable strategy)

### 7.5 Community
- Public strategy gallery (read-only by default, share by URL)
- Verified-creator program
- Strategy review/rating
- Backtest leaderboards (with realistic costs)
- Strategy templates as paid IP
- Forum / discussion per strategy

---

## Cross-cutting infrastructure needs

### Tooling
- E2E test harness (Playwright)
- Storybook for component dev
- API documentation auto-generation (OpenAPI)
- TypeScript SDK for the API
- Python SDK for quants
- CLI tool for scripted operations

### Performance
- React Server Components migration (Next 14 supports it)
- Code-splitting per drawer
- Virtual scrolling for long lists (trade history)
- Web Workers for heavy backtests
- IndexedDB cache for backtest candles
- Service Worker for offline mode

### Security
- CSP enforcement (currently report-only via Cloudflare)
- Subresource integrity
- Rate limiting per IP / per key
- Bot detection
- 2FA / TOTP / WebAuthn
- Hardware key support (YubiKey)
- Encrypted-at-rest backup format
- Air-gapped deployment option

### Internationalization
- i18n (multiple languages)
- Multi-currency (USD, EUR, GBP, JPY, etc.)
- Local market hours per exchange
- Local broker integrations

---

## Suggested commit-or-defer matrix

If you want **"better personal scalping tool"** → Tier 1 only. ~10 sprints.

If you want **"full personal trading desk"** → Tiers 1 + 3 (data depth) +
4 (sophistication) selectively. ~25 sprints. The dashboard becomes a
serious individual quant tool.

If you want **"sell this to firms"** → All tiers, in order. 60–80 sprints.
You're building a SaaS product, not a personal app.

If you want **"institutional-grade"** → All tiers + Tier 5 hardware
acceleration. 100+ sprints. Now you're competing with QuantConnect /
TradeStation / Bloomberg AIM.

---

## What this CAN'T do, even after all 100+ sprints

- **Real edge generation** — the dashboard surfaces opportunities your
  conditions describe. It doesn't *find* edge for you. The user's RSI(250)
  scalping strategy is the edge; the dashboard executes it.
- **Replace human judgment** — auto-mode + ML can reduce friction, not
  remove the need for a thinking trader.
- **Beat institutions on speed** — without co-location + FPGAs, retail
  latency floors are ~50ms+. HFT is its own world.
- **Predict the market** — explicitly outside scope. Anyone selling that
  is lying.

---

## Recommendations

For where you are right now (~30 sprints in, solid foundation):

1. **Next 5 sprints**: Tier 1.1 reliability work. Server worker, OCO,
   transaction sync, streamer integration. Make what exists indestructible.

2. **Then evaluate**: Are you trading this for yourself? → stop here +
   maintain. Are you trying to make a product? → start Tier 2 (multi-user,
   API). Are you trying to make a career? → that's institutional; commit
   to all 7 tiers.

3. **Don't build Tier 4-7 features speculatively**. ML + advanced
   strategy sophistication look impressive but require tons of paper
   data + research time before they pay off. Earn them.

4. **Tier 6 (compliance/tax) is unsexy but high-leverage**. If you ever
   accept paying users, this is non-negotiable.

The dashboard is already in the top 1% of personal-use trading tools.
Going from there to "fantastic enterprise platform" is a years-long
project that competes with VC-funded SaaS players. Be honest about which
fight you're picking.
