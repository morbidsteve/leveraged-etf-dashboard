/**
 * English string bag. Default + fallback for every other locale.
 *
 * Keys are dot-namespaced: `domain.action[.detail]`.
 *
 * Variables in strings are referenced as {name} — replace at runtime
 * via t(key, { name: value }).
 */

const en: Record<string, string> = {
  // Signals
  'signal.buy': 'BUY',
  'signal.sell': 'SELL',
  'signal.neutral': 'NEUTRAL',
  'signal.firing': 'Firing now',
  'signal.notFiring': 'Not firing',

  // Trade actions
  'trade.opened': 'Trade opened: {ticker}',
  'trade.closed': 'Closed {ticker} · {pnl}',
  'trade.partialClose': 'Partial close: {ticker} · {shares} shares',
  'trade.takeProfit': '{ticker} · TAKE PROFIT at {pct}%',
  'trade.stopHit': '{ticker} · STOP HIT at {pct}%',

  // Strategy
  'strategy.enabled': 'Enabled "{name}"',
  'strategy.disabled': 'Disabled "{name}"',
  'strategy.cloned': 'Cloned to "{name}"',
  'strategy.fired': 'Strategy fired: {name}',

  // Common UI
  'ui.cancel': 'Cancel',
  'ui.save': 'Save',
  'ui.close': 'Close',
  'ui.confirm': 'Confirm',
  'ui.delete': 'Delete',
  'ui.refresh': 'Refresh',
  'ui.loading': 'Loading…',
  'ui.error': 'Error',
};

export default en;
