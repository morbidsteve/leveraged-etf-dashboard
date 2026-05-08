import { describe, it, expect } from 'vitest';
import { explainStrategy } from './explainer';
import { Strategy } from '@/types/strategy';

const baseStrategy: Strategy = {
  id: 's1',
  name: 'RSI scalp',
  tickers: ['SOXL'],
  enabled: true,
  mode: 'paper',
  size: { kind: 'shares', n: 100 },
  entry: {
    when: {
      type: 'cross',
      target: { kind: 'rsi', period: 250 },
      threshold: { kind: 'literal', value: 50 },
      dir: 'below',
    },
  },
  exit: {
    when: {
      type: 'compare',
      left: { kind: 'price' },
      op: '>=',
      right: { kind: 'pct_of', base: { kind: 'entry_price' }, pct: 1.5 },
    },
  },
  cooldownMinutes: 5,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('explainStrategy', () => {
  it('produces a one-sentence summary', () => {
    const e = explainStrategy(baseStrategy);
    expect(e.summary).toContain('RSI scalp');
    expect(e.summary).toContain('SOXL');
  });

  it('describes the entry condition in English', () => {
    const e = explainStrategy(baseStrategy);
    expect(e.entry).toContain('crosses below');
    expect(e.entry).toContain('RSI(250)');
    expect(e.entry).toContain('50');
  });

  it('describes the exit condition in English', () => {
    const e = explainStrategy(baseStrategy);
    expect(e.exit).toContain('price');
    expect(e.exit).toContain('plus 1.5%');
  });

  it('warns about no stop loss in auto mode', () => {
    const auto = { ...baseStrategy, mode: 'auto' as const };
    const e = explainStrategy(auto);
    expect(e.warnings.some((w) => w.includes('safety stop'))).toBe(true);
  });

  it('does not warn about stop loss in paper mode', () => {
    const e = explainStrategy(baseStrategy);
    expect(e.warnings.some((w) => w.includes('safety stop'))).toBe(false);
  });

  it('explains cross-asset triggers', () => {
    const cross: Strategy = {
      ...baseStrategy,
      tickers: ['TQQQ'],
      entry: {
        when: {
          type: 'compare',
          left: { kind: 'price', ticker: 'SPY' },
          op: '>=',
          right: { kind: 'literal', value: 600 },
        },
      },
    };
    const e = explainStrategy(cross);
    expect(e.warnings.some((w) => w.includes('Cross-asset'))).toBe(true);
    expect(e.entry).toContain("SPY's price");
  });

  it('produces a sizing description', () => {
    const e = explainStrategy(baseStrategy);
    expect(e.sizing).toContain('100 shares');
  });
});
