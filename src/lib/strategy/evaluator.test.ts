import { describe, it, expect } from 'vitest';
import { tick, initialRuntime } from './evaluator';
import { Strategy, DataContext, ConditionTree } from '@/types/strategy';

const baseStrategy: Strategy = {
  id: 's1',
  name: 'Test',
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
    } as ConditionTree,
  },
  exit: {
    when: {
      type: 'compare',
      left: { kind: 'price' },
      op: '>=',
      right: { kind: 'pct_of', base: { kind: 'entry_price' }, pct: 1.5 },
    } as ConditionTree,
  },
  cooldownMinutes: 5,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mkCtx = (over: Partial<DataContext> = {}): DataContext => ({
  ticker: 'SOXL',
  price: 50,
  rsi: { 250: 51 },
  ema: { 20: 50, 50: 50 },
  sma: { 20: 50 },
  vwap: 50,
  volume: 1000,
  timestamp: new Date('2026-05-07T13:35:00Z'),
  ...over,
});

describe('tick state machine', () => {
  it('idle → armed when enabled', () => {
    const r = tick({
      strategy: baseStrategy,
      runtime: initialRuntime('s1', 'SOXL'),
      prevCtx: null,
      currCtx: mkCtx(),
      now: new Date(),
    });
    expect(r.runtime.state).toBe('armed');
    expect(r.events.find((e) => e.detail.includes('idle → armed'))).toBeTruthy();
  });

  it('armed → in_position on entry condition fire', () => {
    const armed = { ...initialRuntime('s1', 'SOXL'), state: 'armed' as const };
    const prev = mkCtx({ rsi: { 250: 51 } });
    const curr = mkCtx({ rsi: { 250: 49 } });
    const r = tick({ strategy: baseStrategy, runtime: armed, prevCtx: prev, currCtx: curr, now: new Date() });
    expect(r.runtime.state).toBe('in_position');
    expect(r.actions.length).toBe(1);
    expect(r.actions[0].kind).toBe('enter');
  });

  it('does not fire when disabled, returns runtime to idle', () => {
    const armed = { ...initialRuntime('s1', 'SOXL'), state: 'armed' as const };
    const prev = mkCtx({ rsi: { 250: 51 } });
    const curr = mkCtx({ rsi: { 250: 49 } });
    const r = tick({
      strategy: { ...baseStrategy, enabled: false },
      runtime: armed,
      prevCtx: prev,
      currCtx: curr,
      now: new Date(),
    });
    expect(r.runtime.state).toBe('idle');
    expect(r.actions.length).toBe(0);
  });

  it('in_position → cooldown on target hit', () => {
    const inPos = {
      ...initialRuntime('s1', 'SOXL'),
      state: 'in_position' as const,
      entryPrice: 50,
      entryAt: new Date('2026-05-07T13:00:00Z'),
      shares: 100,
    };
    const curr = mkCtx({ price: 50.8 }); // > 50 × 1.015
    const r = tick({ strategy: baseStrategy, runtime: inPos, prevCtx: mkCtx({ price: 50 }), currCtx: curr, now: new Date() });
    expect(r.runtime.state).toBe('cooldown');
    expect(r.actions.length).toBe(1);
    expect(r.actions[0].kind).toBe('exit');
  });

  it('cooldown → armed once cooldownUntil passes', () => {
    const past = new Date(Date.now() - 60_000);
    const cooldown = {
      ...initialRuntime('s1', 'SOXL'),
      state: 'cooldown' as const,
      cooldownUntil: past,
    };
    const r = tick({ strategy: baseStrategy, runtime: cooldown, prevCtx: null, currCtx: mkCtx(), now: new Date() });
    expect(r.runtime.state).toBe('armed');
  });

  it('safety stop fires when price drops below entry × (1 - stopPct)', () => {
    const stratWithStop: Strategy = { ...baseStrategy, stopLoss: { pct: 1 } };
    const inPos = {
      ...initialRuntime('s1', 'SOXL'),
      state: 'in_position' as const,
      entryPrice: 50,
      entryAt: new Date('2026-05-07T13:00:00Z'),
      shares: 100,
    };
    // Price 49.4 ≤ 50 × 0.99 = 49.5 → stop
    const curr = mkCtx({ price: 49.4 });
    const r = tick({ strategy: stratWithStop, runtime: inPos, prevCtx: mkCtx({ price: 50 }), currCtx: curr, now: new Date() });
    expect(r.runtime.state).toBe('cooldown');
    expect(r.actions[0].kind).toBe('exit');
    expect(r.actions[0].reason).toMatch(/stop/i);
  });
});
