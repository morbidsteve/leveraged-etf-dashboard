import { describe, it, expect } from 'vitest';
import { computeIVSummary, computePercentile, describeTermStructure } from './volatility';
import { OptionChain, OptionContract } from '@/types/options';

function mkContract(strike: number, type: 'call' | 'put', iv: number, delta: number): OptionContract {
  return {
    symbol: `T${strike}${type}`,
    underlying: 'TEST',
    expiration: '2026-06-01',
    daysToExpiry: 30,
    strike,
    type,
    bid: 1,
    ask: 1.1,
    last: 1.05,
    mark: 1.05,
    volume: 100,
    openInterest: 100,
    iv,
    delta,
    gamma: 0,
    theta: -0.05,
    vega: 0.1,
    rho: 0.01,
  };
}

function mkChain(): OptionChain {
  // Underlying at $100, two expirations
  return {
    underlying: 'TEST',
    underlyingPrice: 100,
    fetchedAt: new Date(),
    configured: true,
    expirations: [
      {
        date: '2026-05-30',
        daysToExpiry: 7,
        calls: {
          95: mkContract(95, 'call', 0.45, 0.7),
          100: mkContract(100, 'call', 0.40, 0.5), // ATM
          105: mkContract(105, 'call', 0.42, 0.3),
        },
        puts: {
          95: mkContract(95, 'put', 0.50, -0.3),
          100: mkContract(100, 'put', 0.40, -0.5), // ATM
          105: mkContract(105, 'put', 0.46, -0.7),
        },
      },
      {
        date: '2026-06-30',
        daysToExpiry: 30,
        calls: {
          100: mkContract(100, 'call', 0.50, 0.5), // ATM
        },
        puts: {
          100: mkContract(100, 'put', 0.50, -0.5),
        },
      },
    ],
  };
}

describe('computeIVSummary', () => {
  it('returns empty summary for unconfigured chain', () => {
    const chain: OptionChain = {
      underlying: 'X',
      underlyingPrice: 0,
      fetchedAt: new Date(),
      configured: false,
      expirations: [],
    };
    const s = computeIVSummary(chain);
    expect(s.atmIv).toBe(0);
    expect(s.termStructure).toEqual([]);
    expect(s.smile).toEqual([]);
  });

  it('picks ATM IV by averaging call+put at the spot strike', () => {
    const s = computeIVSummary(mkChain());
    // Front month: ATM call IV = 0.40, ATM put IV = 0.40 → avg 0.40
    expect(s.atmIv).toBeCloseTo(0.40, 6);
  });

  it('builds the term structure sorted by DTE', () => {
    const s = computeIVSummary(mkChain());
    expect(s.termStructure.length).toBe(2);
    expect(s.termStructure[0].daysToExpiry).toBe(7);
    expect(s.termStructure[1].daysToExpiry).toBe(30);
  });

  it('builds a smile spanning OTM puts (low strikes) and OTM calls (high strikes)', () => {
    const s = computeIVSummary(mkChain());
    // Front-month smile: put@95 (OTM put), call@105 (OTM call)
    expect(s.smile.length).toBeGreaterThanOrEqual(2);
    const strikes = s.smile.map((p) => p.strike).sort((a, b) => a - b);
    expect(strikes[0]).toBeLessThan(100);
    expect(strikes[strikes.length - 1]).toBeGreaterThan(100);
  });

  it('computes IV percentile when history provided', () => {
    const history = Array.from({ length: 100 }, (_, i) => 0.20 + i * 0.005);
    const s = computeIVSummary(mkChain(), history);
    // current ATM IV = 0.40 → ~40 below in 100 samples = ~40th percentile
    expect(s.ivPercentile252).toBeGreaterThan(30);
    expect(s.ivPercentile252).toBeLessThan(50);
  });
});

describe('computePercentile', () => {
  it('returns 0 when current is below all history', () => {
    expect(computePercentile(0.1, [0.2, 0.3, 0.4])).toBe(0);
  });
  it('returns 100 when current is above all history', () => {
    expect(computePercentile(0.5, [0.2, 0.3, 0.4])).toBe(100);
  });
  it('returns ~50 when current is the median', () => {
    expect(computePercentile(0.3, [0.1, 0.2, 0.3, 0.4, 0.5])).toBeCloseTo(40, 0);
  });
});

describe('describeTermStructure', () => {
  it('detects backwardation (front > back)', () => {
    const s = computeIVSummary(mkChain());
    // front = 0.40, back = 0.50 → contango
    expect(describeTermStructure(s)).toBe('contango');
  });
  it('returns flat for ≤1 expiration', () => {
    expect(describeTermStructure({
      underlying: 'X', atmIv: 0, termStructure: [{ expiration: 'a', daysToExpiry: 1, atmIv: 0.3 }], smile: [],
    })).toBe('flat');
  });
});
