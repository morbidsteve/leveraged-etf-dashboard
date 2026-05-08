import { describe, it, expect } from 'vitest';
import { parseCondition } from './nlparser';

describe('parseCondition', () => {
  it('parses "rsi(250) crosses below 50"', () => {
    const r = parseCondition('rsi(250) crosses below 50');
    expect(r.tree).not.toBeNull();
    expect(r.tree?.type).toBe('cross');
    if (r.tree?.type === 'cross') {
      expect(r.tree.dir).toBe('below');
      expect(r.tree.target).toEqual({ kind: 'rsi', period: 250 });
      expect(r.tree.threshold).toEqual({ kind: 'literal', value: 50 });
    }
  });

  it('parses "rsi(250) crosses above 55"', () => {
    const r = parseCondition('rsi(250) crosses above 55');
    expect(r.tree?.type).toBe('cross');
    if (r.tree?.type === 'cross') {
      expect(r.tree.dir).toBe('above');
    }
  });

  it('parses compound AND', () => {
    const r = parseCondition('rsi(250) crosses below 50 AND price > vwap');
    expect(r.tree?.type).toBe('and');
    if (r.tree?.type === 'and') {
      expect(r.tree.children.length).toBe(2);
    }
  });

  it('parses compound OR', () => {
    const r = parseCondition('price > 100 OR rsi(250) > 60');
    expect(r.tree?.type).toBe('or');
  });

  it('parses simple compare', () => {
    const r = parseCondition('price > vwap');
    expect(r.tree?.type).toBe('compare');
  });

  it('returns null tree on empty input', () => {
    const r = parseCondition('');
    expect(r.tree).toBeNull();
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('reports unparsed clauses without failing', () => {
    const r = parseCondition('rsi(250) crosses below 50 AND xyzzy nonsense');
    expect(r.tree).not.toBeNull();
    expect(r.unparsed.length).toBeGreaterThan(0);
  });
});
