import { describe, it, expect } from 'vitest';
import { computeStructureRisk } from './optionsStore';
import { OptionLeg } from '@/types/options';

function leg(over: Partial<OptionLeg>): OptionLeg {
  return {
    contractSymbol: 'TEST',
    underlying: 'TEST',
    expiration: '2026-06-01',
    strike: 100,
    type: 'call',
    instruction: 'BUY_TO_OPEN',
    quantity: 1,
    fillPrice: 1,
    filledAt: new Date(),
    ...over,
  };
}

describe('computeStructureRisk · single', () => {
  it('long call: max loss = premium, max profit = unbounded', () => {
    const legs = [leg({ type: 'call', instruction: 'BUY_TO_OPEN', strike: 100 })];
    const r = computeStructureRisk('single', legs, 100); // $1 × 1 × 100
    expect(r.maxLoss).toBe(100);
    expect(r.maxProfit).toBe(Infinity);
    expect(r.breakevens).toEqual([101]);
  });

  it('long put: max loss = premium, max profit = strike × 100', () => {
    const legs = [leg({ type: 'put', instruction: 'BUY_TO_OPEN', strike: 100 })];
    const r = computeStructureRisk('single', legs, 100);
    expect(r.maxLoss).toBe(100);
    expect(r.maxProfit).toBe(10000); // strike × 100 × qty
    expect(r.breakevens).toEqual([99]);
  });

  it('short call: max profit = premium, max loss = unbounded (warn)', () => {
    const legs = [leg({ type: 'call', instruction: 'SELL_TO_OPEN', strike: 100 })];
    const r = computeStructureRisk('single', legs, -100); // received $1
    expect(r.maxProfit).toBe(100);
    expect(r.maxLoss).toBe(Infinity);
  });
});

describe('computeStructureRisk · vertical', () => {
  it('bull put credit spread: max profit = credit, max loss = width − credit', () => {
    // Sell 100 put, buy 95 put → width 5 × 100 = 500. Credit 1.50 → $150.
    const legs = [
      leg({ type: 'put', instruction: 'SELL_TO_OPEN', strike: 100 }),
      leg({ type: 'put', instruction: 'BUY_TO_OPEN', strike: 95 }),
    ];
    const r = computeStructureRisk('vertical', legs, -150); // received credit
    expect(r.maxProfit).toBe(150);
    expect(r.maxLoss).toBe(350); // 500 - 150
    expect(r.breakevens.length).toBe(1);
    expect(r.breakevens[0]).toBeCloseTo(98.5, 2); // short strike - credit/qty/100
  });

  it('bull call debit spread: max profit = width − debit, max loss = debit', () => {
    // Buy 100 call, sell 105 call → width 5 × 100 = 500. Debit 2.50 → $250.
    const legs = [
      leg({ type: 'call', instruction: 'BUY_TO_OPEN', strike: 100 }),
      leg({ type: 'call', instruction: 'SELL_TO_OPEN', strike: 105 }),
    ];
    const r = computeStructureRisk('vertical', legs, 250); // paid debit
    expect(r.maxProfit).toBe(250); // 500 - 250
    expect(r.maxLoss).toBe(250);
    expect(r.breakevens[0]).toBeCloseTo(102.5, 2);
  });
});

describe('computeStructureRisk · iron_condor', () => {
  it('credit IC: max profit = credit, max loss = wider wing − credit', () => {
    // Wings 5 wide each, qty 1, credit $200
    const legs = [
      leg({ type: 'put', instruction: 'BUY_TO_OPEN', strike: 90 }),
      leg({ type: 'put', instruction: 'SELL_TO_OPEN', strike: 95 }),
      leg({ type: 'call', instruction: 'SELL_TO_OPEN', strike: 105 }),
      leg({ type: 'call', instruction: 'BUY_TO_OPEN', strike: 110 }),
    ];
    const r = computeStructureRisk('iron_condor', legs, -200);
    expect(r.maxProfit).toBe(200);
    expect(r.maxLoss).toBe(300); // 500 wing - 200 credit
    expect(r.breakevens.length).toBe(2);
    expect(r.breakevens[0]).toBeCloseTo(93, 2); // short put - credit
    expect(r.breakevens[1]).toBeCloseTo(107, 2); // short call + credit
  });
});
