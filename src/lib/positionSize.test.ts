import { describe, it, expect } from 'vitest';
import { computePositionSize } from './positionSize';

describe('computePositionSize', () => {
  it('rejects zero account size', () => {
    const r = computePositionSize({ accountSize: 0, riskPct: 1, entry: 50, stop: 49 });
    expect(r.isValid).toBe(false);
    expect(r.reason).toMatch(/account/i);
  });

  it('rejects stop above entry (long position)', () => {
    const r = computePositionSize({ accountSize: 50000, riskPct: 1, entry: 50, stop: 55 });
    expect(r.isValid).toBe(false);
    expect(r.reason).toMatch(/stop/i);
  });

  it('rejects below-1-share sizing as too risky for the budget', () => {
    // $50000 × 0.01% = $5; stop $10 away → 0.5 shares → reject
    const r = computePositionSize({ accountSize: 50000, riskPct: 0.01, entry: 50, stop: 40 });
    expect(r.isValid).toBe(false);
    expect(r.reason).toMatch(/below 1/i);
  });

  it('computes shares = account*risk/stopdist, floored', () => {
    // $50000 × 1% = $500 risk; stop $1 away → 500 shares
    const r = computePositionSize({ accountSize: 50000, riskPct: 1, entry: 50, stop: 49 });
    expect(r.isValid).toBe(true);
    expect(r.shares).toBe(500);
    expect(r.notional).toBeCloseTo(25000, 2);
    expect(r.pctOfAccount).toBeCloseTo(50, 2);
  });

  it('computes RR ratios correctly', () => {
    // $1 risk per share, $0.75 reward at +1.5% on $50 entry → RR = 0.75
    const r = computePositionSize({ accountSize: 50000, riskPct: 1, entry: 50, stop: 49 });
    expect(r.rrAt15).toBeCloseTo(0.75, 2);
    expect(r.rrAt20).toBeCloseTo(1.0, 2);
  });

  it('floors fractional shares', () => {
    const r = computePositionSize({ accountSize: 1000, riskPct: 1, entry: 50, stop: 49.95 });
    expect(r.shares).toBe(Math.floor(10 / 0.05));
  });
});
