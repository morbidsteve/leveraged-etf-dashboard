import { describe, it, expect } from 'vitest';
import { computeDispositions, summarizeByTaxYear, generateForm8949CSV } from './tax';
import { Trade } from '@/types';

function mkTrade(over: Partial<Trade> & { ticker: string; entries: Trade['entries']; exits: Trade['exits'] }): Trade {
  return {
    id: 't1',
    status: 'closed',
    avgCost: 0,
    totalShares: 0,
    realizedPnL: 0,
    unrealizedPnL: 0,
    notes: '',
    tags: [],
    createdAt: new Date(),
    ...over,
  } as Trade;
}

describe('computeDispositions FIFO', () => {
  it('matches first lot first, computes gain correctly', () => {
    const t = mkTrade({
      ticker: 'SOXL',
      entries: [
        { id: 'e1', date: new Date('2026-01-15'), price: 100, shares: 50 },
        { id: 'e2', date: new Date('2026-02-15'), price: 110, shares: 50 },
      ],
      exits: [
        { id: 'x1', date: new Date('2026-03-15'), price: 120, shares: 50 },
      ],
    });
    const d = computeDispositions([t], 'FIFO');
    expect(d.length).toBe(1);
    // FIFO sold the Jan 15 lot first
    expect(d[0].acquiredDate.toISOString().slice(0, 10)).toBe('2026-01-15');
    expect(d[0].costBasis).toBe(50 * 100);
    expect(d[0].proceeds).toBe(50 * 120);
    expect(d[0].gainLoss).toBe(50 * 20);
    expect(d[0].isLongTerm).toBe(false);
  });
});

describe('computeDispositions LIFO', () => {
  it('matches last lot first', () => {
    const t = mkTrade({
      ticker: 'SOXL',
      entries: [
        { id: 'e1', date: new Date('2026-01-15'), price: 100, shares: 50 },
        { id: 'e2', date: new Date('2026-02-15'), price: 110, shares: 50 },
      ],
      exits: [
        { id: 'x1', date: new Date('2026-03-15'), price: 120, shares: 50 },
      ],
    });
    const d = computeDispositions([t], 'LIFO');
    // LIFO sold the Feb 15 (most recent) lot first
    expect(d[0].acquiredDate.toISOString().slice(0, 10)).toBe('2026-02-15');
    expect(d[0].costBasis).toBe(50 * 110);
    expect(d[0].gainLoss).toBe(50 * 10);
  });
});

describe('computeDispositions AVERAGE', () => {
  it('uses weighted-average cost', () => {
    const t = mkTrade({
      ticker: 'SOXL',
      entries: [
        { id: 'e1', date: new Date('2026-01-15'), price: 100, shares: 50 },
        { id: 'e2', date: new Date('2026-02-15'), price: 110, shares: 50 },
      ],
      exits: [
        { id: 'x1', date: new Date('2026-03-15'), price: 120, shares: 50 },
      ],
    });
    const d = computeDispositions([t], 'AVERAGE');
    // Average cost = (100*50 + 110*50) / 100 = 105
    expect(d[0].costBasis).toBeCloseTo(50 * 105, 2);
    expect(d[0].gainLoss).toBeCloseTo(50 * 15, 2);
  });
});

describe('long-term vs short-term classification', () => {
  it('marks long-term when held > 365 days', () => {
    const t = mkTrade({
      ticker: 'SOXL',
      entries: [{ id: 'e1', date: new Date('2024-01-15'), price: 100, shares: 50 }],
      exits: [{ id: 'x1', date: new Date('2026-03-15'), price: 120, shares: 50 }],
    });
    const d = computeDispositions([t], 'FIFO');
    expect(d[0].isLongTerm).toBe(true);
  });
});

describe('wash-sale detection', () => {
  it('flags loss with replacement buy within 30 days', () => {
    // Buy 100, sell at 80 (loss), then buy again 10 days later
    const t = mkTrade({
      ticker: 'SOXL',
      entries: [
        { id: 'e1', date: new Date('2026-01-01'), price: 100, shares: 50 },
        { id: 'e2', date: new Date('2026-02-10'), price: 90, shares: 50 }, // replacement buy
      ],
      exits: [
        { id: 'x1', date: new Date('2026-02-01'), price: 80, shares: 50 }, // loss
      ],
    });
    const d = computeDispositions([t], 'FIFO');
    const lossDisp = d.find((x) => x.gainLoss < 0);
    expect(lossDisp?.isWashSale).toBe(true);
    expect(lossDisp?.washSaleAmount).toBe(1000); // 50 × $20 loss
  });
  it('does NOT flag loss when no replacement buy within 30 days', () => {
    const t = mkTrade({
      ticker: 'SOXL',
      entries: [{ id: 'e1', date: new Date('2026-01-01'), price: 100, shares: 50 }],
      exits: [{ id: 'x1', date: new Date('2026-02-01'), price: 80, shares: 50 }],
    });
    const d = computeDispositions([t], 'FIFO');
    expect(d[0].isWashSale).toBe(false);
  });
});

describe('summarizeByTaxYear', () => {
  it('aggregates short/long-term gains correctly', () => {
    // One short-term gain $1000, one long-term loss $500
    const trades: Trade[] = [
      mkTrade({
        ticker: 'A',
        entries: [{ id: 'e1', date: new Date('2026-01-01'), price: 10, shares: 100 }],
        exits: [{ id: 'x1', date: new Date('2026-06-01'), price: 20, shares: 100 }],
      }),
      mkTrade({
        ticker: 'B',
        entries: [{ id: 'e1', date: new Date('2024-01-01'), price: 10, shares: 100 }],
        exits: [{ id: 'x1', date: new Date('2026-06-01'), price: 5, shares: 100 }],
      }),
    ];
    const dispositions = [
      ...computeDispositions(trades.filter((t) => t.ticker === 'A'), 'FIFO'),
      ...computeDispositions(trades.filter((t) => t.ticker === 'B'), 'FIFO'),
    ];
    const summary = summarizeByTaxYear(dispositions);
    expect(summary[0].year).toBe(2026);
    expect(summary[0].netShortTerm).toBe(1000); // gain
    expect(summary[0].netLongTerm).toBe(-500);  // loss
    expect(summary[0].netTotal).toBe(500);
  });
});

describe('generateForm8949CSV', () => {
  it('produces a valid CSV with the expected columns', () => {
    const trades = [
      mkTrade({
        ticker: 'SOXL',
        entries: [{ id: 'e1', date: new Date('2026-01-01'), price: 100, shares: 50 }],
        exits: [{ id: 'x1', date: new Date('2026-06-01'), price: 120, shares: 50 }],
      }),
    ];
    const d = computeDispositions(trades, 'FIFO');
    const csv = generateForm8949CSV(d);
    expect(csv).toContain('Description');
    expect(csv).toContain('SOXL');
    expect(csv).toContain('1000.00');
  });
});
