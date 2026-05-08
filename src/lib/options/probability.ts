import { OptionPosition } from '@/types/options';
import { normCdf } from './backtest';
import { plAtExpiration } from './risk';

/**
 * Probability analytics for options positions. Pure math, no I/O.
 *
 * All probabilities use a lognormal price model — the standard
 * Black-Scholes-Merton assumption. Inputs you typically pull from the
 * front-month ATM IV or the position's own legs' IV (averaged).
 *
 * Two flavors:
 *   - At-expiration: P(stock S at T)
 *   - At-any-touch (barrier hit during life): the so-called reflection
 *     principle approximation, ~2× the at-expiration tail probability.
 *     Less accurate at deep tails but useful as a quick "stop touch"
 *     proxy.
 */

/** P(stock above target) at time T, lognormal, no drift adjustment beyond r. */
export function probAbove(spot: number, target: number, iv: number, yearsToExpiry: number, rate = 0.05): number {
  if (yearsToExpiry <= 0 || iv <= 0 || spot <= 0 || target <= 0) {
    return spot > target ? 1 : 0;
  }
  const d2 =
    (Math.log(spot / target) + (rate - (iv * iv) / 2) * yearsToExpiry) /
    (iv * Math.sqrt(yearsToExpiry));
  return normCdf(d2);
}

/** P(stock below target) at time T. */
export function probBelow(spot: number, target: number, iv: number, yearsToExpiry: number, rate = 0.05): number {
  return 1 - probAbove(spot, target, iv, yearsToExpiry, rate);
}

/** P(stock between two prices) at expiration. */
export function probBetween(
  spot: number,
  lower: number,
  upper: number,
  iv: number,
  yearsToExpiry: number,
  rate = 0.05
): number {
  return probAbove(spot, lower, iv, yearsToExpiry, rate) - probAbove(spot, upper, iv, yearsToExpiry, rate);
}

/** Approximate at-any-touch probability (reflection principle). */
export function probTouch(
  spot: number,
  barrier: number,
  iv: number,
  yearsToExpiry: number,
  rate = 0.05
): number {
  // 2 × P(beyond barrier at expiration) is the classic approximation
  const tail =
    barrier > spot
      ? probAbove(spot, barrier, iv, yearsToExpiry, rate)
      : probBelow(spot, barrier, iv, yearsToExpiry, rate);
  return Math.min(1, 2 * tail);
}

/**
 * Probability of profit (POP) for a position at expiration. Uses the
 * position's first leg's IV as a proxy when computing tail probabilities.
 *
 * For positions with multiple breakevens, returns the probability that
 * underlying lands in a profitable region. For positions without
 * breakevens (e.g. a long call with unbounded upside), POP is the
 * probability of being above the breakeven.
 */
export function probabilityOfProfit(
  position: OptionPosition,
  spot: number,
  yearsToExpiry: number,
  iv?: number
): number {
  const usedIv = iv ?? 0.30;
  if (position.breakevens.length === 0) {
    // Sample at expiration — return P(P&L >= 0) by Monte-Carlo-ish
    // sampling against breakevens we infer from a price scan.
    let above = 0;
    const samples = 200;
    for (let i = 0; i < samples; i++) {
      const u = (i + 0.5) / samples;
      const z = inverseNormCdf(u);
      const futurePrice = spot * Math.exp((-(usedIv * usedIv) / 2) * yearsToExpiry + usedIv * Math.sqrt(yearsToExpiry) * z);
      if (plAtExpiration(position, futurePrice) >= 0) above++;
    }
    return above / samples;
  }

  if (position.breakevens.length === 1) {
    const be = position.breakevens[0];
    // Determine which side is profitable by testing one strike beyond BE
    const probeAbove = plAtExpiration(position, be * 1.05);
    if (probeAbove >= 0) {
      return probAbove(spot, be, usedIv, yearsToExpiry);
    }
    return probBelow(spot, be, usedIv, yearsToExpiry);
  }

  // 2+ breakevens (iron condor / butterfly): profit zone is between
  // the inner breakevens; loss zones at tails.
  const sorted = [...position.breakevens].sort((a, b) => a - b);
  const lower = sorted[0];
  const upper = sorted[sorted.length - 1];
  // Test inside vs outside
  const insidePl = plAtExpiration(position, (lower + upper) / 2);
  if (insidePl >= 0) {
    return probBetween(spot, lower, upper, usedIv, yearsToExpiry);
  }
  return 1 - probBetween(spot, lower, upper, usedIv, yearsToExpiry);
}

/** Inverse standard normal CDF (Beasley-Springer-Moro), pure approximation. */
function inverseNormCdf(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  // Acklam's approximation
  const a = [-3.969683028665376e+1, 2.209460984245205e+2, -2.759285104469687e+2, 1.383577518672690e+2, -3.066479806614716e+1, 2.506628277459239];
  const b = [-5.447609879822406e+1, 1.615858368580409e+2, -1.556989798598866e+2, 6.680131188771972e+1, -1.328068155288572e+1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q: number, r: number;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= phigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}
