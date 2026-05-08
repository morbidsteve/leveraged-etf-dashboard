import { describe, it, expect } from 'vitest';
import { classifyRegime } from './regime';
import { Candle } from '@/types';

function mk(closes: number[]): Candle[] {
  return closes.map((c, i) => ({ time: 1700000000 + i * 60, open: c, high: c, low: c, close: c, volume: 1000 }));
}

describe('classifyRegime', () => {
  it('returns sideways with insufficient data', () => {
    expect(classifyRegime(mk([1, 2, 3])).regime).toBe('sideways');
  });

  it('classifies clean uptrend as bull', () => {
    const closes = Array.from({ length: 100 }, (_, i) => 100 + i * 0.5);
    const r = classifyRegime(mk(closes));
    expect(r.trend).toBe('up');
    expect(r.regime).toMatch(/bull/);
  });

  it('classifies clean downtrend as bear', () => {
    const closes = Array.from({ length: 100 }, (_, i) => 200 - i * 0.5);
    const r = classifyRegime(mk(closes));
    expect(r.trend).toBe('down');
    expect(r.regime).toMatch(/bear/);
  });

  it('classifies flat as sideways', () => {
    const closes = Array.from({ length: 100 }, () => 100 + (Math.random() - 0.5) * 0.1);
    const r = classifyRegime(mk(closes));
    expect(r.regime).toBe('sideways');
  });
});
