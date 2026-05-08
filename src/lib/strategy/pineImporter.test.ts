import { describe, it, expect } from 'vitest';
import { importPine } from './pineImporter';

describe('importPine', () => {
  it('parses ta.crossunder(rsi, 50)', () => {
    const r = importPine('entry = ta.crossunder(ta.rsi(close, 250), 50)');
    expect(r.tree).not.toBeNull();
    expect(r.tree?.type).toBe('cross');
    if (r.tree?.type === 'cross') {
      expect(r.tree.dir).toBe('below');
      expect(r.tree.threshold).toEqual({ kind: 'literal', value: 50 });
    }
  });

  it('parses ta.crossover(rsi, 55)', () => {
    const r = importPine('exit = ta.crossover(ta.rsi(close, 250), 55)');
    expect(r.tree?.type).toBe('cross');
    if (r.tree?.type === 'cross') {
      expect(r.tree.dir).toBe('above');
    }
  });

  it('parses simple comparison close > vwap', () => {
    const r = importPine('cond = close > ta.vwap');
    expect(r.tree?.type).toBe('compare');
  });

  it('parses AND combinator', () => {
    const r = importPine('cond = ta.crossunder(ta.rsi(close, 250), 50) and close > ta.vwap');
    expect(r.tree?.type).toBe('and');
    if (r.tree?.type === 'and') {
      expect(r.tree.children.length).toBe(2);
    }
  });

  it('parses OR combinator', () => {
    const r = importPine('cond = close > 100 or ta.rsi(close, 14) < 30');
    expect(r.tree?.type).toBe('or');
  });

  it('reports error on unsupported syntax', () => {
    const r = importPine('cond = ta.fancy_indicator(close)');
    expect(r.tree).toBeNull();
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('returns null tree when no condition found', () => {
    const r = importPine('// just comments\nint x = 5');
    expect(r.tree).toBeNull();
  });
});
