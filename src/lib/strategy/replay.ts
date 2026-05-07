import { Candle, RSIConfig } from '@/types';
import { ConditionTree, DataContext } from '@/types/strategy';
import { evaluate } from './conditions';
import { calculateRSIWithTimestamps, DEFAULT_RSI_CONFIG } from '@/lib/rsi';
import { calculateEMA, calculateSMA, calculateVWAP } from '@/lib/indicators';

export interface ReplayBar {
  /** Bar's epoch seconds (matches Candle.time). */
  time: number;
  /** Bar OHLC for chart-style rendering. */
  open: number;
  high: number;
  low: number;
  close: number;
  /** True if the entry condition would have fired on this bar's close. */
  fired: boolean;
  /** Resolved RSI / EMA values at this bar — useful for tooltips. */
  rsi: number | null;
  ema20: number | null;
  ema50: number | null;
}

export interface ReplayResult {
  bars: ReplayBar[];
  /** How many bars were skipped at the start because indicators weren't ready. */
  skipped: number;
  /** Did indicators actually have enough data to evaluate? */
  ready: boolean;
}

/**
 * Replay a condition against historical candles. Pure / deterministic.
 *
 * For every bar i (after enough warm-up), build a DataContext from the
 * pre-computed indicator series at i, evaluate the condition with the
 * previous bar as prevCtx (so 'cross' conditions work), and return whether
 * it fired. Used by the strategy-detail UI to show "where would this have
 * fired in the last hour" on a strip / chart.
 */
export function replayCondition(opts: {
  condition: ConditionTree;
  candles: Candle[];
  rsiConfig?: RSIConfig;
  ticker: string;
  /** Limit replay to the last N bars (defaults to all). */
  lastN?: number;
}): ReplayResult {
  const rsiConfig = opts.rsiConfig ?? DEFAULT_RSI_CONFIG;
  const allCandles = opts.candles;

  if (allCandles.length === 0) {
    return { bars: [], skipped: 0, ready: false };
  }

  // Pre-compute indicator series across ALL candles (so the warmup leading
  // up to the visible window is included even if lastN is set).
  const rsiSeries = calculateRSIWithTimestamps(allCandles, rsiConfig.period);
  const ema20Series = calculateEMA(allCandles, 20);
  const ema50Series = calculateEMA(allCandles, 50);
  const sma20Series = calculateSMA(allCandles, 20);
  const vwapSeries = calculateVWAP(allCandles);

  const rsiByTime = byTime(rsiSeries);
  const ema20ByTime = byTime(ema20Series);
  const ema50ByTime = byTime(ema50Series);
  const sma20ByTime = byTime(sma20Series);
  const vwapByTime = byTime(vwapSeries);

  // Walk every bar; build a context; evaluate. Need to walk from index 1 so
  // prevCtx exists. If lastN is provided, slice the visible window AFTER
  // walking so prevCtx stays correct at the slice boundary.
  const allReplayed: ReplayBar[] = [];
  let prevCtx: DataContext | null = null;

  for (let i = 0; i < allCandles.length; i++) {
    const bar = allCandles[i];
    const ctx: DataContext = {
      ticker: opts.ticker,
      price: bar.close,
      rsi: { [rsiConfig.period]: rsiByTime.get(bar.time) ?? Number.NaN },
      ema: {
        20: ema20ByTime.get(bar.time) ?? Number.NaN,
        50: ema50ByTime.get(bar.time) ?? Number.NaN,
      },
      sma: { 20: sma20ByTime.get(bar.time) ?? Number.NaN },
      vwap: vwapByTime.get(bar.time) ?? null,
      volume: bar.volume ?? 0,
      timestamp: new Date(bar.time * 1000),
    };

    let fired = false;
    try {
      fired = evaluate(opts.condition, ctx, prevCtx);
    } catch {
      // Bad condition tree (e.g. references entry_price in entry context).
      // Treat as not-fired.
      fired = false;
    }

    allReplayed.push({
      time: bar.time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      fired,
      rsi: numOrNull(rsiByTime.get(bar.time)),
      ema20: numOrNull(ema20ByTime.get(bar.time)),
      ema50: numOrNull(ema50ByTime.get(bar.time)),
    });

    prevCtx = ctx;
  }

  // Indicators are "ready" once the RSI series has values; rsiSeries length
  // equals candles.length minus (period+1) skipped at the start. So if
  // rsiSeries has even one entry, we've at least begun computing.
  const skipped = Math.max(0, allCandles.length - rsiSeries.length);
  const ready = rsiSeries.length > 0;

  // Slice to the visible window (last N) if requested
  const bars =
    opts.lastN && opts.lastN > 0 && allReplayed.length > opts.lastN
      ? allReplayed.slice(-opts.lastN)
      : allReplayed;

  return { bars, skipped, ready };
}

function byTime(series: { time: number; value: number }[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const p of series) m.set(p.time, p.value);
  return m;
}

function numOrNull(n: number | undefined): number | null {
  if (n === undefined || !Number.isFinite(n)) return null;
  return n;
}
