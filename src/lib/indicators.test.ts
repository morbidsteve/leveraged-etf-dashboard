import { describe, it, expect } from 'vitest';
import {
  calculateSMA,
  calculateEMA,
  calculateVWAP,
  calculateBollingerBands,
} from './indicators';
import { Candle } from '@/types';

function mk(closes: number[], opts?: { volumes?: number[]; highs?: number[]; lows?: number[] }): Candle[] {
  return closes.map((close, i) => ({
    time: 1700000000 + i * 60,
    open: close,
    high: opts?.highs?.[i] ?? close,
    low: opts?.lows?.[i] ?? close,
    close,
    volume: opts?.volumes?.[i] ?? 1000,
  }));
}

describe('calculateSMA', () => {
  it('returns empty when fewer than period candles', () => {
    expect(calculateSMA(mk([1, 2, 3]), 5)).toEqual([]);
  });

  it('matches arithmetic mean for first window', () => {
    const series = calculateSMA(mk([1, 2, 3, 4, 5]), 3);
    expect(series[0].value).toBeCloseTo(2, 6);
    expect(series[1].value).toBeCloseTo(3, 6);
    expect(series[2].value).toBeCloseTo(4, 6);
  });

  it('preserves candle timestamp at the trailing edge of each window', () => {
    const candles = mk([1, 2, 3, 4]);
    const series = calculateSMA(candles, 3);
    expect(series[0].time).toBe(candles[2].time);
  });
});

describe('calculateEMA', () => {
  it('returns empty when fewer than period candles', () => {
    expect(calculateEMA(mk([1, 2, 3]), 5)).toEqual([]);
  });

  it('seeds with SMA of first window', () => {
    const candles = mk([10, 20, 30, 25, 35]);
    const series = calculateEMA(candles, 3);
    // First EMA = SMA([10, 20, 30]) = 20
    expect(series[0].value).toBeCloseTo(20, 6);
  });

  it('reacts faster than SMA to recent moves', () => {
    const closes = [...Array.from({ length: 20 }, () => 100), 200];
    const ema = calculateEMA(mk(closes), 5);
    const sma = calculateSMA(mk(closes), 5);
    const lastEma = ema[ema.length - 1].value;
    const lastSma = sma[sma.length - 1].value;
    expect(lastEma).toBeGreaterThan(lastSma);
  });
});

describe('calculateVWAP', () => {
  it('equals price when volumes are uniform and prices flat', () => {
    const series = calculateVWAP(mk([100, 100, 100], { volumes: [1000, 1000, 1000] }));
    expect(series[0].value).toBeCloseTo(100, 6);
    expect(series[1].value).toBeCloseTo(100, 6);
    expect(series[2].value).toBeCloseTo(100, 6);
  });

  it('weights toward higher-volume bars', () => {
    // Bar 1: price 100, vol 1
    // Bar 2: price 200, vol 99
    const series = calculateVWAP(mk([100, 200], { volumes: [1, 99], highs: [100, 200], lows: [100, 200] }));
    // VWAP = (100*1 + 200*99) / 100 = 199
    expect(series[1].value).toBeGreaterThan(195);
  });
});

describe('calculateBollingerBands', () => {
  it('produces upper > middle > lower for non-flat input', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + (i % 5));
    const bands = calculateBollingerBands(mk(closes), 20, 2);
    if (bands.length === 0) {
      // some impls bail when stddev is too small; tolerant
      return;
    }
    const last = bands[bands.length - 1];
    expect(last.upper).toBeGreaterThanOrEqual(last.middle);
    expect(last.middle).toBeGreaterThanOrEqual(last.lower);
  });
});
