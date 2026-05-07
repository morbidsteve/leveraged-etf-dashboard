import { Strategy } from '@/types/strategy';

/**
 * Pre-built strategy templates. Default to applying to a single ticker
 * but accept `tickers: []` to seed a multi-ticker scan strategy from the
 * jump.
 */

interface TemplateOpts {
  ticker?: string;
  tickers?: string[];        // overrides ticker if provided
  shares?: number;
  rsiPeriod?: number;
  oversold?: number;
  overbought?: number;
  targetPct?: number;
  safetyStopPct?: number;
}

function resolveTickers(opts: TemplateOpts): string[] {
  if (opts.tickers && opts.tickers.length > 0) return opts.tickers;
  return [opts.ticker ?? 'SOXL'];
}

/**
 * RSI scalp with price-target exit — the user's exact setup:
 * Buy when RSI(250) crosses below 50; sell when price >= entry × 1.015.
 */
export function userRsiScalpTemplate(
  opts: TemplateOpts = {}
): Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'> {
  const tickers = resolveTickers(opts);
  const shares = opts.shares ?? 100;
  const period = opts.rsiPeriod ?? 250;
  const oversold = opts.oversold ?? 50;
  const overbought = opts.overbought ?? 55;
  const targetPct = opts.targetPct ?? 1.5;
  const safetyStopPct = opts.safetyStopPct ?? 1;

  return {
    name: tickers.length === 1 ? `RSI scalp · ${tickers[0]}` : `RSI scalp · ${tickers.length} tickers`,
    tickers,
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
 * Same buy. Sell when RSI crosses back above the overbought threshold.
 * Demonstrates non-price exit conditions.
 */
export function userRsiScalpRsiExitTemplate(
  opts: TemplateOpts = {}
): Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'> {
  const tickers = resolveTickers(opts);
  const shares = opts.shares ?? 100;
  const period = opts.rsiPeriod ?? 250;
  const oversold = opts.oversold ?? 50;
  const overbought = opts.overbought ?? 55;
  const safetyStopPct = opts.safetyStopPct ?? 1;

  return {
    name: tickers.length === 1
      ? `RSI scalp (RSI exit) · ${tickers[0]}`
      : `RSI scalp (RSI exit) · ${tickers.length} tickers`,
    tickers,
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
