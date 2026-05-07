# Forward sprint plan

Sprints 1–10 shipped (see git log). This is what's next.

Each sprint is scoped to ~½–2 days of focused work. Effort markers: **S** (≤½ day), **M** (1 day), **L** (2–3 days), **XL** (week+).

---

## Sprint 11 — Visual condition builder + live chart overlay  · **L**

The Sprint 9 deferred items. Closes the "GUI builder" loop the user asked for.

**Scope:**
- **Drag-and-drop block builder** as a third tab in the StrategyWizard (alongside "Goal cards" and "Plain English"). Drag condition blocks into AND/OR groups; nested groups via drop-on-group. Use `dnd-kit` (smaller than react-dnd, no HTML5 backend issues).
- **Live chart overlay**: in the StrategyDetail view's chart preview, mark every bar in the last hour where the strategy's entry condition would have evaluated TRUE. Green dots above bars where it fired, gray below. Hover for the resolved values.
- **Condition tree visualization**: SVG-rendered diagram of the AND/OR tree (read-only) for visual hierarchy. Lives next to the existing form-based editor as a "Tree view" toggle.

**Why now:** The wizard + NL parser cover *creating*. Block builder + chart overlay cover *understanding*. Together they kill the last "I don't know what this strategy does" friction.

**Acceptance:**
- [ ] Drag a "rsi(250) crosses below 50" block into an AND group → condition tree updates correctly
- [ ] Open a strategy → chart preview shows green dots on every historical bar where the entry condition was TRUE
- [ ] Tree view renders the AND/OR/NOT structure clearly for compound strategies

---

## Sprint 12 — Custom alerts + custom watchlists  · **M**

Power-user customization without requiring a full strategy.

**Scope:**
- **Custom alerts** (decoupled from strategies): "alert me when RSI on any watchlist ticker crosses 50" — no strategy required. Lives in the Alerts drawer. Threshold + ticker(s) + notification channel (sound/browser notif/visual toast). Cooldown per alert.
- **Custom watchlists**: named collections of tickers ("Semis", "FAANG inverse", "Meme"). Switch active watchlist from a dropdown in the top bar; signal radar + alerts respect the active list.
- **Watchlist sharing** via URL hash, parallel to strategy sharing.

**Why now:** Right now alerts only exist as side effects of strategies. Sometimes you want a simple "ping me on this RSI cross" without composing a full strategy. Watchlists are static; users with different markets want to switch.

**Acceptance:**
- [ ] Create alert "RSI(250) crosses below 50 on SOXL or TQQQ" → fires on either ticker
- [ ] Switch active watchlist → radar + monitor reflect the new tickers
- [ ] Share a watchlist via URL → recipient imports it

---

## Sprint 13 — Server-side strategy worker  · **L**

Eliminates the "tab must be open" limitation.

**Scope:**
- Background Node worker inside the Docker container that runs the strategy engine server-side. Pulls candles from Yahoo (or Schwab Streamer if connected), evaluates enabled strategies, fires actions.
- Worker state shared with browser via WebSocket or SSE so the dashboard reflects what the worker did.
- All paper trades + strategy events still persist to localStorage on the browser (worker writes to a server-side mirror; browser hydrates on next visit).
- Worker auto-pauses when market session is `closed` (matches smart-polling semantics).
- Kill switch toggles a flag the worker reads each tick.

**Why now:** Currently strategies only fire while a browser tab is open. For overnight watching or "I'm at lunch" cases, this is a real limitation. The worker pattern preserves the localStorage-only data model (no DB) but extends the engine to be tab-independent.

**Acceptance:**
- [ ] Close all browser tabs. Wait for an RSI cross. Notification fires on phone via PWA.
- [ ] Reopen browser; paper position created by the worker is reflected in the journal.
- [ ] Kill switch in the UI immediately stops the worker (verified by waiting through a known cross).

