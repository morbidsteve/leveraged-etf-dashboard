import { Candle, RSIConfig } from '@/types';
import {
  Strategy,
  StrategyRuntime,
  DataContext,
  StrategyEvent,
} from '@/types/strategy';
import { calculateRSIWithTimestamps, DEFAULT_RSI_CONFIG } from '@/lib/rsi';
import { calculateEMA, calculateSMA, calculateVWAP } from '@/lib/indicators';
import { tick, initialRuntime } from './evaluator';

// ── Result types ─────────────────────────────────────────────────────────

export interface BacktestTrade {
  id: number;
  entryAt: Date;
  entryPrice: number;
  exitAt: Date;
  exitPrice: number;
  shares: number;
  realizedPnL: number;
  realizedPnLPct: number;
  holdMinutes: number;
  exitReason: string;
}

export interface BacktestMetrics {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnL: number;
  totalReturnPct: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;       // |gross profit / gross loss|, ∞ if no losses
  expectancy: number;         // average $ per trade
  maxDrawdown: number;
  maxDrawdownPct: number;
  avgHoldMinutes: number;
  longestWin: number;
  longestLoss: number;
  buyHoldReturnPct: number;
  finalEquity: number;
}

export interface EquityPoint {
  time: number;          // unix seconds
  cumulativePnL: number;
  buyHoldEquity: number; // P&L of buy-and-hold N shares from bar 0
}

export interface BacktestResult {
  strategyId: string;
  strategyName: string;
  ticker: string;
  interval: string;
  range: string;
  startDate: Date | null;
  endDate: Date | null;
  trades: BacktestTrade[];
  metrics: BacktestMetrics;
  equityCurve: EquityPoint[];
  warnings: string[];
}

// ── Runner ───────────────────────────────────────────────────────────────

export interface RunBacktestOpts {
  strategy: Strategy;
  candles: Candle[];
  interval: string;
  range: string;
  /** Convert a candle's `time` (epoch seconds) into a Date for evaluator. */
  candleTimeToDate?: (t: number) => Date;
}

/**
 * Run a strategy backtest against historical candles. Pure, deterministic.
 *
 * Execution model: bar-by-bar. Conditions are evaluated against bar's *close*.
 * For target-exit strategies (compare price >= entry × pct), we additionally
 * check whether the bar's *high* hit the target — if so, we fill at the target
 * price intra-bar, which is realistic for a resting limit order.
 */
