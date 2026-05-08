import { describe, it, expect } from 'vitest';
import { evaluateGuardrails } from './guardrails';
import { Trade } from '@/types';
import type { PaperTrade } from '@/store/paperStore';

const today = new Date();
today.setHours(10, 0, 0, 0);

const yesterday = new Date(today.getTime() - 26 * 60 * 60 * 1000);

function mkManual(createdAt: Date): Trade {
  return {
    id: 'm-' + createdAt.getTime(),
    ticker: 'SOXL',
    status: 'closed',
    entries: [],
    exits: [],
    avgCost: 0,
    totalShares: 0,
    realizedPnL: 0,
    unrealizedPnL: 0,
    notes: '',
    tags: [],
    createdAt,
  };
}

function mkPaper(entryAt: Date): PaperTrade {
  return {
    id: 'p-' + entryAt.getTime(),
    strategyId: 's1',
    strategyName: 'test',
    ticker: 'SOXL',
    entryAt,
    entryPrice: 10,
    exitAt: entryAt,
    exitPrice: 11,
    shares: 100,
    realizedPnL: 100,
    realizedPnLPct: 10,
    holdMinutes: 5,
    exitReason: 'test',
  } as unknown as PaperTrade;
}

describe('evaluateGuardrails', () => {
  it('returns no block when both caps disabled', () => {
    const r = evaluateGuardrails({
      manualTrades: [],
      paperTrades: [],
      dayPnL: -1000,
      now: today,
    });
    expect(r.entriesBlocked).toBe(false);
    expect(r.blockReason).toBeNull();
  });

  it('blocks when trades-today >= maxTradesPerDay', () => {
    const r = evaluateGuardrails({
      manualTrades: [mkManual(today), mkManual(today)],
      paperTrades: [mkPaper(today)],
      dayPnL: 0,
      maxTradesPerDay: 3,
      now: today,
    });
    expect(r.tradesToday).toBe(3);
    expect(r.entriesBlocked).toBe(true);
    expect(r.blockReason).toMatch(/trade limit/i);
  });

  it('does not count yesterday\'s trades toward today', () => {
    const r = evaluateGuardrails({
      manualTrades: [mkManual(yesterday), mkManual(yesterday), mkManual(today)],
      paperTrades: [],
      dayPnL: 0,
      maxTradesPerDay: 3,
      now: today,
    });
    expect(r.tradesToday).toBe(1);
    expect(r.entriesBlocked).toBe(false);
  });

  it('blocks when day P&L drops at or below -dailyLossLimit', () => {
    const r = evaluateGuardrails({
      manualTrades: [],
      paperTrades: [],
      dayPnL: -500,
      dailyLossLimit: 500,
      now: today,
    });
    expect(r.entriesBlocked).toBe(true);
    expect(r.blockReason).toMatch(/loss limit/i);
  });

  it('does not block on positive P&L when only loss limit set', () => {
    const r = evaluateGuardrails({
      manualTrades: [],
      paperTrades: [],
      dayPnL: 800,
      dailyLossLimit: 500,
      now: today,
    });
    expect(r.entriesBlocked).toBe(false);
  });

  it('treats 0 / undefined caps as disabled', () => {
    const r = evaluateGuardrails({
      manualTrades: [mkManual(today), mkManual(today), mkManual(today), mkManual(today)],
      paperTrades: [],
      dayPnL: -100000,
      maxTradesPerDay: 0,
      dailyLossLimit: undefined,
      now: today,
    });
    expect(r.entriesBlocked).toBe(false);
  });
});
