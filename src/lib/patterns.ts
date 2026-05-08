import { Candle } from '@/types';

/**
 * Candlestick pattern recognition. Pure functions — given a series of
 * candles, returns markers for any patterns detected at each bar.
 *
 * Patterns implemented (most common, well-defined):
 *   - Bullish/bearish engulfing (2-bar)
 *   - Hammer / inverted hammer / hanging man / shooting star (1-bar)
 *   - Doji (1-bar)
 *   - Morning star / evening star (3-bar reversal)
 *   - Three white soldiers / three black crows (3-bar continuation)
 *
 * Each detection returns confidence: a heuristic 0-1 based on body size,
 * shadow ratios, and trend context (where applicable).
 */

export type PatternId =
  | 'bullish_engulfing'
  | 'bearish_engulfing'
  | 'hammer'
  | 'inverted_hammer'
  | 'hanging_man'
  | 'shooting_star'
  | 'doji'
  | 'morning_star'
  | 'evening_star'
  | 'three_white_soldiers'
  | 'three_black_crows';

export type PatternBias = 'bullish' | 'bearish' | 'reversal' | 'indecision';

export interface PatternMatch {
  time: number;
  index: number;            // bar index in input array
  pattern: PatternId;
  bias: PatternBias;
  confidence: number;       // 0..1
  description: string;
}

const PATTERN_LABELS: Record<PatternId, { bias: PatternBias; label: string }> = {
  bullish_engulfing: { bias: 'bullish', label: 'Bullish engulfing' },
  bearish_engulfing: { bias: 'bearish', label: 'Bearish engulfing' },
  hammer: { bias: 'bullish', label: 'Hammer' },
  inverted_hammer: { bias: 'bullish', label: 'Inverted hammer' },
  hanging_man: { bias: 'bearish', label: 'Hanging man' },
  shooting_star: { bias: 'bearish', label: 'Shooting star' },
  doji: { bias: 'indecision', label: 'Doji' },
  morning_star: { bias: 'bullish', label: 'Morning star' },
  evening_star: { bias: 'bearish', label: 'Evening star' },
  three_white_soldiers: { bias: 'bullish', label: 'Three white soldiers' },
  three_black_crows: { bias: 'bearish', label: 'Three black crows' },
};

/** Detect every pattern in a candle series. Returns matches sorted by index. */
export function detectPatterns(candles: Candle[]): PatternMatch[] {
  const out: PatternMatch[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    // Single-bar patterns
    const single = detectSingleBar(c);
    if (single) {
      out.push(makeMatch(single, c.time, i, single.confidence, single.description));
    }
    // Two-bar patterns
    if (i >= 1) {
      const eng = detectEngulfing(candles[i - 1], c);
      if (eng) out.push(makeMatch(eng.id, c.time, i, eng.confidence, eng.description));
    }
    // Three-bar patterns
    if (i >= 2) {
      const star = detectStar(candles[i - 2], candles[i - 1], c);
      if (star) out.push(makeMatch(star.id, c.time, i, star.confidence, star.description));
      const trio = detectThreeBarTrio(candles[i - 2], candles[i - 1], c);
      if (trio) out.push(makeMatch(trio.id, c.time, i, trio.confidence, trio.description));
    }
  }
  return out;
}

function makeMatch(
  pat: { id: PatternId; bias?: PatternBias } | PatternId,
  time: number,
  index: number,
  confidence: number,
  description: string
): PatternMatch {
  const id = typeof pat === 'string' ? pat : pat.id;
  return {
    time,
    index,
    pattern: id,
    bias: PATTERN_LABELS[id].bias,
    confidence,
    description,
  };
}

// ── Single-bar detection ────────────────────────────────────────────────

function detectSingleBar(c: Candle):
  | { id: PatternId; confidence: number; description: string }
  | null {
  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low;
  if (range <= 0) return null;
  const upperShadow = c.high - Math.max(c.open, c.close);
  const lowerShadow = Math.min(c.open, c.close) - c.low;
  const bodyRatio = body / range;

  // Hammer first (more specific): small body at top, long lower shadow.
  // Use range-relative thresholds so a hammer with mild upper shadow qualifies.
  if (lowerShadow > range * 0.6 && upperShadow < range * 0.15 && bodyRatio < 0.4) {
    const id: PatternId = c.close >= c.open ? 'hammer' : 'hanging_man';
    return {
      id,
      confidence: Math.min(1, lowerShadow / range),
      description:
        id === 'hammer'
          ? 'Long lower shadow, small body at top — buyers rejected the lows'
          : 'Same shape as hammer but appears at top of trend — sellers may be exhausting',
    };
  }

  // Inverted hammer / shooting star: small body at bottom, long upper shadow
  if (upperShadow > range * 0.6 && lowerShadow < range * 0.15 && bodyRatio < 0.4) {
    const id: PatternId = c.close >= c.open ? 'inverted_hammer' : 'shooting_star';
    return {
      id,
      confidence: Math.min(1, upperShadow / range),
      description:
        id === 'inverted_hammer'
          ? 'Long upper shadow at bottom of decline — buyers attempting reversal'
          : 'Long upper shadow at top of rally — sellers rejected the highs',
    };
  }

  // Doji last (least specific): tiny body relative to range, AND
  // shadows reasonably balanced (so a hammer with tiny body doesn't get
  // mis-classified). Tolerance: shadows within 3x of each other.
  if (bodyRatio < 0.1) {
    const shadowRatio = upperShadow > 0 && lowerShadow > 0
      ? Math.max(upperShadow, lowerShadow) / Math.min(upperShadow, lowerShadow)
      : Infinity;
    if (shadowRatio <= 3) {
      return {
        id: 'doji',
        confidence: 1 - bodyRatio * 5,
        description: 'Open ≈ close — buyers and sellers in balance',
      };
    }
  }

  return null;
}

