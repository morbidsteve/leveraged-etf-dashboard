/**
 * Full-engine replay — deterministic, in-memory simulation of a Strategy
 * over historical candles using the same `tick()` function the live
 * engine uses. Different from ./replay.ts (which only replays a single
 * condition for visualization).
 *
 * Pure: no I/O, no side effects. Caller maintains the ReplayState
 * across calls so React can re-render between steps for the scrubber.
 */

import { Candle, RSIConfig } from '@/types';
import { Strategy, StrategyRuntime, DataContext } from '@/types/strategy';
import { initialRuntime, tick } from './evaluator';
import { calculateRSIWithTimestamps } from '@/lib/rsi';
import { calculateEMA, calculateSMA } from '@/lib/indicators';

export interface ReplayTrade {
  entryIndex: number;
  exitIndex: number | null;
  entryAt: Date;
  exitAt: Date | null;
  entryPrice: number;
  exitPrice: number | null;
  shares: number;
  realizedPnL: number | null;
  reason: string;
}

export interface ReplayEvent {
  candleIndex: number;
  timestamp: Date;
  type: 'state_change' | 'action_emitted';
  detail: string;
}

export interface ReplayState {
  runtime: StrategyRuntime;
  trades: ReplayTrade[];
  events: ReplayEvent[];
  /** Currently-open trade (in_position) or null. Pointer into `trades`. */
  openTradeIdx: number | null;
  equityCurve: { index: number; equity: number }[];
}

interface IndicatorCache {
  rsi: Map<number, number>;
  ema20: Map<number, number>;
  ema50: Map<number, number>;
  sma20: Map<number, number>;
}

/**
 * Pre-compute indicator series once, return a cache. Stepping through
 * the replay just looks up by time in the cache instead of recomputing
 * the full RSI/EMA on every step (which is O(n²) over a session).
 */
export function buildIndicatorCache(
  candles: Candle[],
  rsiConfig: RSIConfig
): IndicatorCache {
  const rsi = calculateRSIWithTimestamps(candles, rsiConfig.period);
  const ema20 = calculateEMA(candles, 20);
  const ema50 = calculateEMA(candles, 50);
  const sma20 = calculateSMA(candles, 20);
  const toMap = (arr: { time: number; value: number }[]) => {
    const m = new Map<number, number>();
    for (const p of arr) m.set(p.time, p.value);
    return m;
  };
  return {
    rsi: toMap(rsi),
    ema20: toMap(ema20),
    ema50: toMap(ema50),
    sma20: toMap(sma20),
  };
}

function ctxAt(
  candles: Candle[],
  i: number,
  ticker: string,
  rsiConfig: RSIConfig,
  cache: IndicatorCache
): DataContext {
  const c = candles[i];
  return {
    ticker,
    price: c.close,
    rsi: { [rsiConfig.period]: cache.rsi.get(c.time) ?? NaN },
    ema: {
      20: cache.ema20.get(c.time) ?? NaN,
      50: cache.ema50.get(c.time) ?? NaN,
    },
    sma: { 20: cache.sma20.get(c.time) ?? NaN },
    vwap: null,
    volume: c.volume ?? 0,
    timestamp: new Date(c.time * 1000),
  };
}

export function initialReplayState(strategy: Strategy, ticker: string): ReplayState {
  return {
    runtime: { ...initialRuntime(strategy.id, ticker), state: 'armed' },
    trades: [],
    events: [],
    openTradeIdx: null,
    equityCurve: [],
  };
}

/**
 * Step the replay forward by one candle. Idempotent on the ReplayState —
 * caller passes prev state, gets new state.
 */
export function stepReplay(opts: {
  strategy: Strategy;
  candles: Candle[];
  index: number;
  ticker: string;
  rsiConfig: RSIConfig;
  cache: IndicatorCache;
  prev: ReplayState;
}): ReplayState {
  const { strategy, candles, index, ticker, rsiConfig, cache, prev } = opts;
  if (index < 0 || index >= candles.length) return prev;

  const currCtx = ctxAt(candles, index, ticker, rsiConfig, cache);
  const prevCtx = index > 0 ? ctxAt(candles, index - 1, ticker, rsiConfig, cache) : null;

  const out = tick({
    strategy,
    runtime: prev.runtime,
    prevCtx,
    currCtx,
    now: currCtx.timestamp,
  });

  const trades = [...prev.trades];
  const events: ReplayEvent[] = [...prev.events];
  const equityCurve = [...prev.equityCurve];
  let openTradeIdx = prev.openTradeIdx;

  for (const ev of out.events) {
    events.push({
      candleIndex: index,
      timestamp: currCtx.timestamp,
      type: ev.type,
      detail: ev.detail,
    });
  }

  for (const action of out.actions) {
    if (action.kind === 'enter') {
      trades.push({
        entryIndex: index,
        exitIndex: null,
        entryAt: currCtx.timestamp,
        exitAt: null,
        entryPrice: currCtx.price,
        exitPrice: null,
        shares: action.shares,
        realizedPnL: null,
        reason: action.reason,
      });
      openTradeIdx = trades.length - 1;
    } else if (action.kind === 'exit' && openTradeIdx != null) {
      const open = trades[openTradeIdx];
      const realized = (currCtx.price - open.entryPrice) * open.shares;
      trades[openTradeIdx] = {
        ...open,
        exitIndex: index,
        exitAt: currCtx.timestamp,
        exitPrice: currCtx.price,
        realizedPnL: realized,
        reason: action.reason,
      };
      const totalEquity = trades.reduce((s, t) => s + (t.realizedPnL ?? 0), 0);
      equityCurve.push({ index, equity: totalEquity });
      openTradeIdx = null;
    }
  }

  return {
    runtime: out.runtime,
    trades,
    events,
    openTradeIdx,
    equityCurve,
  };
}

export function unrealizedAt(
  trades: ReplayTrade[],
  openIdx: number | null,
  livePrice: number
): number {
  if (openIdx == null) return 0;
  const t = trades[openIdx];
  if (!t) return 0;
  return (livePrice - t.entryPrice) * t.shares;
}
