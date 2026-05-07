import { ValueRef, DataContext } from '@/types/strategy';

/**
 * Resolve a ValueRef against the current data context.
 * Returns null if a required input isn't present (e.g. RSI(250) but only 100 candles available).
 */
export function evaluateValue(ref: ValueRef, ctx: DataContext): number | null {
  switch (ref.kind) {
    case 'literal':
      return ref.value;
    case 'price':
      return ctx.price;
    case 'rsi':
      return ctx.rsi[ref.period] ?? null;
    case 'ema':
      return ctx.ema[ref.period] ?? null;
    case 'sma':
      return ctx.sma[ref.period] ?? null;
    case 'vwap':
      return ctx.vwap ?? null;
    case 'volume':
      return ctx.volume;
    case 'minutes_since_open': {
      const t = ctx.timestamp;
      // Use ET-equivalent — Yahoo timestamps are already in market time
      const open = new Date(t);
      open.setHours(9, 30, 0, 0);
      const diff = (t.getTime() - open.getTime()) / 60_000;
      return diff;
    }
    case 'entry_price':
      return ctx.entryPrice ?? null;
    case 'minutes_since_entry': {
      if (!ctx.entryAt) return null;
      return (ctx.timestamp.getTime() - ctx.entryAt.getTime()) / 60_000;
    }
    case 'pct_of': {
      const base = evaluateValue(ref.base, ctx);
      if (base === null) return null;
      return base * (1 + ref.pct / 100);
    }
  }
}

/**
 * Human-readable rendering of a ValueRef — used by the strategy builder UI
 * and by event-log entries ("rsi(250) crossed below 50").
 */
export function describeValue(ref: ValueRef): string {
  switch (ref.kind) {
    case 'literal':
      return ref.value.toString();
    case 'price':
      return 'price';
    case 'rsi':
      return `rsi(${ref.period})`;
    case 'ema':
      return `ema(${ref.period})`;
    case 'sma':
      return `sma(${ref.period})`;
    case 'vwap':
      return 'vwap';
    case 'volume':
      return 'volume';
    case 'minutes_since_open':
      return 'minutes_since_open';
    case 'entry_price':
      return 'entry_price';
    case 'minutes_since_entry':
      return 'minutes_since_entry';
    case 'pct_of':
      return `${describeValue(ref.base)} × ${(1 + ref.pct / 100).toFixed(4)}`;
  }
}
