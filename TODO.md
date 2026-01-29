# TODO - Leveraged ETF Dashboard

## High Priority

### 1. Add UI for Technical Indicators
- [ ] Add indicator selector/toggle UI to chart pages
- [ ] Implement SMA overlay on price chart
- [ ] Implement EMA overlay on price chart
- [ ] Implement Bollinger Bands overlay
- [ ] Implement MACD as separate panel (like RSI)
- [ ] Implement VWAP overlay
- [ ] Add indicator settings (periods, colors, etc.)

**Files involved:**
- `src/lib/indicators.ts` - Calculations already done
- `src/components/Chart/CandlestickChart.tsx` - Add series for each indicator
- `src/app/chart/page.tsx` - Add UI toggles

### 2. Polish RSI Settings UI
- [ ] Consistent settings panel on both Dashboard and Chart pages
- [ ] Settings should persist and apply immediately
- [ ] Consider a dedicated settings modal/drawer

## Medium Priority

### 3. RSI Crossing Validation
- [ ] Test with different time ranges (1D, 1M, 3M)
- [ ] Verify crossings appear at correct candle times
- [ ] Add unit tests for `detectRSICrossings` function
- [ ] Consider adding visual debugging mode to highlight RSI values at crossing points

### 4. Dashboard/Chart Page Consistency
- [ ] Ensure both pages read from same RSI config in store
- [ ] Sync chart interval/range preferences between pages
- [ ] Consider shared chart settings component

## Lower Priority

### 5. Mobile Responsiveness
- [ ] Test all pages on mobile viewport
- [ ] Fix any overflow/layout issues
- [ ] Consider collapsible sidebar on mobile

### 6. Alert System
- [ ] Test RSI threshold alerts
- [ ] Add sound notifications (optional)
- [ ] Add browser notifications
- [ ] Alert history/log view

### 7. Code Quality
- [ ] Add unit tests for indicator calculations
- [ ] Add integration tests for chart rendering
- [ ] Review and clean up any unused code

---

## Completed (This Session)

- [x] Fix RSI chart time alignment (was ~3 hours behind)
- [x] Change chart sync from logical range to time range
- [x] Fix RSI crossing detection defaults on Chart page
- [x] Create technical indicators library (`src/lib/indicators.ts`)
- [x] Add watchlist add/remove functionality
- [x] Add RSI settings UI on Dashboard
- [x] Update CLAUDE.md with dev workflow notes

---

## Dev Notes

**Start dev server:**
```bash
npm run dev
```

**Restart if stuck:**
```bash
lsof -ti:3000 | xargs kill -9; npm run dev
```

**Type check (safe during dev):**
```bash
npx tsc --noEmit
```

**Full build (may need server restart after):**
```bash
npm run build
```
