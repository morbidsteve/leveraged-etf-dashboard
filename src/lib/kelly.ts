/**
 * Kelly criterion sizing. Pure function. Recommends a fraction of
 * capital to risk per trade based on your historical edge.
 *
 * Kelly formula:  f* = p - q/b
 *   where:
 *     p = win probability
 *     q = 1 - p (loss probability)
 *     b = win/loss ratio (avg win / avg loss, both positive)
 *
 * Practical adjustment: most professionals recommend FRACTIONAL Kelly
 * (0.25× to 0.5×) because full Kelly assumes infinite trials and
 * exact knowledge of p and b — both wrong in real trading. We default
 * to 0.5× ("half-Kelly") and surface both numbers.
 */

export interface KellyInput {
  /** Win rate as a decimal (0.55 = 55%). */
  winRate: number;
  /** Average winning trade dollar amount (positive). */
  avgWin: number;
  /** Average losing trade dollar amount (POSITIVE — pass abs value). */
  avgLoss: number;
  /** Total trades observed (used for confidence band). */
  tradeCount: number;
}

export interface KellyOutput {
  /** Full Kelly fraction (0..1). Negative = no edge; don't trade. */
  fullKelly: number;
  /** Recommended fraction (0.5 × full Kelly), clamped to [0, 0.25]. */
  halfKelly: number;
  /** "Conservative" 0.25 × full Kelly. */
  quarterKelly: number;
  /** Win/loss ratio b. */
  payoffRatio: number;
  /** Descriptive interpretation. */
  description: string;
  /** True when we have enough trades to trust the numbers (≥30). */
  reliable: boolean;
}

export function computeKelly(input: KellyInput): KellyOutput {
  const { winRate, avgWin, avgLoss, tradeCount } = input;
  const p = winRate;
  const q = 1 - p;

  if (avgLoss <= 0) {
    // Can't divide; assume 1:1 payoff so we have something
    return {
      fullKelly: 0,
      halfKelly: 0,
      quarterKelly: 0,
      payoffRatio: 0,
      description: 'No loss history available — Kelly undefined.',
      reliable: false,
    };
  }
  const b = avgWin / avgLoss;
  const fullKelly = p - q / b;
  const halfKelly = Math.max(0, Math.min(0.25, fullKelly * 0.5));
  const quarterKelly = Math.max(0, Math.min(0.25, fullKelly * 0.25));
  const reliable = tradeCount >= 30;

  let description: string;
  if (fullKelly <= 0) {
    description = 'No statistical edge in your history — Kelly says don\'t trade this setup.';
  } else if (fullKelly < 0.05) {
    description = `Marginal edge (${(fullKelly * 100).toFixed(1)}% full Kelly). Risk 1-2% per trade max.`;
  } else if (fullKelly < 0.15) {
    description = `Moderate edge. Half-Kelly suggests ${(halfKelly * 100).toFixed(1)}% per trade.`;
  } else {
    description = `Strong edge — but full Kelly (${(fullKelly * 100).toFixed(0)}%) is dangerous; use ¼ or ½.`;
  }
  if (!reliable) {
    description += ` ⚠ Only ${tradeCount} trades — numbers unstable, take with a grain of salt.`;
  }

  return {
    fullKelly,
    halfKelly,
    quarterKelly,
    payoffRatio: b,
    description,
    reliable,
  };
}
