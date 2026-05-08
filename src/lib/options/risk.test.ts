import { describe, it, expect } from 'vitest';
import { estimateBuyingPower, plAtExpiration, plCurve } from './risk';
import { OptionLeg, OptionPosition } from '@/types/options';

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

function position(over: Partial<OptionPosition>): OptionPosition {
  return {
    id: 'p1',
    underlying: 'TEST',
    structure: 'single',
    legs: [leg({})],
    netCost: 100,
    maxProfit: Infinity,
    maxLoss: 100,
    breakevens: [101],
    openedAt: new Date(),
    ...over,
  };
}

describe('estimateBuyingPower', () => {
  it('long single = debit', () => {
    const p = position({});
    expect(estimateBuyingPower(p.structure, p.legs, p.netCost, 100)).toBe(100);
  });

  it('vertical credit spread = max loss (width − credit)', () => {
    const p = position({
      structure: 'vertical',
      legs: [
        leg({ type: 'put', instruction: 'SELL_TO_OPEN', strike: 100 }),
        leg({ type: 'put', instruction: 'BUY_TO_OPEN', strike: 95 }),
      ],
      netCost: -150, // received credit
    });
    expect(estimateBuyingPower(p.structure, p.legs, p.netCost, 100)).toBe(350); // 500 - 150
  });

  it('naked short call ≈ 20% rule', () => {
    // ATM 100 call, sold for $1 ($100 credit)
    const bp = estimateBuyingPower(
      'single',
      [leg({ type: 'call', instruction: 'SELL_TO_OPEN', strike: 100 })],
      -100,
      100
    );
    // 20% × 100 × 100 + 100 - 0 = 2100
    expect(bp).toBeGreaterThan(1000);
  });
});

describe('plAtExpiration', () => {
  it('long call: profitable when spot > strike + premium', () => {
    const p = position({
      structure: 'single',
      legs: [leg({ type: 'call', strike: 100, instruction: 'BUY_TO_OPEN' })],
      netCost: 100,
    });
    expect(plAtExpiration(p, 95)).toBe(-100); // OTM, lose premium
    expect(plAtExpiration(p, 100)).toBe(-100); // ATM, lose premium
    expect(plAtExpiration(p, 105)).toBe(400); // ITM 5pts × 100 - 100 paid
  });

  it('short put credit spread: max profit at expiry above short strike', () => {
    const p = position({
      structure: 'vertical',
      legs: [
        leg({ type: 'put', strike: 100, instruction: 'SELL_TO_OPEN' }),
        leg({ type: 'put', strike: 95, instruction: 'BUY_TO_OPEN' }),
      ],
      netCost: -150,
    });
    expect(plAtExpiration(p, 105)).toBe(150); // both expire worthless, keep credit
    expect(plAtExpiration(p, 90)).toBe(-350); // max loss: width 500 - 150 credit
  });
});

describe('plCurve', () => {
  it('returns the requested number of samples spanning the range', () => {
    const p = position({});
    const curve = plCurve(p, 100, 0.10, 21);
    expect(curve.length).toBe(21);
    expect(curve[0].price).toBeCloseTo(90, 1);
    expect(curve[curve.length - 1].price).toBeCloseTo(110, 1);
  });
});