// ── Two-bar engulfing ───────────────────────────────────────────────────

function detectEngulfing(prev: Candle, curr: Candle):
  | { id: PatternId; confidence: number; description: string }
  | null {
  const prevBull = prev.close > prev.open;
  const currBull = curr.close > curr.open;
  if (prevBull === currBull) return null; // need opposite directions

  const prevBody = Math.abs(prev.close - prev.open);
  const currBody = Math.abs(curr.close - curr.open);
  if (currBody <= prevBody) return null;

  // Bullish engulfing: red prev, green curr that engulfs prev's body
  if (!prevBull && currBull) {
    if (curr.open <= prev.close && curr.close >= prev.open) {
      return {
        id: 'bullish_engulfing',
        confidence: Math.min(1, currBody / (prevBody + 0.001) / 2),
        description: 'Green bar engulfs prior red — strong reversal signal',
      };
    }
  }
  // Bearish engulfing: green prev, red curr
  if (prevBull && !currBull) {
    if (curr.open >= prev.close && curr.close <= prev.open) {
      return {
        id: 'bearish_engulfing',
        confidence: Math.min(1, currBody / (prevBody + 0.001) / 2),
        description: 'Red bar engulfs prior green — strong reversal signal',
      };
    }
  }
  return null;
}

// ── Three-bar star patterns ────────────────────────────────────────────

function detectStar(c1: Candle, c2: Candle, c3: Candle):
  | { id: PatternId; confidence: number; description: string }
  | null {
  const body1 = Math.abs(c1.close - c1.open);
  const body2 = Math.abs(c2.close - c2.open);
  const body3 = Math.abs(c3.close - c3.open);
  const range1 = c1.high - c1.low;
  if (range1 <= 0) return null;
  // Middle bar must have small body
  if (body2 > body1 * 0.4) return null;
  // Outer bars must have substantial bodies
  if (body1 / range1 < 0.5) return null;

  // Morning star: red, small, green that closes >50% into c1's body
  if (c1.close < c1.open && c3.close > c3.open) {
    const midpoint = (c1.open + c1.close) / 2;
    if (c3.close > midpoint) {
      return {
        id: 'morning_star',
        confidence: Math.min(1, body3 / body1),
        description: 'Reversal — red, indecision, then strong green; bottom forming',
      };
    }
  }
  // Evening star: green, small, red that closes >50% into c1's body
  if (c1.close > c1.open && c3.close < c3.open) {
    const midpoint = (c1.open + c1.close) / 2;
    if (c3.close < midpoint) {
      return {
        id: 'evening_star',
        confidence: Math.min(1, body3 / body1),
        description: 'Reversal — green, indecision, then strong red; top forming',
      };
    }
  }
  return null;
}

// ── Three-bar trio patterns (continuation) ─────────────────────────────

function detectThreeBarTrio(c1: Candle, c2: Candle, c3: Candle):
  | { id: PatternId; confidence: number; description: string }
  | null {
  const allGreen = c1.close > c1.open && c2.close > c2.open && c3.close > c3.open;
  const allRed = c1.close < c1.open && c2.close < c2.open && c3.close < c3.open;

  if (allGreen) {
    // Each bar opens within prior body and closes higher
    if (c2.open >= c1.open && c2.open <= c1.close && c2.close > c1.close &&
        c3.open >= c2.open && c3.open <= c2.close && c3.close > c2.close) {
      return {
        id: 'three_white_soldiers',
        confidence: 0.8,
        description: 'Three consecutive green bars with progressively higher closes — strong uptrend',
      };
    }
  }
  if (allRed) {
    if (c2.open <= c1.open && c2.open >= c1.close && c2.close < c1.close &&
        c3.open <= c2.open && c3.open >= c2.close && c3.close < c2.close) {
      return {
        id: 'three_black_crows',
        confidence: 0.8,
        description: 'Three consecutive red bars with progressively lower closes — strong downtrend',
      };
    }
  }
  return null;
}

/** Return only the most recent pattern (for chart-overlay display). */
export function lastPattern(matches: PatternMatch[]): PatternMatch | null {
  if (matches.length === 0) return null;
  return matches[matches.length - 1];
}

/** Get human-readable label for a pattern ID. */
export function patternLabel(id: PatternId): string {
  return PATTERN_LABELS[id].label;
}
