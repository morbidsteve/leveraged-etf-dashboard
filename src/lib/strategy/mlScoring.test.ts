import { describe, it, expect } from 'vitest';
import {
  trainLogReg,
  predictProb,
  extractFeatures,
  FEATURE_SPEC,
} from './mlScoring';
import { PaperTrade } from '@/store/paperStore';

function makeTrade(overrides: Partial<PaperTrade> & { realizedPnL: number }): PaperTrade {
  const now = new Date('2026-04-15T15:00:00Z'); // 11am ET
  return {
    id: Math.random().toString(36).slice(2),
    strategyId: 's1',
    ticker: 'SOXL',
    shares: 100,
    entryPrice: 30,
    exitPrice: 30.5,
    entryAt: now,
    exitAt: new Date(now.getTime() + 30 * 60_000),
    reason: 'rsi cross',
    ...overrides,
  };
}

describe('extractFeatures', () => {
  it('produces a vector of FEATURE_SPEC.names length', () => {
    const v = extractFeatures(makeTrade({ realizedPnL: 50 }));
    expect(v.length).toBe(FEATURE_SPEC.names.length);
    expect(v[0]).toBe(1); // bias
  });
  it('one-hots day-of-week correctly', () => {
    // 2026-04-15 is a Wednesday → dow_wed (index 8) should be 1
    const v = extractFeatures(makeTrade({ realizedPnL: 50 }));
    expect(v[8]).toBe(1);
    expect(v[6]).toBe(0); // Mon
    expect(v[10]).toBe(0); // Fri
  });
});

describe('trainLogReg', () => {
  it('returns null below 10 trades', () => {
    const trades = Array.from({ length: 5 }, () => makeTrade({ realizedPnL: 10 }));
    expect(trainLogReg(trades)).toBeNull();
  });
  it('learns a separable signal: morning trades win, afternoon trades lose', () => {
    const trades: PaperTrade[] = [];
    for (let i = 0; i < 30; i++) {
      // morning Wednesday at 10:00 ET
      const morning = new Date('2026-04-15T14:00:00Z');
      trades.push(
        makeTrade({
          entryAt: morning,
          exitAt: new Date(morning.getTime() + 30 * 60_000),
          realizedPnL: 50,
        })
      );
      // afternoon Wednesday at 15:00 ET (3pm)
      const afternoon = new Date('2026-04-15T19:00:00Z');
      trades.push(
        makeTrade({
          entryAt: afternoon,
          exitAt: new Date(afternoon.getTime() + 30 * 60_000),
          realizedPnL: -50,
        })
      );
    }
    const model = trainLogReg(trades);
    expect(model).not.toBeNull();
    if (!model) return;
    const morningProbe = makeTrade({
      entryAt: new Date('2026-04-15T14:00:00Z'),
      exitAt: new Date('2026-04-15T14:30:00Z'),
      realizedPnL: 0,
    });
    const afternoonProbe = makeTrade({
      entryAt: new Date('2026-04-15T19:00:00Z'),
      exitAt: new Date('2026-04-15T19:30:00Z'),
      realizedPnL: 0,
    });
    const pMorning = predictProb(model, morningProbe);
    const pAfternoon = predictProb(model, afternoonProbe);
    // The model should rank morning above afternoon
    expect(pMorning).toBeGreaterThan(pAfternoon);
  });
});
