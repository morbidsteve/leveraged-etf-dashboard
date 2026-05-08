import { Candle } from '@/types';
import { calculateEMA, calculateZScore } from './indicators';
import { realizedVol } from './options/backtest';

/**
 * Market-regime detection. Pure functions; classify a candle series
 * into one of five regimes based on trend direction and volatility.
 *
 * Used by:
 *   - The dashboard ribbon ("market is in low-vol bull")
 *   - Strategy gating ("only fire this in low-vol bull regimes")
 *   - Analytics rollups ("how did each strategy do per regime")
 */

export type Regime =
  | 'bull_low_vol'
  | 'bull_high_vol'
  | 'bear_low_vol'
  | 'bear_high_vol'
  | 'sideways';

export interface RegimeReading {
  regime: Regime;
  trend: 'up' | 'down' | 'flat';
  vol: 'low' | 'high';
  score: {
    trendStrength: number;     // -1..1, signed % distance from EMA
    realizedVol: number;       // annualized stdev
    volPercentile: number | null; // vs trailing window
  };
  description: string;
}

const TREND_THRESHOLD = 0.01;   // ±1% from EMA20 → trending
const VOL_THRESHOLD = 0.30;     // 30% annualized = high vol

/**
 * Classify the most-recent bar's regime. Requires ≥30 candles for
 * stable readings; returns 'sideways' / 'low' as a fallback for
 * insufficient data.
 */
export function classifyRegime(candles: Candle[]): RegimeReading {
  if (candles.length < 30) {
    return {
      regime: 'sideways',
      trend: 'flat',
      vol: 'low',
      score: { trendStrength: 0, realizedVol: 0, volPercentile: null },
      description: 'Not enough data for regime classification',
    };
  }

  const ema20 = calculateEMA(candles, 20);
  const lastClose = candles[candles.length - 1].close;
  const lastEma = ema20.length > 0 ? ema20[ema20.length - 1].value : lastClose;
  const trendStrength = (lastClose - lastEma) / lastEma;

  let trend: 'up' | 'down' | 'flat';
  if (trendStrength > TREND_THRESHOLD) trend = 'up';
  else if (trendStrength < -TREND_THRESHOLD) trend = 'down';
  else trend = 'flat';

  const closes = candles.map((c) => c.close);
  const vol = realizedVol(closes, 20);
  const volBand = vol >= VOL_THRESHOLD ? 'high' : 'low';

  let regime: Regime;
  if (trend === 'flat') regime = 'sideways';
  else if (trend === 'up') regime = volBand === 'high' ? 'bull_high_vol' : 'bull_low_vol';
  else regime = volBand === 'high' ? 'bear_high_vol' : 'bear_low_vol';

  // Compute vol percentile across history if we have enough
  let volPercentile: number | null = null;
  if (candles.length >= 100) {
    const allVols: number[] = [];
    for (let i = 20; i < candles.length; i++) {
      const w = closes.slice(0, i + 1);
      allVols.push(realizedVol(w, 20));
    }
    const below = allVols.filter((v) => v < vol).length;
    volPercentile = (below / allVols.length) * 100;
  }

  return {
    regime,
    trend,
    vol: volBand,
    score: { trendStrength, realizedVol: vol, volPercentile },
    description: describeRegime(regime, trendStrength, vol),
  };
}

function describeRegime(r: Regime, trendStrength: number, vol: number): string {
  const ts = (trendStrength * 100).toFixed(2);
  const v = (vol * 100).toFixed(0);
  switch (r) {
    case 'bull_low_vol':
      return `Bull market, low vol (${ts}% above EMA20, ${v}% annualized vol). Best for trend-following.`;
    case 'bull_high_vol':
      return `Bull market, HIGH vol (${ts}% above EMA20, ${v}% annualized vol). Risk on but expect chop.`;
    case 'bear_low_vol':
      return `Bear market, low vol (${ts}% below EMA20, ${v}% vol). Slow grinding decline.`;
    case 'bear_high_vol':
      return `Bear market, HIGH vol (${ts}% below EMA20, ${v}% vol). Volatile decline — wide stops needed.`;
    case 'sideways':
      return `Sideways/range (${ts}% from EMA20, ${v}% vol). Best for mean-reversion.`;
  }
}

/**
 * Walk a series and emit a RegimeReading per N-bar window. Used for
 * historical regime overlays.
 */
export function regimeSeries(candles: Candle[], stride = 30): { time: number; regime: Regime }[] {
  const out: { time: number; regime: Regime }[] = [];
  for (let i = 30; i < candles.length; i += stride) {
    const r = classifyRegime(candles.slice(0, i + 1));
    out.push({ time: candles[i].time, regime: r.regime });
  }
  return out;
}

export function regimeColor(r: Regime): string {
  switch (r) {
    case 'bull_low_vol': return '#22c55e';
    case 'bull_high_vol': return '#84cc16';
    case 'bear_low_vol': return '#f97316';
    case 'bear_high_vol': return '#ef4444';
    case 'sideways': return '#9ca3af';
  }
}

export function regimeLabel(r: Regime): string {
  switch (r) {
    case 'bull_low_vol': return 'Bull · Low Vol';
    case 'bull_high_vol': return 'Bull · High Vol';
    case 'bear_low_vol': return 'Bear · Low Vol';
    case 'bear_high_vol': return 'Bear · High Vol';
    case 'sideways': return 'Sideways';
  }
}
