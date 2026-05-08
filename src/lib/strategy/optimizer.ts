/**
 * Brute-force grid search over strategy parameters.
 *
 * Sweeps RSI period + oversold + overbought combinations, runs a
 * backtest for each, ranks by P&L (or Sharpe / win rate based on
 * objective). Returns the best params plus a sensitivity score —
 * how much the metric varies in the neighborhood of the optimum.
 *
 * Sensitivity matters: a strategy that wins big with RSI=50/55 and
 * loses big at 49/56 is curve-fit. A strategy that's profitable
 * across a wide neighborhood is robust.
 */

import { Candle } from '@/types';
import { Strategy } from '@/types/strategy';
import { runBacktest } from './backtest';

export interface OptimizerOpts {
  strategy: Strategy;
  candles: Candle[];
  /** RSI periods to try. */
  periods: number[];
  /** Oversold thresholds to try. */
  oversold: number[];
  /** Overbought thresholds to try. */
  overbought: number[];
  /** Optimization objective. */
  objective?: 'pnl' | 'winRate' | 'expectancy' | 'sharpe';
  /** How long the user is willing to wait — break out after N combos. */
  maxCombos?: number;
}

export interface OptimizerCell {
  period: number;
  oversold: number;
  overbought: number;
  trades: number;
  winRate: number;
  pnl: number;
  expectancy: number;
  sharpe: number;
  score: number;
}

export interface OptimizerResult {
  cells: OptimizerCell[];
  best: OptimizerCell | null;
  baseline: OptimizerCell | null;
  /** Standard deviation of `score` over the explored grid — proxy for
   *  how brittle the parameter choice is. */
  scoreStd: number;
  /** Mean score across cells with at least 5 trades — to avoid
   *  rewarding parameter combos that simply never fire. */
  scoreMean: number;
  /** Top-decile mean score; "optimum neighborhood" performance. */
  topDecileMean: number;
  /** Practitioners' robustness label. */
  robustness: 'robust' | 'modest' | 'fragile' | 'overfit';
  durationMs: number;
}

function rewriteRsiConditions(
  strategy: Strategy,
  period: number,
  oversold: number,
  overbought: number
): Strategy {
  // Walk the strategy's condition trees and replace any 'rsi' ValueRef
  // period (or rsi config) with the candidate period. Also swap any
  // literal threshold near the strategy's existing oversold/overbought
  // values with the candidate thresholds.
  const cur = strategy.rsiConfig ?? { period: 250, oversold: 50, overbought: 55 };
  const out: Strategy = JSON.parse(JSON.stringify(strategy));
  out.rsiConfig = { ...cur, period, oversold, overbought };

  // Mutate any RSI-vs-literal compares in entry/exit/stop trees:
  // when the literal value matches the strategy's *current* oversold
  // or overbought, replace it with the candidate. This handles the
  // common case (RSI < oversold for entry, RSI > overbought for exit)
  // without trying to re-parse arbitrary nested expressions.
  const replaceLiteral = (val: number): number => {
    if (Math.abs(val - cur.oversold) < 0.5) return oversold;
    if (Math.abs(val - cur.overbought) < 0.5) return overbought;
    return val;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'compare' || node.type === 'cross') {
      // Update RSI period on rsi ValueRefs
      for (const side of ['left', 'right', 'target', 'threshold']) {
        const v = node[side];
        if (v && v.kind === 'rsi') v.period = period;
        if (v && v.kind === 'literal') v.value = replaceLiteral(v.value);
      }
    }
    if (Array.isArray(node.children)) node.children.forEach(walk);
    if (node.child) walk(node.child);
  };
  walk(out.entry?.when);
  walk(out.exit?.when);
  walk(out.stopLoss?.when);
  return out;
}

