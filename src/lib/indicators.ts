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
