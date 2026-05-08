import { describe, it, expect } from 'vitest';
import { replayCondition } from './replay';
import { ConditionTree } from '@/types/strategy';
import { Candle } from '@/types';

function mkCandles(closes: number[]): Candle[] {
  return closes.map((close, i) => ({
    time: 1700000000 + i * 60,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
  }));
}

describe('replayCondition', () => {
  it('returns no bars and ready=false on empty input', () => {
    const r = replayCondition({
      condition: { type: 'compare', left: { kind: 'price' }, op: '>', right: { kind: 'literal', value: 0 } },
      candles: [],
      ticker: 'TEST',
    });
    expect(r.bars.length).toBe(0);
    expect(r.ready).toBe(false);
  });

  it('marks bars where price > 100 as fired', () => {
    const cond: ConditionTree = {
      type: 'compare',
      left: { kind: 'price' },
      op: '>',
      right: { kind: 'literal', value: 100 },
    };
    const closes = [50, 110, 90, 120, 80, 200];
    const r = replayCondition({
      condition: cond,
      candles: mkCandles(closes),
      ticker: 'TEST',
    });
    expect(r.bars.length).toBe(closes.length);
    expect(r.bars.map((b) => b.fired)).toEqual([false, true, false, true, false, true]);
  });

  it('detects RSI cross-below transitions across consecutive bars', () => {
    // Set up enough bars for RSI(14) warmup, then engineer a clean cross
    // from above 50 to below 50.
    const closes: number[] = [];
    // Strong uptrend → RSI well above 50
    for (let i = 0; i < 30; i++) closes.push(100 + i);
    // Then sharp drop → RSI plummets below 50
    for (let i = 0; i < 20; i++) closes.push(130 - i * 3);
    const cond: ConditionTree = {
      type: 'cross',
      target: { kind: 'rsi', period: 14 },
      threshold: { kind: 'literal', value: 50 },
      dir: 'below',
    };
    const r = replayCondition({
      condition: cond,
      candles: mkCandles(closes),
      ticker: 'TEST',
      rsiConfig: { period: 14, oversold: 50, overbought: 70 },
    });
    const fireCount = r.bars.filter((b) => b.fired).length;
    // At least one cross should occur as RSI sweeps through 50
    expect(fireCount).toBeGreaterThanOrEqual(1);
  });

  it('respects lastN to slice the visible window', () => {
    const closes = Array.from({ length: 100 }, (_, i) => 50 + (i % 5));
    const r = replayCondition({
      condition: { type: 'compare', left: { kind: 'price' }, op: '>', right: { kind: 'literal', value: 0 } },
      candles: mkCandles(closes),
      ticker: 'TEST',
      lastN: 20,
    });
    expect(r.bars.length).toBe(20);
    // Last bar's time should match the last candle
    expect(r.bars[r.bars.length - 1].time).toBe(closes.length * 60 + 1700000000 - 60);
  });
});