function sharpeOf(trades: { pnl: number }[]): number {
  if (trades.length < 2) return 0;
  const rs = trades.map((t) => t.pnl);
  const mean = rs.reduce((s, r) => s + r, 0) / rs.length;
  const v = rs.reduce((s, r) => s + (r - mean) * (r - mean), 0) / rs.length;
  const sd = Math.sqrt(v);
  if (sd === 0) return 0;
  return (mean / sd) * Math.sqrt(252); // annualized-ish
}

export function runOptimizer(opts: OptimizerOpts): OptimizerResult {
  const start = performance.now();
  const objective = opts.objective ?? 'pnl';
  const maxCombos = opts.maxCombos ?? 200;

  const cells: OptimizerCell[] = [];
  const combos: { p: number; os: number; ob: number }[] = [];
  for (const p of opts.periods) {
    for (const os of opts.oversold) {
      for (const ob of opts.overbought) {
        if (ob <= os) continue; // skip nonsensical combos
        combos.push({ p, os, ob });
      }
    }
  }
  // If the grid is huge, evenly subsample
  const effective =
    combos.length > maxCombos
      ? combos.filter((_, i) => i % Math.ceil(combos.length / maxCombos) === 0)
      : combos;

  for (const c of effective) {
    const variant = rewriteRsiConditions(opts.strategy, c.p, c.os, c.ob);
    const result = runBacktest({
      strategy: variant,
      candles: opts.candles,
      interval: '5m',
      range: '1mo',
    });
    const trades = result.trades.length;
    const pnl = result.metrics.totalPnL;
    const winRate = result.metrics.winRate;
    const expectancy = result.metrics.expectancy;
    const sharpe = sharpeOf(result.trades.map((t) => ({ pnl: t.realizedPnL })));
    const score =
      objective === 'pnl'
        ? pnl
        : objective === 'winRate'
        ? winRate
        : objective === 'expectancy'
        ? expectancy
        : sharpe;
    cells.push({
      period: c.p,
      oversold: c.os,
      overbought: c.ob,
      trades,
      winRate,
      pnl,
      expectancy,
      sharpe,
      score,
    });
  }

  // Compute baseline (existing strategy params)
  const cur = opts.strategy.rsiConfig ?? { period: 250, oversold: 50, overbought: 55 };
  const baseline =
    cells.find(
      (c) =>
        c.period === cur.period &&
        c.oversold === cur.oversold &&
        c.overbought === cur.overbought
    ) ?? null;

  // Filter to "real" cells (≥5 trades) for sensitivity stats
  const real = cells.filter((c) => c.trades >= 5);
  const scoreMean =
    real.length > 0 ? real.reduce((s, c) => s + c.score, 0) / real.length : 0;
  const scoreVar =
    real.length > 0
      ? real.reduce((s, c) => s + (c.score - scoreMean) ** 2, 0) / real.length
      : 0;
  const scoreStd = Math.sqrt(scoreVar);

  const sortedReal = [...real].sort((a, b) => b.score - a.score);
  const topDecile = sortedReal.slice(0, Math.max(1, Math.ceil(sortedReal.length * 0.1)));
  const topDecileMean =
    topDecile.length > 0
      ? topDecile.reduce((s, c) => s + c.score, 0) / topDecile.length
      : 0;

  const best = sortedReal[0] ?? null;

  // Robustness: low std relative to top-decile mean = robust.
  // Top-decile much greater than mean = brittle / overfit.
  let robustness: OptimizerResult['robustness'] = 'modest';
  if (best && real.length >= 10) {
    const ratio = scoreStd / Math.max(1, Math.abs(topDecileMean));
    const lift = Math.abs(topDecileMean - scoreMean) / Math.max(1, Math.abs(scoreStd));
    if (ratio < 0.3 && scoreMean > 0) robustness = 'robust';
    else if (lift > 2 && best.score > 0 && scoreMean < 0) robustness = 'overfit';
    else if (ratio > 1.5) robustness = 'fragile';
    else robustness = 'modest';
  }

  return {
    cells,
    best,
    baseline,
    scoreStd,
    scoreMean,
    topDecileMean,
    robustness,
    durationMs: performance.now() - start,
  };
}
