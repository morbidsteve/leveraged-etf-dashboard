import { describe, it, expect } from 'vitest';
import { calculateRSI, calculateRSIWithTimestamps, getRSIStatus, DEFAULT_RSI_CONFIG } from './rsi';
import { Candle } from '@/types';

function mkCandles(closes: number[]): Candle[] {
  return closes.map((close, i) => ({
    time: 1700000000 + i * 60,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
  }));
}

describe('calculateRSI', () => {
  it('returns empty array when fewer than period+1 candles', () => {
    expect(calculateRSI(mkCandles([1, 2, 3]), 14)).toEqual([]);
  });

  it('computes RSI = 100 when no losses in the warmup window', () => {
    // Strictly increasing sequence — all gains, no losses
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const rsi = calculateRSI(mkCandles(closes), 14);
    expect(rsi.length).toBeGreaterThan(0);
    expect(rsi[0]).toBe(100);
  });

  it('produces RSI in [0, 100]', () => {
    const closes = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i / 5) * 10);
    const rsi = calculateRSI(mkCandles(closes), 14);
    for (const v of rsi) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('matches a known fixture (Wilder smoothing, 14 period)', () => {
    // Classic Investopedia-style RSI test sequence
    const closes = [
      44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08,
      45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64,
    ];
    const rsi = calculateRSI(mkCandles(closes), 14);
    // First RSI in this series is approximately 70.46 with Wilder smoothing
    expect(rsi[0]).toBeGreaterThan(65);
    expect(rsi[0]).toBeLessThan(80);
  });
});

describe('calculateRSIWithTimestamps', () => {
  it('attaches the correct timestamp to each RSI value', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + (i % 2 === 0 ? 1 : -1));
    const candles = mkCandles(closes);
    const series = calculateRSIWithTimestamps(candles, 14);
    expect(series.length).toBe(closes.length - 14);
    expect(series[0].time).toBe(candles[14].time);
    expect(series[series.length - 1].time).toBe(candles[candles.length - 1].time);
  });
});

describe('getRSIStatus', () => {
  it('returns buy when RSI is strictly below oversold', () => {
    expect(getRSIStatus(49, DEFAULT_RSI_CONFIG)).toBe('buy');
    expect(getRSIStatus(40, DEFAULT_RSI_CONFIG)).toBe('buy');
  });
  it('returns sell when RSI is strictly above overbought', () => {
    expect(getRSIStatus(56, DEFAULT_RSI_CONFIG)).toBe('sell');
    expect(getRSIStatus(70, DEFAULT_RSI_CONFIG)).toBe('sell');
  });
  it('returns neutral at and between thresholds', () => {
    expect(getRSIStatus(50, DEFAULT_RSI_CONFIG)).toBe('neutral');
    expect(getRSIStatus(55, DEFAULT_RSI_CONFIG)).toBe('neutral');
    expect(getRSIStatus(53, DEFAULT_RSI_CONFIG)).toBe('neutral');
  });
});
