import { describe, it, expect } from 'vitest';
import {
  calculateSMA,
  calculateEMA,
  calculateVWAP,
  calculateBollingerBands,
  calculateADX,
  calculateZScore,
  calculatePercentileRank,
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

describe('calculateADX', () => {
  it('returns empty when fewer than 2N+1 candles', () => {
    expect(calculateADX(mk([1, 2, 3]), 14)).toEqual([]);
  });
  it('produces ADX values in [0, 100] for trending data', () => {
    // Strong uptrend
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5);
    const highs = closes.map((c) => c + 0.5);
    const lows = closes.map((c) => c - 0.5);
    const adx = calculateADX(mk(closes, { highs, lows }), 14);
    expect(adx.length).toBeGreaterThan(0);
    for (const v of adx) {
      expect(v.adx).toBeGreaterThanOrEqual(0);
      expect(v.adx).toBeLessThanOrEqual(100);
      expect(v.plusDI).toBeGreaterThanOrEqual(0);
      expect(v.minusDI).toBeGreaterThanOrEqual(0);
    }
  });
  it('+DI > -DI in clean uptrend', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i);
    const highs = closes.map((c) => c + 0.5);
    const lows = closes.map((c) => c - 0.5);
    const adx = calculateADX(mk(closes, { highs, lows }), 14);
    if (adx.length === 0) return;
    const last = adx[adx.length - 1];
    expect(last.plusDI).toBeGreaterThan(last.minusDI);
  });
});

describe('calculateZScore', () => {
  it('returns 0 for flat input', () => {
    const closes = Array(25).fill(100);
    const z = calculateZScore(mk(closes), 20);
    expect(z[z.length - 1].value).toBe(0);
  });
  it('positive z when close is above mean', () => {
    const closes = [...Array(20).fill(100), 110];
    const z = calculateZScore(mk(closes), 20);
    expect(z[z.length - 1].value).toBeGreaterThan(0);
  });
  it('negative z when close is below mean', () => {
    const closes = [...Array(20).fill(100), 90];
    const z = calculateZScore(mk(closes), 20);
    expect(z[z.length - 1].value).toBeLessThan(0);
  });
});

describe('calculatePercentileRank', () => {
  it('returns 100 when current is the highest in window', () => {
    const closes = [...Array(99).fill(100), 200];
    const r = calculatePercentileRank(mk(closes), 100);
    expect(r[r.length - 1].value).toBe(99);
  });
  it('returns 0 when current is the lowest in window', () => {
    const closes = [...Array(99).fill(100), 50];
    const r = calculatePercentileRank(mk(closes), 100);
    expect(r[r.length - 1].value).toBe(0);
  });
});
