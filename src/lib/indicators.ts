import { Candle } from '@/types';

/**
 * Simple Moving Average (SMA)
 */
export function calculateSMA(candles: Candle[], period: number): { time: number; value: number }[] {
  if (candles.length < period) return [];

  const result: { time: number; value: number }[] = [];

  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += candles[i - j].close;
    }
    result.push({
      time: candles[i].time,
      value: sum / period,
    });
  }

  return result;
}

/**
 * Exponential Moving Average (EMA)
 */
export function calculateEMA(candles: Candle[], period: number): { time: number; value: number }[] {
  if (candles.length < period) return [];

  const result: { time: number; value: number }[] = [];
  const multiplier = 2 / (period + 1);

  // First EMA is SMA of first 'period' values
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }
  let ema = sum / period;
  result.push({ time: candles[period - 1].time, value: ema });

  // Calculate subsequent EMAs
  for (let i = period; i < candles.length; i++) {
    ema = (candles[i].close - ema) * multiplier + ema;
    result.push({ time: candles[i].time, value: ema });
  }

  return result;
}

/**
 * MACD (Moving Average Convergence Divergence)
 * Returns MACD line, signal line, and histogram
 */
export interface MACDData {
  time: number;
  macd: number;
  signal: number;
  histogram: number;
}

export function calculateMACD(
  candles: Candle[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDData[] {
  const fastEMA = calculateEMA(candles, fastPeriod);
  const slowEMA = calculateEMA(candles, slowPeriod);

  if (slowEMA.length === 0) return [];

  // MACD line = Fast EMA - Slow EMA
  // Need to align the time indexes
  const macdLine: { time: number; value: number }[] = [];
  const slowStartIndex = slowPeriod - fastPeriod;

  for (let i = 0; i < slowEMA.length; i++) {
    const slowPoint = slowEMA[i];
    const fastPoint = fastEMA[i + slowStartIndex];
    if (fastPoint && fastPoint.time === slowPoint.time) {
      macdLine.push({
        time: slowPoint.time,
        value: fastPoint.value - slowPoint.value,
      });
    }
  }

  if (macdLine.length < signalPeriod) return [];

  // Signal line = EMA of MACD line
  const signalMultiplier = 2 / (signalPeriod + 1);
  let signalSum = 0;
  for (let i = 0; i < signalPeriod; i++) {
    signalSum += macdLine[i].value;
  }
  let signalEMA = signalSum / signalPeriod;

  const result: MACDData[] = [];

  // First signal value
  result.push({
    time: macdLine[signalPeriod - 1].time,
    macd: macdLine[signalPeriod - 1].value,
    signal: signalEMA,
    histogram: macdLine[signalPeriod - 1].value - signalEMA,
  });

  // Calculate subsequent signal values
  for (let i = signalPeriod; i < macdLine.length; i++) {
    signalEMA = (macdLine[i].value - signalEMA) * signalMultiplier + signalEMA;
    result.push({
      time: macdLine[i].time,
      macd: macdLine[i].value,
      signal: signalEMA,
      histogram: macdLine[i].value - signalEMA,
    });
  }

  return result;
}

/**
 * Bollinger Bands
 */
export interface BollingerBandsData {
  time: number;
  upper: number;
  middle: number;
  lower: number;
}

export function calculateBollingerBands(
  candles: Candle[],
  period: number = 20,
  stdDev: number = 2
): BollingerBandsData[] {
  if (candles.length < period) return [];

  const result: BollingerBandsData[] = [];

  for (let i = period - 1; i < candles.length; i++) {
    // Calculate SMA (middle band)
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += candles[i - j].close;
    }
    const sma = sum / period;

    // Calculate standard deviation
    let squaredDiffSum = 0;
    for (let j = 0; j < period; j++) {
      squaredDiffSum += Math.pow(candles[i - j].close - sma, 2);
    }
    const standardDeviation = Math.sqrt(squaredDiffSum / period);

    result.push({
      time: candles[i].time,
      upper: sma + stdDev * standardDeviation,
      middle: sma,
      lower: sma - stdDev * standardDeviation,
    });
  }

  return result;
}

/**
 * VWAP (Volume Weighted Average Price)
 */
export function calculateVWAP(candles: Candle[]): { time: number; value: number }[] {
  if (candles.length === 0) return [];

  const result: { time: number; value: number }[] = [];
  let cumulativeTPV = 0; // Typical Price * Volume
  let cumulativeVolume = 0;

  // Group by day and reset VWAP at start of each day
  let currentDay = -1;

  for (const candle of candles) {
    const date = new Date(candle.time * 1000);
    const day = date.getDate();

    // Reset VWAP at start of new day
    if (day !== currentDay) {
      cumulativeTPV = 0;
      cumulativeVolume = 0;
      currentDay = day;
    }

    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    const volume = candle.volume || 0;

    cumulativeTPV += typicalPrice * volume;
    cumulativeVolume += volume;

    if (cumulativeVolume > 0) {
      result.push({
        time: candle.time,
        value: cumulativeTPV / cumulativeVolume,
      });
    }
  }

  return result;
}

/**
 * ATR (Average True Range)
 */
export function calculateATR(candles: Candle[], period: number = 14): { time: number; value: number }[] {
  if (candles.length < period + 1) return [];

  const trueRanges: number[] = [];

  // Calculate True Range for each candle (starting from index 1)
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }

  const result: { time: number; value: number }[] = [];

  // First ATR is SMA of first 'period' true ranges
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += trueRanges[i];
  }
  let atr = sum / period;
  result.push({ time: candles[period].time, value: atr });

  // Calculate subsequent ATRs using Wilder's smoothing
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
    result.push({ time: candles[i + 1].time, value: atr });
  }

  return result;
}

