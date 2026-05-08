import { describe, it, expect } from 'vitest';
import {
  pearson,
  logReturns,
  correlationMatrix,
  computeConcentration,
} from './correlation';
import { Candle } from '@/types';

describe('pearson', () => {
  it('returns 1 for identical series', () => {
    expect(pearson([1, 2, 3, 4, 5], [1, 2, 3, 4, 5])).toBeCloseTo(1, 6);
  });
  it('returns -1 for perfectly inverse series', () => {
    expect(pearson([1, 2, 3, 4, 5], [5, 4, 3, 2, 1])).toBeCloseTo(-1, 6);
  });
  it('returns ~0 for orthogonal series', () => {
    const r = pearson([1, 2, 3, 4, 5], [3, 1, 4, 1, 5]);
    expect(Math.abs(r)).toBeLessThan(0.5);
  });
  it('handles edge cases gracefully', () => {
    expect(pearson([], [])).toBe(0);
    expect(pearson([1], [1])).toBe(0);
    expect(pearson([1, 1, 1], [2, 2, 2])).toBe(0); // zero variance
  });
});

describe('logReturns', () => {
  it('returns N-1 entries', () => {
    const candles: Candle[] = [100, 110, 121, 110].map((p, i) => ({
      time: i,
      open: p,
      high: p,
      low: p,
      close: p,
      volume: 0,
    }));
    expect(logReturns(candles)).toHaveLength(3);
  });
  it('produces ~0.0953 for a 10% up move', () => {
    const candles: Candle[] = [
      { time: 0, open: 100, high: 100, low: 100, close: 100, volume: 0 },
      { time: 1, open: 110, high: 110, low: 110, close: 110, volume: 0 },
    ];
    const [r] = logReturns(candles);
    expect(r).toBeCloseTo(Math.log(1.1), 4);
  });
});

describe('correlationMatrix', () => {
  it('builds symmetric matrix with 1s on the diagonal', () => {
    const make = (closes: number[]): Candle[] =>
      closes.map((c, i) => ({ time: i, open: c, high: c, low: c, close: c, volume: 0 }));
    const data = {
      AAA: make([100, 102, 104, 103, 105, 107, 106, 108, 110, 112, 111, 113, 115, 117, 118, 120, 122, 124, 126, 128, 130, 132, 134, 136, 138, 140, 142, 144, 146, 148]),
      BBB: make([200, 198, 196, 197, 195, 193, 194, 192, 190, 188, 189, 187, 185, 183, 182, 180, 178, 176, 174, 172, 170, 168, 166, 164, 162, 160, 158, 156, 154, 152]),
    };
    const r = correlationMatrix(data);
    expect(r.tickers).toEqual(['AAA', 'BBB']);
    expect(r.matrix[0][0]).toBe(1);
    expect(r.matrix[1][1]).toBe(1);
    expect(r.matrix[0][1]).toBeCloseTo(r.matrix[1][0], 6);
    // AAA always up, BBB always down → strongly negative
    expect(r.matrix[0][1]).toBeLessThan(-0.9);
  });
  it('drops tickers with insufficient history', () => {
    const make = (closes: number[]): Candle[] =>
      closes.map((c, i) => ({ time: i, open: c, high: c, low: c, close: c, volume: 0 }));
    const data = {
      AAA: make(Array.from({ length: 50 }, (_, i) => 100 + i)),
      SHORT: make([100, 101, 102]),
    };
    const r = correlationMatrix(data, 30);
    expect(r.tickers).toEqual(['AAA']);
  });
});

describe('computeConcentration', () => {
  it('reports extreme risk for a single position', () => {
    const r = computeConcentration([{ ticker: 'SOXL', dollar: 10_000 }], []);
    expect(r.hhi).toBe(1);
    expect(r.effectiveN).toBe(1);
    expect(r.largestShare).toBe(1);
    expect(r.riskLabel).toBe('extreme');
  });
  it('reports lower risk for two uncorrelated positions', () => {
    const r = computeConcentration(
      [
        { ticker: 'A', dollar: 5000 },
        { ticker: 'B', dollar: 5000 },
      ],
      [{ a: 'A', b: 'B', corr: 0 }]
    );
    expect(r.hhi).toBeCloseTo(0.5, 6);
    expect(r.effectiveN).toBeCloseTo(2, 6);
    expect(r.avgCorr).toBeCloseTo(0, 6);
    expect(['low', 'moderate'].includes(r.riskLabel)).toBe(true);
  });
  it('elevates risk for two perfectly correlated 50/50 positions', () => {
    const r = computeConcentration(
      [
        { ticker: 'SOXL', dollar: 5000 },
        { ticker: 'TQQQ', dollar: 5000 },
      ],
      [{ a: 'SOXL', b: 'TQQQ', corr: 0.95 }]
    );
    expect(r.avgCorr).toBeCloseTo(0.95, 2);
    expect(['moderate', 'high', 'extreme'].includes(r.riskLabel)).toBe(true);
    expect(r.topCorr?.corr).toBe(0.95);
  });
  it('handles empty / zero-dollar input', () => {
    expect(computeConcentration([], []).riskLabel).toBe('low');
    expect(
      computeConcentration([{ ticker: 'X', dollar: 0 }], []).riskLabel
    ).toBe('low');
  });
});
