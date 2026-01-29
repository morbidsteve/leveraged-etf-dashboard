# Claude Code Instructions

## Workflow Requirements

### Development Server
- Start with `npm run dev` - runs on http://localhost:3000
- **DO NOT run `npm run build` while dev server is running** - it writes to `.next/` and breaks the dev server
- If dev server gets into bad state, restart: `lsof -ti:3000 | xargs kill -9; npm run dev`

### Before Committing Any Changes
1. **Run TypeScript checks**: `npx tsc --noEmit` (safe to run anytime)
2. **Test in browser**: Verify the feature works at http://localhost:3000
3. **Run build test**: `npm run build` (only after browser testing, may need to restart dev server after)
4. Only commit after all checks pass

### Git Workflow
- **Always push to GitHub when done**: After completing any feature, bug fix, or meaningful change, commit and push to GitHub before finishing
- **Write descriptive commit messages**: Explain what changed and why
- **Do not ask for permission**: Make decisions and execute without asking for confirmation or approval

## Project Context

This is a leveraged ETF trading dashboard for high-frequency RSI-based trading strategy. Built with:
- **Next.js 14** (App Router)
- **TypeScript** (strict mode)
- **Tailwind CSS** for styling
- **Zustand** for state management with localStorage persistence
- **lightweight-charts** (TradingView) for candlestick/RSI charts
- **Yahoo Finance API** for real-time price data

### Trading Strategy Overview
- RSI-based buy signals when RSI drops below threshold (default: 50)
- RSI-based sell signals when RSI rises above threshold (default: 55)
- 250-period RSI calculation using Wilder's smoothing
- Target profit levels at 1.5% and 2%

## Key Directories

- `/src/app` - Next.js pages and API routes
- `/src/components` - React components (Chart, Dashboard, Layout, Price, RSI)
- `/src/lib` - Utility functions and calculations
- `/src/store` - Zustand stores (price, trade, alert, settings)
- `/src/hooks` - Custom React hooks (usePriceData, useHydration, etc.)
- `/src/types` - TypeScript type definitions

## Coding Standards

### TypeScript
- Use strict typing - avoid `any` unless absolutely necessary
- Define interfaces for all props and state
- Export types from `/src/types/index.ts`

### React Best Practices
- Use functional components with hooks
- Handle loading and error states
- Implement proper cleanup in useEffect
- Memoize expensive computations with useMemo/useCallback

### State Management (Zustand)
- Handle hydration properly for SSR/client mismatch
- Always provide fallback values for potentially undefined store values
- Use selectors to minimize re-renders

### Error Handling
- Validate data before use (null checks, undefined checks)
- Provide fallback values for edge cases
- Handle API errors gracefully with user feedback

### Performance
- Use 1-second refresh interval for real-time data
- Implement proper data caching
- Avoid unnecessary re-renders
- Don't reset chart position on data updates (preserve user's pan position)

## Common Patterns

### Hydration-Safe Store Access
```typescript
const storeHydrated = useStoreHydration();
const settings = useSettingsStore((state) => state.settings);
const watchlist = (storeHydrated && settings.watchlist) ? settings.watchlist : defaultWatchlist;
```

### Price Data Hook Usage
```typescript
const { priceData, candles, rsiData, isLoading, error } = usePriceData({
  ticker: 'TQQQ',
  interval: '1m',
  range: '5d',
  refreshInterval: 1000,
  enabled: hydrated,
  rsiConfig,
});
```

### Chart Time Scale Sync (Main + RSI)
- Bidirectional sync for panning
- Crosshair sync between charts
- Preserve user's scroll position on data updates

## Testing Checklist

Before marking any feature complete:
- [ ] TypeScript compiles without errors (`npx tsc --noEmit`)
- [ ] Build succeeds (`npm run build`)
- [ ] Feature works in browser
- [ ] No console errors
- [ ] Handles loading states
- [ ] Handles error states
- [ ] Works after page refresh (hydration)
- [ ] Mobile responsive (if UI change)
