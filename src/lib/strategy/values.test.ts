import { describe, it, expect } from 'vitest';
import { evaluateValue, describeValue } from './values';
import { DataContext, ValueRef } from '@/types/strategy';

const ctx: DataContext = {
  ticker: 'SOXL',
  price: 50,
  rsi: { 250: 48 },
  ema: { 20: 49 },
  sma: { 20: 50 },
  vwap: 51,
  volume: 1234,
  timestamp: new Date('2026-05-07T13:35:00Z'),
};

describe('evaluateValue', () => {
  it('returns literal as-is', () => {
    expect(evaluateValue({ kind: 'literal', value: 42 }, ctx)).toBe(42);
  });

  it('reads price', () => {
    expect(evaluateValue({ kind: 'price' }, ctx)).toBe(50);
  });

  it('reads rsi by period', () => {
    expect(evaluateValue({ kind: 'rsi', period: 250 }, ctx)).toBe(48);
  });

  it('returns null for missing rsi period', () => {
    expect(evaluateValue({ kind: 'rsi', period: 14 }, ctx)).toBeNull();
  });

  it('reads vwap', () => {
    expect(evaluateValue({ kind: 'vwap' }, ctx)).toBe(51);
  });

  it('computes pct_of', () => {
    // 50 × (1 + 1.5%) = 50.75
    const v: ValueRef = { kind: 'pct_of', base: { kind: 'literal', value: 50 }, pct: 1.5 };
    expect(evaluateValue(v, ctx)).toBeCloseTo(50.75, 6);
  });

  it('handles negative pct (stop loss)', () => {
    const v: ValueRef = { kind: 'pct_of', base: { kind: 'literal', value: 100 }, pct: -1 };
    expect(evaluateValue(v, ctx)).toBeCloseTo(99, 6);
  });

  it('returns null for entry_price when not set', () => {
    expect(evaluateValue({ kind: 'entry_price' }, ctx)).toBeNull();
  });

  it('returns entry_price when set on context', () => {
    expect(evaluateValue({ kind: 'entry_price' }, { ...ctx, entryPrice: 50 })).toBe(50);
  });
});

describe('describeValue', () => {
  it('formats rsi with period', () => {
    expect(describeValue({ kind: 'rsi', period: 250 })).toBe('rsi(250)');
  });
  it('formats rsi with timeframe', () => {
    expect(describeValue({ kind: 'rsi', period: 50, tf: '5m' })).toBe('rsi(50)@5m');
  });
  it('formats price', () => {
    expect(describeValue({ kind: 'price' })).toBe('price');
  });
});