**Risks:**
- Manages duplicate-fire prevention (browser engine + worker engine running simultaneously). Solution: worker owns when active; browser engine becomes a read-only client.

---

## Sprint 14 — Schwab order status sync + bracket OCO  · **L**

Finishes the Tier 3 / Sprint 6 deferred work properly.

**Scope:**
- **Order status polling**: after `placeOrder` returns an orderId, poll `/orders/{id}` until FILLED/CANCELED/REJECTED. Update strategy runtime with actual fill price (vs limit price submitted).
- **Bracket OCO submission**: when a buy fills in auto mode, immediately submit a TRIGGER+OCO order to Schwab: target sell limit + stop loss. Both broker-managed. If our engine dies, the broker handles the safety net.
- **Schwab transaction sync**: pull yesterday's transactions on connect; auto-populate the trade log so users don't have to type their pre-app trades.
- **Order audit UI**: read `/api/schwab/audit` and render the recent-orders log as a table inside the SchwabConnectCard (or its own drawer). Shows allowed/rejected/submitted/failed history.

**Why now:** Sprint 5 wired one-shot order placement but never closed the loop on fill confirmation. For real auto trading, you need to know "did the broker actually fill this?" and "what was the actual fill price?" — both required to decide when to submit the safety stop.

**Acceptance:**
- [ ] Manually trigger a buy in auto mode → see fill price update in the strategy event log within 5s
- [ ] After fill, target + stop appear in Schwab's order book as broker-side OCO
- [ ] Connect Schwab → yesterday's SOXL trades appear in the trade log unprompted

---

## Sprint 15 — Cmd+K command palette + global keyboard nav  · **M**

Power-user UX. Common in tools like Linear, Vercel, GitHub.

