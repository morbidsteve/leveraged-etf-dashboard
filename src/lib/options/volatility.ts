import {
  OptionChain,
  OptionExpiration,
  IVSummary,
} from '@/types/options';
import { findAtmStrike } from '@/lib/options/helpers';

/**
 * Pure IV / vol math derived from a chain snapshot. No I/O.
 *
 * Conventions:
 *   - IV is decimal (0.45 = 45%)
 *   - Term structure is sorted by DTE ascending
 *   - Smile is taken at the front-month expiration only (most liquid)
 *
 * IV percentile (252-day) requires history; returned as undefined when
 * we don't have it. Caller can later snapshot ATM IV daily and feed it
 * back here as `historyAtmIv` for percentile computation.
 */
export function computeIVSummary(
  chain: OptionChain,
  historyAtmIv?: number[]
): IVSummary {
  const summary: IVSummary = {
    underlying: chain.underlying,
    atmIv: 0,
    termStructure: [],
    smile: [],
  };

  if (chain.expirations.length === 0 || chain.underlyingPrice === 0) {
    return summary;
  }

  for (const exp of chain.expirations) {
    const atmStrike = findAtmStrike(exp, chain.underlyingPrice);
    if (atmStrike == null) continue;
    // Average call+put IV at ATM (more stable than either alone)
    const callIv = exp.calls[atmStrike]?.iv ?? 0;
    const putIv = exp.puts[atmStrike]?.iv ?? 0;
    const atmIv = avgNonZero([callIv, putIv]);
    summary.termStructure.push({
      expiration: exp.date,
      daysToExpiry: exp.daysToExpiry,
      atmIv,
    });
  }

  summary.atmIv = summary.termStructure[0]?.atmIv ?? 0;
  summary.smile = computeSmile(chain.expirations[0], chain.underlyingPrice);

  if (historyAtmIv && historyAtmIv.length >= 30) {
    summary.ivPercentile252 = computePercentile(summary.atmIv, historyAtmIv);
  }

  return summary;
}

/** Smile at one expiration: IV across strikes (calls OTM upside, puts OTM downside). */
function computeSmile(
  exp: OptionExpiration | undefined,
  spot: number
): IVSummary['smile'] {
  if (!exp) return [];
  const out: IVSummary['smile'] = [];
  // Puts for strikes ≤ spot; calls for strikes > spot
  for (const strikeKey of Object.keys(exp.puts)) {
    const strike = parseFloat(strikeKey);
    if (strike > spot) continue;
    const c = exp.puts[strike];
    if (c && c.iv > 0) out.push({ strike, iv: c.iv, type: 'put' });
  }
  for (const strikeKey of Object.keys(exp.calls)) {
    const strike = parseFloat(strikeKey);
    if (strike <= spot) continue;
    const c = exp.calls[strike];
    if (c && c.iv > 0) out.push({ strike, iv: c.iv, type: 'call' });
  }
  return out.sort((a, b) => a.strike - b.strike);
}

function avgNonZero(values: number[]): number {
  const nz = values.filter((v) => v > 0);
  if (nz.length === 0) return 0;
  return nz.reduce((s, v) => s + v, 0) / nz.length;
}

/**
 * Where does `current` rank in `history`? Returns 0–100. Higher percentile
 * = current IV is high relative to history (richer premium for sellers).
 */
export function computePercentile(current: number, history: number[]): number {
  if (history.length === 0) return 0;
  const below = history.filter((v) => v < current).length;
  return (below / history.length) * 100;
}

/**
 * Describe the term structure shape: contango (longer-DTE IV > shorter)
 * or backwardation (shorter > longer). Backwardation often signals stress
 * (event-driven IV, earnings, etc.).
 */
export function describeTermStructure(summary: IVSummary): 'contango' | 'backwardation' | 'flat' {
  if (summary.termStructure.length < 2) return 'flat';
  const front = summary.termStructure[0].atmIv;
  const back = summary.termStructure[summary.termStructure.length - 1].atmIv;
  const diff = back - front;
  if (Math.abs(diff) < 0.01) return 'flat';
  return diff > 0 ? 'contango' : 'backwardation';
}