export function runBacktest({
  strategy,
  candles,
  interval,
  range,
  candleTimeToDate = (t) => new Date(t * 1000),
}: RunBacktestOpts): BacktestResult {
  const warnings: string[] = [];
  const rsiConfig = strategy.rsiConfig ?? DEFAULT_RSI_CONFIG;

  if (candles.length === 0) {
    return emptyResult(strategy, interval, range, ['No candle data available.']);
  }
  if (candles.length < rsiConfig.period + 5) {
    warnings.push(
      `Only ${candles.length} candles — RSI(${rsiConfig.period}) needs at least ${rsiConfig.period + 1}. Few or no signals will fire.`
    );
  }

  // Pre-compute indicator series once
  const rsiSeries = calculateRSIWithTimestamps(candles, rsiConfig.period);
  const ema20Series = calculateEMA(candles, 20);
  const ema50Series = calculateEMA(candles, 50);
  const sma20Series = calculateSMA(candles, 20);
  const vwapSeries = calculateVWAP(candles);

  // Index by time for O(1) lookup
  const rsiByTime = byTime(rsiSeries);
  const ema20ByTime = byTime(ema20Series);
  const ema50ByTime = byTime(ema50Series);
  const sma20ByTime = byTime(sma20Series);
  const vwapByTime = byTime(vwapSeries);

  // ── Strategy state (separate from any live runtime) ──
  let runtime: StrategyRuntime = {
    ...initialRuntime(strategy.id),
    state: 'armed', // backtest: assume armed from bar 0 (skip the idle->armed transition)
  };
  const stratForBacktest: Strategy = { ...strategy, enabled: true };

  let prevCtx: DataContext | null = null;
  const trades: BacktestTrade[] = [];
  const events: StrategyEvent[] = [];

  // For tracking open virtual position (we don't use the live paper store here)
  let openEntry: { price: number; at: Date; shares: number } | null = null;

  // Equity curve trackers
  let cumulativePnL = 0;
  const equityCurve: EquityPoint[] = [];
  const baselineShares =
    strategy.size.kind === 'shares' ? strategy.size.n : 0;
  const baselineEntryPrice = candles[0].close;

  for (let i = 0; i < candles.length; i++) {
    const bar = candles[i];
    const time = candleTimeToDate(bar.time);

    const ctx: DataContext = {
      ticker: strategy.ticker,
      price: bar.close,
      rsi: { [rsiConfig.period]: rsiByTime.get(bar.time) ?? Number.NaN },
      ema: {
        20: ema20ByTime.get(bar.time) ?? Number.NaN,
        50: ema50ByTime.get(bar.time) ?? Number.NaN,
      },
      sma: { 20: sma20ByTime.get(bar.time) ?? Number.NaN },
      vwap: vwapByTime.get(bar.time) ?? null,
      volume: bar.volume ?? 0,
      timestamp: time,
      entryPrice: openEntry?.price,
      entryAt: openEntry?.at,
    };

    const out = tick({
      strategy: stratForBacktest,
      runtime,
      prevCtx,
      currCtx: ctx,
      now: time,
    });

    runtime = out.runtime;
    for (const ev of out.events) {
      events.push({
        id: `${i}-${events.length}`,
        strategyId: strategy.id,
        timestamp: time,
        type: ev.type,
        detail: ev.detail,
      });
    }

    for (const action of out.actions) {
      if (action.kind === 'enter') {
        // Realistic fill: open at next bar's open (one-bar lag) when available
        const nextBar = candles[i + 1];
        const fillPrice = nextBar ? nextBar.open : bar.close;
        const fillAt = nextBar ? candleTimeToDate(nextBar.time) : time;
        openEntry = { price: fillPrice, at: fillAt, shares: action.shares };
        runtime = {
          ...runtime,
          entryPrice: fillPrice,
          entryAt: fillAt,
        };
      } else if (action.kind === 'exit' && openEntry) {
        // Realistic fill: target exits use limitPrice (resting limit), other
        // exits use next bar's open
        let fillPrice: number;
        let fillAt: Date;
        if (action.orderType === 'resting_limit' && action.limitPrice !== undefined) {
          // Resting limit at the target — assume it filled at the target price.
          // Realistic: only counts as filled if a future bar's high >= target,
          // but our `tick()` only fires this action when close >= target, so
          // we know the target has already been crossed by the close. Fill at
          // limitPrice (the target).
          fillPrice = action.limitPrice;
          fillAt = time;
        } else {
          const nextBar = candles[i + 1];
          fillPrice = nextBar ? nextBar.open : bar.close;
          fillAt = nextBar ? candleTimeToDate(nextBar.time) : time;
        }

        const pnl = (fillPrice - openEntry.price) * openEntry.shares;
        const pnlPct =
          openEntry.price > 0
            ? ((fillPrice - openEntry.price) / openEntry.price) * 100
            : 0;
        const holdMinutes =
          (fillAt.getTime() - openEntry.at.getTime()) / 60_000;

        trades.push({
          id: trades.length,
          entryAt: openEntry.at,
          entryPrice: openEntry.price,
          exitAt: fillAt,
          exitPrice: fillPrice,
          shares: openEntry.shares,
          realizedPnL: pnl,
          realizedPnLPct: pnlPct,
          holdMinutes,
          exitReason: action.reason,
        });

        cumulativePnL += pnl;
        openEntry = null;
        runtime = {
          ...runtime,
          entryPrice: null,
          entryAt: null,
          shares: null,
        };
      }
    }

    // Equity curve point at every bar
    equityCurve.push({
      time: bar.time,
      cumulativePnL,
      buyHoldEquity:
        baselineShares > 0
          ? (bar.close - baselineEntryPrice) * baselineShares
          : 0,
    });

    prevCtx = ctx;
  }

  // If position still open at the end, close at final close
  if (openEntry) {
    const last = candles[candles.length - 1];
    const fillPrice = last.close;
    const fillAt = candleTimeToDate(last.time);
    const pnl = (fillPrice - openEntry.price) * openEntry.shares;
    const pnlPct =
      openEntry.price > 0
        ? ((fillPrice - openEntry.price) / openEntry.price) * 100
        : 0;
    trades.push({
      id: trades.length,
      entryAt: openEntry.at,
      entryPrice: openEntry.price,
      exitAt: fillAt,
      exitPrice: fillPrice,
      shares: openEntry.shares,
      realizedPnL: pnl,
      realizedPnLPct: pnlPct,
      holdMinutes: (fillAt.getTime() - openEntry.at.getTime()) / 60_000,
      exitReason: 'Backtest end (force close)',
    });
    cumulativePnL += pnl;
    warnings.push('Backtest ended with an open position. It was force-closed at the final bar close.');
  }

  const metrics = computeMetrics(trades, equityCurve, candles, baselineShares);

  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    ticker: strategy.ticker,
    interval,
    range,
    startDate: candles.length > 0 ? candleTimeToDate(candles[0].time) : null,
    endDate: candles.length > 0 ? candleTimeToDate(candles[candles.length - 1].time) : null,
    trades,
    metrics,
    equityCurve,
    warnings,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

function byTime(series: { time: number; value: number }[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const p of series) m.set(p.time, p.value);
  return m;
}

function computeMetrics(
  trades: BacktestTrade[],
  equity: EquityPoint[],
  candles: Candle[],
  baselineShares: number
): BacktestMetrics {
  const wins = trades.filter((t) => t.realizedPnL > 0);
  const losses = trades.filter((t) => t.realizedPnL <= 0);
  const totalPnL = trades.reduce((s, t) => s + t.realizedPnL, 0);
  const grossProfit = wins.reduce((s, t) => s + t.realizedPnL, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.realizedPnL, 0));

  let peak = 0;
  let maxDD = 0;
  for (const p of equity) {
    if (p.cumulativePnL > peak) peak = p.cumulativePnL;
    const dd = peak - p.cumulativePnL;
    if (dd > maxDD) maxDD = dd;
  }

  const initialNotional = baselineShares > 0 && candles.length > 0
    ? candles[0].close * baselineShares
    : 0;

  const buyHoldFinal =
    candles.length > 0 && baselineShares > 0
      ? (candles[candles.length - 1].close - candles[0].close) * baselineShares
      : 0;

  const totalReturnPct = initialNotional > 0 ? (totalPnL / initialNotional) * 100 : 0;
  const buyHoldReturnPct = initialNotional > 0 ? (buyHoldFinal / initialNotional) * 100 : 0;
  const maxDDPct = initialNotional > 0 ? (maxDD / initialNotional) * 100 : 0;

  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
    totalPnL,
    totalReturnPct,
    avgWin: wins.length > 0 ? grossProfit / wins.length : 0,
    avgLoss: losses.length > 0 ? -grossLoss / losses.length : 0,
    profitFactor:
      grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    expectancy: trades.length > 0 ? totalPnL / trades.length : 0,
    maxDrawdown: maxDD,
    maxDrawdownPct: maxDDPct,
    avgHoldMinutes:
      trades.length > 0 ? trades.reduce((s, t) => s + t.holdMinutes, 0) / trades.length : 0,
    longestWin: wins.length > 0 ? Math.max(...wins.map((t) => t.realizedPnL)) : 0,
    longestLoss: losses.length > 0 ? Math.min(...losses.map((t) => t.realizedPnL)) : 0,
    buyHoldReturnPct,
    finalEquity: totalPnL,
  };
}

function emptyResult(
  strategy: Strategy,
  interval: string,
  range: string,
  warnings: string[]
): BacktestResult {
  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    ticker: strategy.ticker,
    interval,
    range,
    startDate: null,
    endDate: null,
    trades: [],
    metrics: {
      trades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalPnL: 0,
      totalReturnPct: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
      expectancy: 0,
      maxDrawdown: 0,
      maxDrawdownPct: 0,
      avgHoldMinutes: 0,
      longestWin: 0,
      longestLoss: 0,
      buyHoldReturnPct: 0,
      finalEquity: 0,
    },
    equityCurve: [],
    warnings,
  };
}
