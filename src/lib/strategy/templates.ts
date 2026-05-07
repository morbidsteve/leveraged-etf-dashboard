import { Strategy } from '@/types/strategy';

/**
 * The user's exact RSI scalp strategy as a pre-built template.
 *
 * Buy when RSI(250) crosses below 50; sell when price reaches entry × 1.015
 * (the +1.5% target). Optional 1% safety stop loss.
 */
export function userRsiScalpTemplate(opts: {
  ticker?: string;
  shares?: number;
  rsiPeriod?: number;
  oversold?: number;
  overbought?: number;
  targetPct?: number;
  safetyStopPct?: number;
} = {}): Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'> {
  const ticker = opts.ticker ?? 'SOXL';
  const shares = opts.shares ?? 100;
  const period = opts.rsiPeriod ?? 250;
  const oversold = opts.oversold ?? 50;
  const overbought = opts.overbought ?? 55;
  const targetPct = opts.targetPct ?? 1.5;
  const safetyStopPct = opts.safetyStopPct ?? 1;

  return {
    name: `RSI scalp · ${ticker}`,
    ticker,
    enabled: false,                  // user opts in explicitly
    mode: 'paper',                   // safe default
    size: { kind: 'shares', n: shares },
    rsiConfig: { period, oversold, overbought },
    entry: {
      when: {
        type: 'cross',
        target: { kind: 'rsi', period },
        threshold: { kind: 'literal', value: oversold },
        dir: 'below',
      },
    },
    exit: {
      when: {
        type: 'compare',
        left: { kind: 'price' },
        op: '>=',
        right: { kind: 'pct_of', base: { kind: 'entry_price' }, pct: targetPct },
      },
    },
    stopLoss: { pct: safetyStopPct },
    cooldownMinutes: 5,
  };
}

/**
 * Variant: exit on RSI crossing back above the overbought threshold instead of
 * a fixed price target. Demonstrates non-price exit conditions.
 */
export function userRsiScalpRsiExitTemplate(opts: {
  ticker?: string;
  shares?: number;
  rsiPeriod?: number;
  oversold?: number;
  overbought?: number;
  safetyStopPct?: number;
} = {}): Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'> {
  const ticker = opts.ticker ?? 'SOXL';
  const shares = opts.shares ?? 100;
  const period = opts.rsiPeriod ?? 250;
  const oversold = opts.oversold ?? 50;
  const overbought = opts.overbought ?? 55;
  const safetyStopPct = opts.safetyStopPct ?? 1;

  return {
    name: `RSI scalp (RSI exit) · ${ticker}`,
    ticker,
    enabled: false,
    mode: 'paper',
    size: { kind: 'shares', n: shares },
    rsiConfig: { period, oversold, overbought },
    entry: {
      when: {
        type: 'cross',
        target: { kind: 'rsi', period },
        threshold: { kind: 'literal', value: oversold },
        dir: 'below',
      },
    },
    exit: {
      when: {
        type: 'cross',
        target: { kind: 'rsi', period },
        threshold: { kind: 'literal', value: overbought },
        dir: 'above',
      },
    },
    stopLoss: { pct: safetyStopPct },
    cooldownMinutes: 5,
  };
}