**Scope:**
- **Cmd+K palette**: fuzzy search across drawers ("strat" → Strategies; "back" → Backtest), tickers ("soxl" → switches selected ticker), strategies ("scalp" → opens that strategy's details), trades, recent events.
- **Keyboard nav**: ↑↓ cycles watchlist tickers; ←→ cycles tabs in tabbed drawers (Settings, Strategy detail); Tab + Shift+Tab navigate between drawer fields properly; Enter to confirm; Esc to back/close.
- **Shortcut overlay**: `?` opens a modal listing every shortcut.
- Discoverability: small "Press ⌘K" hint in the top bar that fades after first use.

**Why now:** Active traders live on keyboards. A discoverable command palette + comprehensive keyboard nav cuts the click count significantly.

**Acceptance:**
- [ ] Cmd+K → type "monitor" → Enter → Live monitor drawer opens
- [ ] On dashboard, ↑↓ navigates watchlist tickers without touching the mouse
- [ ] `?` shows the full shortcut reference

---

## Sprint 16 — Test suite + CI  · **M**

The codebase has zero tests right now. Time to fix.

**Scope:**
- **Vitest** (faster than Jest, integrates with Next 14 cleanly).
- **Pure-function tests** first — high coverage, low effort:
  - `src/lib/rsi.ts` — RSI math against known fixtures
  - `src/lib/indicators.ts` — EMA/SMA/Bollinger/MACD/VWAP/ATR
  - `src/lib/strategy/conditions.ts` — evaluator deterministic with fixture data contexts
  - `src/lib/strategy/evaluator.ts` — state machine transitions for synthetic tick streams
  - `src/lib/strategy/backtest.ts` — backtest result shape + trade extraction
  - `src/lib/strategy/nlparser.ts` — every example in the docstring as a fixture
  - `src/lib/guardrails.ts`, `correlations.ts`, `marketHours.ts`, `positionSize.ts`, `snapshot.ts`
  - `src/lib/schwab/orderGuardrails.ts`
- **GitHub Actions workflow**: on every push, run `tsc --noEmit` + `vitest` + `npm run build`. Fail fast.
- Auto-rebuild on host gates on CI passing (optional; for now keep current behavior).

**Why now:** As the engine evolves (multi-ticker, server worker, etc.), regressions become inevitable without tests. Pure functions are 80% of the strategy engine — covering them locks in the math.

**Acceptance:**
- [ ] `npm test` runs Vitest, ≥80% coverage on `src/lib/strategy/**`
- [ ] CI pipeline green on a fresh PR
- [ ] One intentional bug (e.g. flip an RSI threshold) is caught by tests

---

## Sprint 17 — Mobile + tablet polish  · **M**

The dashboard is desktop-first. Mobile is functional but not great.

**Scope:**
- **Responsive grid breakpoints** revisited. Watchlist rail collapses to a horizontal scroller on `<lg`. Right-rail positions become a bottom-sheet card.
- **Touch-optimized** hit targets — buttons get min 44×44 on mobile (already partial; audit + complete).
- **Mobile chart**: pinch-to-zoom + drag-to-pan (lightweight-charts supports both; need to enable + tune).
- **Drawer behavior on mobile**: full-screen instead of right-aligned. Swipe right to close.
- **Bottom tab bar** for primary actions on mobile (Strategies / Monitor / Chart / Trades / More) — replaces the hamburger sidebar as the primary nav on small screens.
- **`/watch` PWA polish**: bigger fonts, more vibration, simpler swipe between tickers.

**Why now:** Real day traders check phones constantly. The current mobile experience works but doesn't shine. With the strategy engine watching for them, the phone becomes the primary interface during away-from-desk hours.

**Acceptance:**
- [ ] Open dashboard on iPhone → can navigate to any drawer with one thumb
- [ ] `/watch` add-to-home-screen → looks native, vibrates on signal flip
- [ ] All buttons hit a 44×44 minimum target on touch devices

---

## Sprint 18 — Strategy analytics rollup + benchmarking  · **M**

Aggregate intelligence across all your strategies.

**Scope:**
- **Strategy rollup view**: new tab in Analytics drawer showing per-strategy performance — paper P&L, win rate, avg hold, fire frequency, by week / month.
- **Benchmark comparison**: every strategy's equity curve overlaid against a buy-and-hold of its first ticker. Already in single backtests; bring it to the rollup so you see "strat A beats B&H by 12%, strat B underperforms B&H by 5%".
- **Setup tagging analytics**: tag closed paper trades by strategy + condition fingerprint. Show which (strategy × ticker × time-of-day) combinations have the best edge.
- **Day-of-week / hour-of-day heatmaps**: when does each strategy fire best? Already partial in the existing AnalyticsPanel; deepen it per-strategy.

**Why now:** Once you have multiple strategies running in paper for a few weeks, the question becomes "which is actually working?" Right now you can see per-strategy P&L but can't see WHEN/WHERE each makes money.

**Acceptance:**
- [ ] Run 3 strategies in paper for a week, open rollup → ranked by edge with B&H delta
- [ ] Heatmap shows "RSI scalp on SOXL is profitable 9:30–11:00 ET, breaks even afterwards"

---

## Sprint 19 — News + earnings catalysts feed  · **S**

Right now you're flying blind on context. Big moves often have catalysts.

**Scope:**
- **Finnhub free tier** (free, requires API key — already documented in `.env.example`). Pull `/news?category=general` and `/calendar/earnings`.
- **Per-ticker news strip**: small inline panel above the chart showing last 5 headlines for the selected ticker. Time-stamped, click to expand.
- **Earnings calendar widget**: shows upcoming earnings for watchlist tickers within 7 days. Color-coded by proximity.
- **News-aware alerts**: optional flag on a strategy "skip fires within ±15min of earnings or major news" — defends against fade-the-news traps.

**Why now:** Pure-technical strategies fail spectacularly during fundamental events. A news/earnings overlay flags when RSI signals are likely to be unreliable.

**Acceptance:**
- [ ] News strip shows fresh SOXL headlines when toggled on
- [ ] Earnings widget says "NVDA reports in 3 days" → relevant for SOXL signals
- [ ] News-aware strategy skips a fire during a flagged earnings window

---

## Sprint 20 — Polish backlog (cleanup pass)  · **M**

Small fixes that don't deserve their own sprint but accumulate. Fold them into one focused cleanup.

**Scope:**
- Replace `apple-mobile-web-app-capable` with the modern `mobile-web-app-capable` meta tag (resolves the console deprecation warning).
- Sticky table headers in Trades / Journal / Monitor / Backtest trade-list drawers.
- `EmptyState` component applied to remaining ad-hoc empty states (ScannerPanel, AnalyticsPanel "No closed trades", AlertsPanel).
- **Confirmation toasts** when strategy actions succeed: "Strategy enabled", "Strategy cloned", "Backup exported". Auto-dismiss 3s.
- **Skeleton loaders** that match content shape (instead of "Loading…" pulsing text). Generic `<Skeleton>` component reused everywhere.
- **CSP cleanup**: optional, document how to tighten the Cloudflare report-only CSP into an enforced policy with proper nonces. Or just disable the report-only setting.
- **Settings tab persistence**: remember which Settings tab was last open across visits.
- **Drawer history breadcrumb**: when one drawer leads to another (Monitor → Strategies via empty-state CTA), back-arrow returns to where you were.
- Audit color contrast on glass cards — some `text-gray-500` on `bg-white/[0.03]` borderline.

**Why now:** A trickle of small UX rough edges accumulated across 10 sprints. Bundled cleanup gives the dashboard a noticeable polish bump.

**Acceptance:**
- [ ] Console clean of deprecation warnings (apart from third-party extension noise)
- [ ] Long table drawers (Trades, Backtest trades) have sticky headers when scrolling
- [ ] Every empty state uses `<EmptyState>`; no ad-hoc "No data" divs
- [ ] At least 3 success actions surface a toast

---

## Long-shelf items (not numbered — defer until earlier work proves value)

- **ML signal scoring (Sprint 7.1 from old roadmap)** — needs months of paper data first. Train a small model on backtest output, predict P(target_hit_before_stop), surface as confidence %.
- **Multi-broker abstraction** (Alpaca / Tradier) — only if Schwab proves limiting. Adds attack surface; not worth multiplying brokers preemptively.
- **Public strategy gallery** — community feature. Requires hosting infrastructure beyond the local-only model.
- **Options trading support** — significantly different mechanics (Greeks, expiration, multi-leg). Out of scope for an RSI-scalping equity dashboard.
- **Drag stops on chart** — finicky lightweight-charts custom interaction. Typed input on position card already works fine; revisit only if it becomes annoying.
- **Replay-trade-by-trade walkthrough** — Sprint 6D's Replay mode covers most of this. Could deepen with annotation/journaling per replay session.
- **Sound preferences (volume, custom sounds)** — minor; address if anyone complains.

---

## Cadence

Past sprints averaged about 90 minutes of focused work each (per commit timestamps). At that pace, sprints 11–20 represent ~15 working hours total — call it 3–5 sessions.

**Suggested order of operations:**

1. **First**: Sprint 11 (block builder) → Sprint 12 (custom alerts/watchlists) → Sprint 14 (Schwab status sync). Highest user-facing value, deepens the engine.
2. **Then**: Sprint 16 (tests + CI) — necessary before going much further on Tier 3 / server worker complexity.
3. **Then**: Sprint 13 (server worker) — the biggest capability jump but built on tested foundations.
4. **Then**: Sprint 15 (Cmd+K) + Sprint 17 (mobile) + Sprint 20 (polish) — quality of life.
5. **Then**: Sprint 18 (analytics rollup) + Sprint 19 (news) — value-adds once the core is rock solid.

ML scoring (long-shelf) becomes viable around month 3 of paper-trading data accumulation.