/**
 * Stochastic Oscillator
 */
export interface StochasticData {
  time: number;
  k: number;
  d: number;
}

export function calculateStochastic(
  candles: Candle[],
  kPeriod: number = 14,
  dPeriod: number = 3
): StochasticData[] {
  if (candles.length < kPeriod + dPeriod - 1) return [];

  const kValues: { time: number; value: number }[] = [];

  // Calculate %K
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let highestHigh = -Infinity;
    let lowestLow = Infinity;

    for (let j = 0; j < kPeriod; j++) {
      highestHigh = Math.max(highestHigh, candles[i - j].high);
      lowestLow = Math.min(lowestLow, candles[i - j].low);
    }

    const range = highestHigh - lowestLow;
    const k = range > 0 ? ((candles[i].close - lowestLow) / range) * 100 : 50;

    kValues.push({ time: candles[i].time, value: k });
  }

  // Calculate %D (SMA of %K)
  const result: StochasticData[] = [];

  for (let i = dPeriod - 1; i < kValues.length; i++) {
    let sum = 0;
    for (let j = 0; j < dPeriod; j++) {
      sum += kValues[i - j].value;
    }
    const d = sum / dPeriod;

    result.push({
      time: kValues[i].time,
      k: kValues[i].value,
      d,
    });
  }

  return result;
}

/**
 * ADX (Average Directional Index) — measures trend strength regardless
 * of direction. Returns ADX, +DI, -DI per bar after warmup. Standard
 * Wilder smoothing.
 *
 * ADX > 25 typically signals "trending" market; < 20 = ranging.
 */
export interface ADXData {
  time: number;
  adx: number;
  plusDI: number;
  minusDI: number;
}

