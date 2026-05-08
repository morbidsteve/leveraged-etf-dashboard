import { Candle } from '@/types';

/**
 * Custom indicator authoring — sandboxed JS execution against a candle
 * series. Lets users write their own indicator math without modifying
 * the codebase.
 *
 * Sandboxing: we evaluate user code in a Function constructor with
 * NO access to globals (no window, no document, no fetch). The function
 * body has access to:
 *   - candles: Candle[] (full input series)
 *   - i: number (current bar index)
 *   - SMA, EMA, RSI helpers
 *   - last(N): get the last N closes
 *   - returns a number (or null/undefined to skip)
 *
 * Caveat: not airtight against malicious code (no real VM isolation in
 * the browser without Workers). Acceptable for personal use; production
 * SaaS deployment would route this through a server-side worker pool
 * with proper resource limits.
 */

export interface CustomIndicatorDefinition {
  id: string;
  name: string;
  /** JS function body. The body must `return` a number per call. */
  body: string;
  /** Description rendered in the UI. */
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomIndicatorResult {
  values: { time: number; value: number }[];
  errors: { index: number; message: string }[];
}

/**
 * Sandbox helpers exposed to user code. Pure, no I/O.
 */
const SANDBOX_HELPERS = {
  SMA: (closes: number[], period: number): number => {
    if (closes.length < period) return NaN;
    let sum = 0;
    for (let i = closes.length - period; i < closes.length; i++) sum += closes[i];
    return sum / period;
  },
  EMA: (closes: number[], period: number): number => {
    if (closes.length < period) return NaN;
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((s, x) => s + x, 0) / period;
    for (let i = period; i < closes.length; i++) {
      ema = (closes[i] - ema) * k + ema;
    }
    return ema;
  },
  RSI: (closes: number[], period: number): number => {
    if (closes.length < period + 1) return NaN;
    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= period; i++) {
      const d = closes[i] - closes[i - 1];
      if (d > 0) gains += d;
      else losses += -d;
    }
    let avgG = gains / period;
    let avgL = losses / period;
    for (let i = period + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      const g = d > 0 ? d : 0;
      const l = d < 0 ? -d : 0;
      avgG = (avgG * (period - 1) + g) / period;
      avgL = (avgL * (period - 1) + l) / period;
    }
    if (avgL === 0) return 100;
    const rs = avgG / avgL;
    return 100 - 100 / (1 + rs);
  },
  STDDEV: (closes: number[], period: number): number => {
    if (closes.length < period) return NaN;
    const slice = closes.slice(-period);
    const mean = slice.reduce((s, x) => s + x, 0) / period;
    const variance = slice.reduce((s, x) => s + (x - mean) ** 2, 0) / period;
    return Math.sqrt(variance);
  },
};

/**
 * Compile + evaluate a custom-indicator definition against a candle
 * series. Returns values per bar (or NaN where the user code throws or
 * returns non-finite) and a per-bar error log.
 */
export function evaluateCustomIndicator(
  def: CustomIndicatorDefinition,
  candles: Candle[]
): CustomIndicatorResult {
  const values: CustomIndicatorResult['values'] = [];
  const errors: CustomIndicatorResult['errors'] = [];
  if (candles.length === 0) return { values, errors };

  // Compile once per evaluation
  let fn: (
    candles: Candle[],
    i: number,
    closes: number[],
    helpers: typeof SANDBOX_HELPERS
  ) => unknown;
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    fn = new Function(
      'candles',
      'i',
      'closes',
      'helpers',
      `'use strict';
       const SMA = helpers.SMA, EMA = helpers.EMA, RSI = helpers.RSI, STDDEV = helpers.STDDEV;
       const last = (n) => closes.slice(-n);
       const bar = candles[i];
       const close = bar.close, open = bar.open, high = bar.high, low = bar.low, volume = bar.volume || 0;
       ${def.body}`
    ) as typeof fn;
  } catch (e) {
    return {
      values: [],
      errors: [{ index: -1, message: e instanceof Error ? e.message : String(e) }],
    };
  }

  const closes: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    closes.push(candles[i].close);
    let result: unknown;
    try {
      result = fn(candles, i, closes, SANDBOX_HELPERS);
    } catch (e) {
      errors.push({
        index: i,
        message: e instanceof Error ? e.message : String(e),
      });
      continue;
    }
    if (typeof result === 'number' && Number.isFinite(result)) {
      values.push({ time: candles[i].time, value: result });
    } else if (result == null) {
      // Allow null/undefined to skip a bar without flagging an error
      continue;
    } else {
      errors.push({
        index: i,
        message: `Indicator must return a number; got ${typeof result}`,
      });
    }
  }
  return { values, errors };
}

/**
 * Templates a user can start from when authoring a custom indicator.
 */
export const CUSTOM_INDICATOR_TEMPLATES: Array<{ name: string; body: string; description: string }> = [
  {
    name: 'Bollinger %B',
    description: 'Where current close sits within Bollinger Bands. 0 = lower band, 1 = upper band.',
    body: `const period = 20;
const sma = SMA(closes, period);
const sd = STDDEV(closes, period);
const upper = sma + 2 * sd;
const lower = sma - 2 * sd;
return (close - lower) / (upper - lower);`,
  },
  {
    name: 'Rate of change %',
    description: 'Percent change of close over N bars ago.',
    body: `const period = 14;
if (closes.length < period + 1) return null;
const past = closes[closes.length - 1 - period];
return ((close - past) / past) * 100;`,
  },
  {
    name: 'Z-score (custom period)',
    description: 'Standard deviations the close is from its rolling mean.',
    body: `const period = 30;
const mean = SMA(closes, period);
const sd = STDDEV(closes, period);
return sd > 0 ? (close - mean) / sd : 0;`,
  },
  {
    name: 'Custom RSI ratio',
    description: 'RSI(14) divided by RSI(50). Cross-period momentum signal.',
    body: `const fast = RSI(closes, 14);
const slow = RSI(closes, 50);
return slow > 0 ? fast / slow : 1;`,
  },
];

/** Validate that a body string compiles. Returns null on success or
 *  an error message string. */
export function validateIndicatorBody(body: string): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function('candles', 'i', 'closes', 'helpers', `'use strict'; ${body}`);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
