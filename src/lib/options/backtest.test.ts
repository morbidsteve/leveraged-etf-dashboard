import { describe, it, expect } from 'vitest';
import {
  bsmCall,
  bsmPut,
  normCdf,
  realizedVol,
  findStrikeForDelta,
  runOptionsBacktest,
} from './backtest';
import { Candle } from '@/types';

describe('normCdf', () => {
  it('cdf(0) ≈ 0.5', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 3);
  });
  it('cdf(1.96) ≈ 0.975', () => {
    expect(normCdf(1.96)).toBeCloseTo(0.975, 2);
  });
  it('cdf(-1.96) ≈ 0.025', () => {
    expect(normCdf(-1.96)).toBeCloseTo(0.025, 2);
  });
});

describe('bsmCall', () => {
  it('ATM call price > 0 with positive time + IV', () => {
    const r = bsmCall(100, 100, 0.05, 0.30, 1);
    expect(r.price).toBeGreaterThan(0);
    expect(r.delta).toBeCloseTo(0.6, 1); // ATM with positive rate is slightly above 0.5
  });
  it('Deep-ITM call ≈ intrinsic + small time value', () => {
    const r = bsmCall(150, 100, 0.05, 0.30, 0.01);
    expect(r.price).toBeGreaterThan(49.9);
    expect(r.delta).toBeGreaterThan(0.99);
  });
  it('Far-OTM call ≈ 0 with little time', () => {
    const r = bsmCall(50, 100, 0.05, 0.30, 0.01);
    expect(r.price).toBeLessThan(0.5);
    expect(r.delta).toBeLessThan(0.05);
  });
});

describe('bsmPut', () => {
  it('puts have negative delta', () => {
    const r = bsmPut(100, 100, 0.05, 0.30, 1);
    expect(r.delta).toBeLessThan(0);
    expect(r.price).toBeGreaterThan(0);
  });
});

describe('realizedVol', () => {
  it('returns ~0.3 default for too-short history', () => {
    expect(realizedVol([1, 2, 3])).toBeCloseTo(0.3, 1);
  });
  it('higher for noisier price series', () => {
    const flat = Array.from({ length: 50 }, () => 100);
    const noisy = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i) * 5);
    expect(realizedVol(noisy)).toBeGreaterThan(realizedVol(flat));
  });
});

describe('findStrikeForDelta', () => {
  it('finds a strike near the target delta', () => {
    const k = findStrikeForDelta(100, 0.05, 0.30, 7 / 252, 'put', -0.10);
    // -10Δ put on $100 spot @ 30% IV / 7 DTE — should be substantially OTM
    expect(k).toBeLessThan(100);
    expect(k).toBeGreaterThan(85);
  });
});

describe('runOptionsBacktest', () => {
  function mk(closes: number[]): Candle[] {
    return closes.map((c, i) => ({
      time: 1700000000 + i * 86400,
      open: c,
      high: c,
      low: c,
      close: c,
      volume: 1000,
    }));
  }

  it('returns no trades on insufficient candles', () => {
    const r = runOptionsBacktest({
      candles: mk([100, 101]),
      rule: { kind: 'long_call', dte: 7, delta: 0.30, quantity: 1 },
      cadenceBars: 1,
    });
    expect(r.trades.length).toBe(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('produces some trades on long history', () => {
    // Synthetic random walk
    const closes: number[] = [100];
    for (let i = 1; i < 200; i++) {
      closes.push(closes[i - 1] * (1 + (Math.random() - 0.5) * 0.02));
    }
    const r = runOptionsBacktest({
      candles: mk(closes),
      rule: { kind: 'short_put_vertical', dte: 7, shortDelta: -0.20, width: 5, quantity: 1 },
      cadenceBars: 7,
    });
    expect(r.trades.length).toBeGreaterThan(0);
    // Each trade should have realizedPnL set, not NaN
    for (const t of r.trades) {
      expect(Number.isFinite(t.realizedPnL)).toBe(true);
    }
  });
});
