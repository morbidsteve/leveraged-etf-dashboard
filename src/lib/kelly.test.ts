import { describe, it, expect } from 'vitest';
import { computeKelly } from './kelly';

describe('computeKelly', () => {
  it('positive edge: 60% win, 1:1 payoff → 20%', () => {
    const r = computeKelly({ winRate: 0.6, avgWin: 100, avgLoss: 100, tradeCount: 100 });
    expect(r.fullKelly).toBeCloseTo(0.2, 2);
    expect(r.halfKelly).toBeCloseTo(0.1, 2);
    expect(r.payoffRatio).toBe(1);
    expect(r.reliable).toBe(true);
  });

  it('no edge: 50% win, 1:1 payoff → 0', () => {
    const r = computeKelly({ winRate: 0.5, avgWin: 100, avgLoss: 100, tradeCount: 100 });
    expect(r.fullKelly).toBe(0);
    expect(r.halfKelly).toBe(0);
  });

  it('negative edge: 40% win, 1:1 → don\'t trade', () => {
    const r = computeKelly({ winRate: 0.4, avgWin: 100, avgLoss: 100, tradeCount: 100 });
    expect(r.fullKelly).toBeLessThan(0);
    expect(r.halfKelly).toBe(0);
    expect(r.description).toContain("don't trade");
  });

  it('asymmetric payoff: 50% win, 2:1 payoff → 25%', () => {
    const r = computeKelly({ winRate: 0.5, avgWin: 200, avgLoss: 100, tradeCount: 100 });
    expect(r.fullKelly).toBeCloseTo(0.25, 2);
  });

  it('marks low-trade-count as unreliable', () => {
    const r = computeKelly({ winRate: 0.7, avgWin: 100, avgLoss: 100, tradeCount: 10 });
    expect(r.reliable).toBe(false);
    expect(r.description).toContain('grain of salt');
  });

  it('clamps half-Kelly at 25%', () => {
    // Massive edge — full Kelly might say "60%"; half should clamp
    const r = computeKelly({ winRate: 0.9, avgWin: 100, avgLoss: 50, tradeCount: 100 });
    expect(r.halfKelly).toBeLessThanOrEqual(0.25);
  });
});
