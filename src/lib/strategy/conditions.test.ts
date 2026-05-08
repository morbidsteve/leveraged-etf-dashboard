import { describe, it, expect } from 'vitest';
import { evaluate, describeCondition } from './conditions';
import { ConditionTree, DataContext } from '@/types/strategy';

const ctx = (over: Partial<DataContext> = {}): DataContext => ({
  ticker: 'SOXL',
  price: 50,
  rsi: { 250: 50 },
  ema: { 20: 50, 50: 50 },
  sma: { 20: 50 },
  vwap: 50,
  volume: 1000,
  timestamp: new Date('2026-05-07T14:30:00Z'),
  ...over,
});

describe('evaluate · compare', () => {
  it('handles >', () => {
    const c: ConditionTree = {
      type: 'compare',
      left: { kind: 'price' },
      op: '>',
      right: { kind: 'literal', value: 49 },
    };
    expect(evaluate(c, ctx({ price: 50 }), null)).toBe(true);
    expect(evaluate(c, ctx({ price: 48 }), null)).toBe(false);
  });

  it('returns false on missing values', () => {
    const c: ConditionTree = {
      type: 'compare',
      left: { kind: 'rsi', period: 999 }, // no such period
      op: '>',
      right: { kind: 'literal', value: 50 },
    };
    expect(evaluate(c, ctx(), null)).toBe(false);
  });
});

describe('evaluate · cross', () => {
  it('fires on rsi crossing below threshold', () => {
    const c: ConditionTree = {
      type: 'cross',
      target: { kind: 'rsi', period: 250 },
      threshold: { kind: 'literal', value: 50 },
      dir: 'below',
    };
    const prev = ctx({ rsi: { 250: 51 } });
    const curr = ctx({ rsi: { 250: 49 } });
    expect(evaluate(c, curr, prev)).toBe(true);
  });

  it('does not fire when curr equals threshold but prev was below', () => {
    const c: ConditionTree = {
      type: 'cross',
      target: { kind: 'rsi', period: 250 },
      threshold: { kind: 'literal', value: 50 },
      dir: 'below',
    };
    const prev = ctx({ rsi: { 250: 49 } });
    const curr = ctx({ rsi: { 250: 49 } });
    expect(evaluate(c, curr, prev)).toBe(false);
  });

  it('does not fire on first tick (no prev)', () => {
    const c: ConditionTree = {
      type: 'cross',
      target: { kind: 'rsi', period: 250 },
      threshold: { kind: 'literal', value: 50 },
      dir: 'below',
    };
    expect(evaluate(c, ctx({ rsi: { 250: 49 } }), null)).toBe(false);
  });

  it('fires on rsi crossing above threshold', () => {
    const c: ConditionTree = {
      type: 'cross',
      target: { kind: 'rsi', period: 250 },
      threshold: { kind: 'literal', value: 55 },
      dir: 'above',
    };
    const prev = ctx({ rsi: { 250: 54 } });
    const curr = ctx({ rsi: { 250: 56 } });
    expect(evaluate(c, curr, prev)).toBe(true);
  });
});

describe('evaluate · AND/OR/NOT', () => {
  const a: ConditionTree = { type: 'compare', left: { kind: 'price' }, op: '>', right: { kind: 'literal', value: 49 } };
  const b: ConditionTree = { type: 'compare', left: { kind: 'price' }, op: '<', right: { kind: 'literal', value: 100 } };
  const c: ConditionTree = { type: 'compare', left: { kind: 'price' }, op: '>', right: { kind: 'literal', value: 200 } };

  it('AND requires every child true', () => {
    expect(evaluate({ type: 'and', children: [a, b] }, ctx(), null)).toBe(true);
    expect(evaluate({ type: 'and', children: [a, c] }, ctx(), null)).toBe(false);
  });

  it('OR requires any child true', () => {
    expect(evaluate({ type: 'or', children: [a, c] }, ctx(), null)).toBe(true);
    expect(evaluate({ type: 'or', children: [c, c] }, ctx(), null)).toBe(false);
  });

  it('NOT inverts', () => {
    expect(evaluate({ type: 'not', child: a }, ctx(), null)).toBe(false);
    expect(evaluate({ type: 'not', child: c }, ctx(), null)).toBe(true);
  });
});

describe('evaluate · time_window', () => {
  it('matches inside the window', () => {
    const c: ConditionTree = { type: 'time_window', start: '09:30', end: '16:00' };
    const t = new Date();
    t.setHours(12, 0, 0, 0);
    expect(evaluate(c, ctx({ timestamp: t }), null)).toBe(true);
  });

  it('does not match outside the window', () => {
    const c: ConditionTree = { type: 'time_window', start: '09:30', end: '16:00' };
    const t = new Date();
    t.setHours(8, 0, 0, 0);
    expect(evaluate(c, ctx({ timestamp: t }), null)).toBe(false);
  });
});

describe('describeCondition', () => {
  it('produces a stable string for compare', () => {
    const c: ConditionTree = {
      type: 'compare',
      left: { kind: 'rsi', period: 250 },
      op: '<',
      right: { kind: 'literal', value: 50 },
    };
    expect(describeCondition(c)).toBe('rsi(250) < 50');
  });

  it('produces a stable string for AND', () => {
    const c: ConditionTree = {
      type: 'and',
      children: [
        { type: 'compare', left: { kind: 'price' }, op: '>', right: { kind: 'vwap' } },
        { type: 'compare', left: { kind: 'rsi', period: 250 }, op: '<', right: { kind: 'literal', value: 50 } },
      ],
    };
    expect(describeCondition(c)).toContain('AND');
    expect(describeCondition(c)).toContain('price > vwap');
  });
});
