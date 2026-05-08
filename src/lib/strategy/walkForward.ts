import { Candle } from '@/types';
import { Strategy } from '@/types/strategy';
import { runBacktest, BacktestResult } from './backtest';

/**
 * Walk-forward analysis — slice candles into rolling in-sample /
 * out-of-sample windows, run a backtest on each, report whether
 * performance holds up out-of-sample.
 *
 * Pure: takes candles + strategy + window config, returns per-window
 * results. Does not modify state. UI can call this once per
 * "validate this strategy" button press.
 *
 * Standard rolling: walk forward 1 fold at a time, with `inSampleBars`
 * for training (used here just as a partition; the strategy doesn't
 * actually train) and `outOfSampleBars` for validation.
 */

export interface WalkForwardWindow {
  index: number;
  inSample: BacktestResult;
  outOfSample: BacktestResult;
  inSampleStartTime: number;
  oosStartTime: number;
  oosEndTime: number;
}

export interface WalkForwardSummary {
  windows: WalkForwardWindow[];
  /** Aggregate: did out-of-sample win-rate / expectancy hold? */
  inSampleWinRateAvg: number;
  oosWinRateAvg: number;
  inSampleExpectancyAvg: number;
  oosExpectancyAvg: number;
  /** Decay = (in-sample - oos) / in-sample. Negative = better OOS. */
  winRateDecayPct: number;
  expectancyDecayPct: number;
  warnings: string[];
}

export function runWalkForward(opts: {
  strategy: Strategy;
  candles: Candle[];
  inSampleBars: number;
  outOfSampleBars: number;
  interval: string;
  range: string;
  candleTimeToDate?: (t: number) => Date;
}): WalkForwardSummary {
  const { strategy, candles, inSampleBars, outOfSampleBars, interval, range } = opts;
  const warnings: string[] = [];
  const windows: WalkForwardWindow[] = [];

  if (candles.length < inSampleBars + outOfSampleBars) {
    warnings.push(`Not enough data for one window: need ${inSampleBars + outOfSampleBars} bars, have ${candles.length}`);
    return {
      windows: [],
      inSampleWinRateAvg: 0,
      oosWinRateAvg: 0,
      inSampleExpectancyAvg: 0,
      oosExpectancyAvg: 0,
      winRateDecayPct: 0,
      expectancyDecayPct: 0,
      warnings,
    };
  }

  let i = 0;
  let windowIdx = 0;
  while (i + inSampleBars + outOfSampleBars <= candles.length) {
    const isCandles = candles.slice(i, i + inSampleBars);
    const oosCandles = candles.slice(i + inSampleBars, i + inSampleBars + outOfSampleBars);
    const isResult = runBacktest({
      strategy,
      candles: isCandles,
      interval,
      range,
      candleTimeToDate: opts.candleTimeToDate,
    });
    const oosResult = runBacktest({
      strategy,
      candles: oosCandles,
      interval,
      range,
      candleTimeToDate: opts.candleTimeToDate,
    });
    windows.push({
      index: windowIdx++,
      inSample: isResult,
      outOfSample: oosResult,
      inSampleStartTime: isCandles[0].time,
      oosStartTime: oosCandles[0].time,
      oosEndTime: oosCandles[oosCandles.length - 1].time,
    });
    // Advance by outOfSampleBars (rolling window)
    i += outOfSampleBars;
  }

  if (windows.length === 0) {
    warnings.push('No windows produced — increase candle count or shrink window sizes');
  }

  const avg = (vals: number[]) => (vals.length === 0 ? 0 : vals.reduce((s, x) => s + x, 0) / vals.length);
  const inSampleWinRateAvg = avg(windows.map((w) => w.inSample.metrics.winRate));
  const oosWinRateAvg = avg(windows.map((w) => w.outOfSample.metrics.winRate));
  const inSampleExpectancyAvg = avg(windows.map((w) => w.inSample.metrics.expectancy));
  const oosExpectancyAvg = avg(windows.map((w) => w.outOfSample.metrics.expectancy));

  const winRateDecayPct = inSampleWinRateAvg > 0
    ? ((inSampleWinRateAvg - oosWinRateAvg) / inSampleWinRateAvg) * 100
    : 0;
  const expectancyDecayPct = inSampleExpectancyAvg !== 0
    ? ((inSampleExpectancyAvg - oosExpectancyAvg) / Math.abs(inSampleExpectancyAvg)) * 100
    : 0;

  if (oosWinRateAvg < inSampleWinRateAvg * 0.7) {
    warnings.push(
      `OOS win rate ${oosWinRateAvg.toFixed(1)}% is significantly below in-sample ${inSampleWinRateAvg.toFixed(1)}% — likely overfitting`
    );
  }
  if (oosExpectancyAvg < 0 && inSampleExpectancyAvg > 0) {
    warnings.push('OOS expectancy is negative while in-sample is positive — strategy does not generalize');
  }

  return {
    windows,
    inSampleWinRateAvg,
    oosWinRateAvg,
    inSampleExpectancyAvg,
    oosExpectancyAvg,
    winRateDecayPct,
    expectancyDecayPct,
    warnings,
  };
}