export function calculateADX(candles: Candle[], period: number = 14): ADXData[] {
  if (candles.length < period * 2 + 1) return [];

  const trs: number[] = [];
  const plusDMs: number[] = [];
  const minusDMs: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    const prevClose = candles[i - 1].close;

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trs.push(tr);

    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  // Wilder-smoothed initial sums
  let trSmooth = trs.slice(0, period).reduce((s, x) => s + x, 0);
  let plusDMSmooth = plusDMs.slice(0, period).reduce((s, x) => s + x, 0);
  let minusDMSmooth = minusDMs.slice(0, period).reduce((s, x) => s + x, 0);

  const dxValues: { time: number; dx: number; plusDI: number; minusDI: number }[] = [];

  // First DX after the initial smoothing window
  {
    const i = period;
    const plusDI = trSmooth > 0 ? (plusDMSmooth / trSmooth) * 100 : 0;
    const minusDI = trSmooth > 0 ? (minusDMSmooth / trSmooth) * 100 : 0;
    const sum = plusDI + minusDI;
    const dx = sum > 0 ? (Math.abs(plusDI - minusDI) / sum) * 100 : 0;
    dxValues.push({ time: candles[i].time, dx, plusDI, minusDI });
  }

  // Subsequent DX values using Wilder smoothing
  for (let i = period + 1; i < candles.length; i++) {
    const idx = i - 1; // index into trs/plusDMs/minusDMs
    trSmooth = trSmooth - trSmooth / period + trs[idx];
    plusDMSmooth = plusDMSmooth - plusDMSmooth / period + plusDMs[idx];
    minusDMSmooth = minusDMSmooth - minusDMSmooth / period + minusDMs[idx];
    const plusDI = trSmooth > 0 ? (plusDMSmooth / trSmooth) * 100 : 0;
    const minusDI = trSmooth > 0 ? (minusDMSmooth / trSmooth) * 100 : 0;
    const sum = plusDI + minusDI;
    const dx = sum > 0 ? (Math.abs(plusDI - minusDI) / sum) * 100 : 0;
    dxValues.push({ time: candles[i].time, dx, plusDI, minusDI });
  }

  if (dxValues.length < period) return [];

  // ADX is Wilder-smoothed DX
  const result: ADXData[] = [];
  let adx = dxValues.slice(0, period).reduce((s, x) => s + x.dx, 0) / period;
  result.push({
    time: dxValues[period - 1].time,
    adx,
    plusDI: dxValues[period - 1].plusDI,
    minusDI: dxValues[period - 1].minusDI,
  });

  for (let i = period; i < dxValues.length; i++) {
    adx = (adx * (period - 1) + dxValues[i].dx) / period;
    result.push({
      time: dxValues[i].time,
      adx,
      plusDI: dxValues[i].plusDI,
      minusDI: dxValues[i].minusDI,
    });
  }

  return result;
}

/**
 * Rolling Z-score of close price — how many standard deviations the
 * current close is from its rolling mean. Useful for mean-reversion
 * strategies (extreme |z| flags overextended moves).
 */
export function calculateZScore(
  candles: Candle[],
  period: number = 20
): { time: number; value: number }[] {
  if (candles.length < period) return [];
  const out: { time: number; value: number }[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += candles[i - j].close;
    const mean = sum / period;
    let variance = 0;
    for (let j = 0; j < period; j++) {
      variance += (candles[i - j].close - mean) ** 2;
    }
    const stdDev = Math.sqrt(variance / period);
    const z = stdDev > 0 ? (candles[i].close - mean) / stdDev : 0;
    out.push({ time: candles[i].time, value: z });
  }
  return out;
}

/**
 * Percentile rank of the latest close vs the trailing window. Returns
 * 0–100. 50 = at median, 100 = at all-time high in the window.
 */
export function calculatePercentileRank(
  candles: Candle[],
  period: number = 100
): { time: number; value: number }[] {
  if (candles.length < period) return [];
  const out: { time: number; value: number }[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    const window: number[] = [];
    for (let j = 0; j < period; j++) window.push(candles[i - j].close);
    const cur = candles[i].close;
    const below = window.filter((v) => v < cur).length;
    out.push({ time: candles[i].time, value: (below / period) * 100 });
  }
  return out;
}
