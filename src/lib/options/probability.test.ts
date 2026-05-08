import { describe, it, expect } from 'vitest';
import { probAbove, probBelow, probBetween, probTouch, probabilityOfProfit } from './probability';
import { OptionPosition } from '@/types/options';

describe('probAbove / probBelow', () => {
  it('returns 1 if spot already above target with no time', () => {
    expect(probAbove(110, 100, 0.30, 0)).toBe(1);
  });

  it('returns ~0.5 ATM with positive IV and time (small drift)', () => {
    // With rate=0.05 and 1y, drift slightly favors spot > strike → just above 0.5
    const p = probAbove(100, 100, 0.30, 1);
    expect(p).toBeGreaterThan(0.4);
    expect(p).toBeLessThan(0.6);
  });

  it('probAbove + probBelow = 1', () => {
    const a = probAbove(100, 105, 0.30, 0.5);
    const b = probBelow(100, 105, 0.30, 0.5);
    expect(a + b).toBeCloseTo(1, 4);
  });
});

describe('probBetween', () => {
  it('returns 0 when bounds collapse', () => {
    expect(probBetween(100, 100, 100, 0.30, 1)).toBeCloseTo(0, 6);
  });

  it('strictly less than the wider one-sided range', () => {
    const middle = probBetween(100, 95, 105, 0.30, 1);
    const above95 = probAbove(100, 95, 0.30, 1);
    expect(middle).toBeLessThan(above95);
  });
});

describe('probTouch', () => {
  it('approximately 2× tail (capped at 1)', () => {
    const tail = probAbove(100, 110, 0.30, 0.5);
    const touch = probTouch(100, 110, 0.30, 0.5);
    expect(touch).toBeCloseTo(Math.min(1, 2 * tail), 4);
  });
});

describe('probabilityOfProfit', () => {
  it('1-breakeven long call: P = P(spot > BE)', () => {
    const p: OptionPosition = {
      id: 'p',
      underlying: 'T',
      structure: 'single',
      legs: [
        {
          contractSymbol: 'T',
          underlying: 'T',
          expiration: '2026-06-01',
          strike: 100,
          type: 'call',
          instruction: 'BUY_TO_OPEN',
          quantity: 1,
          fillPrice: 1,
          filledAt: new Date(),
        },
      ],
      netCost: 100,
      maxProfit: Infinity,
      maxLoss: 100,
      breakevens: [101], // BE at $101
      openedAt: new Date(),
    };
    const pop = probabilityOfProfit(p, 100, 0.5, 0.30);
    // Spot $100, BE $101 — slightly less than 50%
    expect(pop).toBeGreaterThan(0.4);
    expect(pop).toBeLessThan(0.6);
  });

  it('iron condor with 2 BEs: P = P(spot in [lower, upper])', () => {
    const p: OptionPosition = {
      id: 'p',
      underlying: 'T',
      structure: 'iron_condor',
      legs: [],
      netCost: -200,
      maxProfit: 200,
      maxLoss: 300,
      breakevens: [93, 107],
      openedAt: new Date(),
    };
    const pop = probabilityOfProfit(p, 100, 0.5, 0.30);
    // Wide range around spot, decent IV — should be a healthy POP
    expect(pop).toBeGreaterThan(0.0);
    expect(pop).toBeLessThan(1.0);
  });
});
