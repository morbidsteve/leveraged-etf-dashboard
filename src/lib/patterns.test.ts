import { describe, it, expect } from 'vitest';
import { detectPatterns } from './patterns';
import { Candle } from '@/types';

function mkCandle(over: Partial<Candle> & { open: number; high: number; low: number; close: number }): Candle {
  return { time: 1700000000, volume: 1000, ...over };
}

describe('detectPatterns', () => {
  it('detects doji on tiny-body candle', () => {
    const c = mkCandle({ open: 100, high: 102, low: 98, close: 100.05 });
    const p = detectPatterns([c]);
    expect(p.find((m) => m.pattern === 'doji')).toBeDefined();
  });

  it('detects hammer (small body at top, long lower shadow)', () => {
    const c = mkCandle({ open: 100, high: 100.5, low: 95, close: 100.2 });
    const p = detectPatterns([c]);
    expect(p.find((m) => m.pattern === 'hammer')).toBeDefined();
  });

  it('detects bullish engulfing (red then larger green)', () => {
    const c1 = mkCandle({ open: 100, high: 101, low: 99, close: 99.5 });
    const c2 = mkCandle({ open: 99.4, high: 102, low: 99.3, close: 101.5, time: 1700000060 });
    const p = detectPatterns([c1, c2]);
    expect(p.find((m) => m.pattern === 'bullish_engulfing')).toBeDefined();
  });

  it('detects bearish engulfing (green then larger red)', () => {
    const c1 = mkCandle({ open: 100, high: 100.5, low: 99.8, close: 100.3 });
    const c2 = mkCandle({ open: 100.4, high: 100.5, low: 98, close: 98.5, time: 1700000060 });
    const p = detectPatterns([c1, c2]);
    expect(p.find((m) => m.pattern === 'bearish_engulfing')).toBeDefined();
  });

  it('detects three white soldiers', () => {
    const c1 = mkCandle({ open: 100, high: 101.5, low: 99.5, close: 101 });
    const c2 = mkCandle({ open: 100.7, high: 102.5, low: 100.5, close: 102, time: 1700000060 });
    const c3 = mkCandle({ open: 101.7, high: 103.5, low: 101.5, close: 103, time: 1700000120 });
    const p = detectPatterns([c1, c2, c3]);
    expect(p.find((m) => m.pattern === 'three_white_soldiers')).toBeDefined();
  });

  it('marks bias correctly', () => {
    const hammer = mkCandle({ open: 100, high: 100.5, low: 95, close: 100.2 });
    const p = detectPatterns([hammer]);
    const h = p.find((m) => m.pattern === 'hammer');
    expect(h?.bias).toBe('bullish');
  });
});
