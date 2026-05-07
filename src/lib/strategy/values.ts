import { ValueRef, DataContext, Timeframe, TimeframeIndicators } from '@/types/strategy';

/**
 * Resolve a ValueRef against the current data context.
 *
 * Multi-timeframe semantics: if `tf` is set on a data-bearing ValueRef,
 * we look up that timeframe in ctx.byTf. If `tf` is unset or missing
 * from byTf, we fall back to the native indicators on ctx (the strategy's
 * main chart interval).
 *
 * Returns null if a required input isn't present (e.g. RSI(250) but only
 * 100 candles available, or tf=5m requested but no 5m fetcher attached).
 */
export function evaluateValue(ref: ValueRef, ctx: DataContext): number | null {
  switch (ref.kind) {
    case 'literal':
      return ref.value;
    case 'price':
      return readNumber(ctx, ref.tf, (ind) => ind.price, () => ctx.price);
    case 'rsi':
      return readNumber(ctx, ref.tf, (ind) => ind.rsi[ref.period] ?? null, () => ctx.rsi[ref.period] ?? null);
    case 'ema':
      return readNumber(ctx, ref.tf, (ind) => ind.ema[ref.period] ?? null, () => ctx.ema[ref.period] ?? null);
    case 'sma':
      return readNumber(ctx, ref.tf, (ind) => ind.sma[ref.period] ?? null, () => ctx.sma[ref.period] ?? null);
    case 'vwap':
      return readNumber(ctx, ref.tf, (ind) => ind.vwap, () => ctx.vwap ?? null);
    case 'volume':
      return readNumber(ctx, ref.tf, (ind) => ind.volume, () => ctx.volume);
    case 'minutes_since_open': {
      const t = ctx.timestamp;
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

function readNumber(
  ctx: DataContext,
  tf: Timeframe | undefined,
  fromTf: (ind: TimeframeIndicators) => number | null | undefined,
  fromNative: () => number | null
): number | null {
  if (tf && ctx.byTf) {
    const ind = ctx.byTf[tf];
    if (ind) {
      const v = fromTf(ind);
      return v == null || !Number.isFinite(v) ? null : v;
    }
  }
  const v = fromNative();
  return v == null || !Number.isFinite(v) ? null : v;
}

/**
 * Human-readable rendering of a ValueRef — used by the strategy builder UI
 * and by event-log entries ("rsi(250) crossed below 50 on 5m").
 */
export function describeValue(ref: ValueRef): string {
  const tfTag = (tf?: Timeframe) => (tf ? `@${tf}` : '');
  switch (ref.kind) {
    case 'literal':
      return ref.value.toString();
    case 'price':
      return `price${tfTag(ref.tf)}`;
    case 'rsi':
      return `rsi(${ref.period})${tfTag(ref.tf)}`;
    case 'ema':
      return `ema(${ref.period})${tfTag(ref.tf)}`;
    case 'sma':
      return `sma(${ref.period})${tfTag(ref.tf)}`;
    case 'vwap':
      return `vwap${tfTag(ref.tf)}`;
    case 'volume':
      return `volume${tfTag(ref.tf)}`;
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

/**
 * Walk a ValueRef tree and collect all timeframes it references. Used by
 * the engine to figure out which extra TFs need fetching.
 */
export function collectTimeframes(ref: ValueRef): Timeframe[] {
  const out = new Set<Timeframe>();
  walk(ref);
  return Array.from(out);

  function walk(r: ValueRef) {
    switch (r.kind) {
      case 'price':
      case 'rsi':
      case 'ema':
      case 'sma':
      case 'vwap':
      case 'volume':
        if (r.tf) out.add(r.tf);
        break;
      case 'pct_of':
        walk(r.base);
        break;
      default:
        break;
    }
  }
}
