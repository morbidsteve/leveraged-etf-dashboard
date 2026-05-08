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
      return readCrossTickerNumber(ctx, ref.ticker, ref.tf,
        (ind) => ind.price,
        (otherCtx) => otherCtx.price,
        () => ctx.price);
    case 'rsi':
      return readCrossTickerNumber(ctx, ref.ticker, ref.tf,
        (ind) => ind.rsi[ref.period] ?? null,
        (otherCtx) => otherCtx.rsi[ref.period] ?? null,
        () => ctx.rsi[ref.period] ?? null);
    case 'ema':
      return readCrossTickerNumber(ctx, ref.ticker, ref.tf,
        (ind) => ind.ema[ref.period] ?? null,
        (otherCtx) => otherCtx.ema[ref.period] ?? null,
        () => ctx.ema[ref.period] ?? null);
    case 'sma':
      return readCrossTickerNumber(ctx, ref.ticker, ref.tf,
        (ind) => ind.sma[ref.period] ?? null,
        (otherCtx) => otherCtx.sma[ref.period] ?? null,
        () => ctx.sma[ref.period] ?? null);
    case 'vwap':
      return readCrossTickerNumber(ctx, ref.ticker, ref.tf,
        (ind) => ind.vwap,
        (otherCtx) => otherCtx.vwap,
        () => ctx.vwap ?? null);
    case 'volume':
      return readCrossTickerNumber(ctx, ref.ticker, ref.tf,
        (ind) => ind.volume,
        (otherCtx) => otherCtx.volume,
        () => ctx.volume);
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
    // ── Options-aware refs (Sprint O7) ────────────────────────────────
    case 'iv': {
      if (ref.period === 'live') return ctx.ivLive ?? null;
      return ctx.ivPercentile ?? null;
    }
    case 'delta': {
      const key = `${ref.daysToExpiry}:${ref.type}`;
      const v = ctx.deltas?.[key];
      return v == null ? null : v;
    }
    case 'days_to_expiry':
      return ctx.optionDaysToExpiry ?? null;
    case 'position_pnl_pct':
      return ctx.optionPositionPnlPct ?? null;
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
 * Resolve a possibly-cross-ticker indicator. If `ticker` is set and
 * differs from ctx.ticker, look it up from ctx.byTicker. Falls through
 * to the native (or per-tf) reader for the same-ticker case.
 */
function readCrossTickerNumber(
  ctx: DataContext,
  ticker: string | undefined,
  tf: Timeframe | undefined,
  fromTf: (ind: TimeframeIndicators) => number | null | undefined,
  fromOther: (other: NonNullable<DataContext['byTicker']>[string]) => number | null | undefined,
  fromNative: () => number | null
): number | null {
  if (ticker && ticker.toUpperCase() !== ctx.ticker.toUpperCase()) {
    const otherUp = ticker.toUpperCase();
    const other = ctx.byTicker?.[otherUp] ?? ctx.byTicker?.[ticker];
    if (!other) return null;
    // Cross-ticker doesn't yet support multi-timeframe (would need
    // per-ticker per-tf data). Fall back to the other ticker's native
    // values.
    const v = fromOther(other);
    return v == null || !Number.isFinite(v) ? null : v;
  }
  return readNumber(ctx, tf, fromTf, fromNative);
}

/**
 * Human-readable rendering of a ValueRef — used by the strategy builder UI
 * and by event-log entries ("rsi(250) crossed below 50 on 5m").
 */
export function describeValue(ref: ValueRef): string {
  const tfTag = (tf?: Timeframe) => (tf ? `@${tf}` : '');
  const tickerTag = (t?: string) => (t ? `[${t.toUpperCase()}]` : '');
  switch (ref.kind) {
    case 'literal':
      return ref.value.toString();
    case 'price':
      return `${tickerTag(ref.ticker)}price${tfTag(ref.tf)}`;
    case 'rsi':
      return `${tickerTag(ref.ticker)}rsi(${ref.period})${tfTag(ref.tf)}`;
    case 'ema':
      return `${tickerTag(ref.ticker)}ema(${ref.period})${tfTag(ref.tf)}`;
    case 'sma':
      return `${tickerTag(ref.ticker)}sma(${ref.period})${tfTag(ref.tf)}`;
    case 'vwap':
      return `${tickerTag(ref.ticker)}vwap${tfTag(ref.tf)}`;
    case 'volume':
      return `${tickerTag(ref.ticker)}volume${tfTag(ref.tf)}`;
    case 'minutes_since_open':
      return 'minutes_since_open';
    case 'entry_price':
      return 'entry_price';
    case 'minutes_since_entry':
      return 'minutes_since_entry';
    case 'pct_of':
      return `${describeValue(ref.base)} × ${(1 + ref.pct / 100).toFixed(4)}`;
    case 'iv':
      return ref.period === 'live' ? 'iv(live)' : 'iv(pctile_252)';
    case 'delta':
      return `delta(${ref.daysToExpiry}d, ${ref.type})`;
    case 'days_to_expiry':
      return 'days_to_expiry';
    case 'position_pnl_pct':
      return 'position_pnl_pct';
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
      // Options-aware refs are timeframe-agnostic (they belong to the
      // chain's per-expiration data, not the underlying's bar data).
      case 'literal':
      case 'minutes_since_open':
      case 'entry_price':
      case 'minutes_since_entry':
      case 'iv':
      case 'delta':
      case 'days_to_expiry':
      case 'position_pnl_pct':
        break;
    }
  }
}

/**
 * Walk a ValueRef tree and collect every external (cross-ticker) symbol
 * it references. The engine uses this to fetch candle data for tickers
 * not in the strategy's `tickers` field but referenced in conditions.
 */
export function collectExternalTickers(ref: ValueRef): string[] {
  const out = new Set<string>();
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
        if (r.ticker) out.add(r.ticker.toUpperCase());
        break;
      case 'pct_of':
        walk(r.base);
        break;
      default:
        break;
    }
  }
}
