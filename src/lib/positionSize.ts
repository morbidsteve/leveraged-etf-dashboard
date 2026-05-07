/**
 * Position-sizing math: given an account size, a risk-per-trade percent,
 * an entry price, and a stop-loss price, compute the share count that
 * caps your loss at the configured risk if the stop fires.
 *
 *   shares = (account × risk%) / |entry − stop|
 *
 * Rounded down to whole shares (Schwab API doesn't support fractional via
 * the order endpoints we'll use). All money values in dollars.
 */

export interface PositionSizeInput {
  accountSize: number;
  riskPct: number;        // e.g. 1 for 1% of account
  entry: number;
  stop: number;
}

export interface PositionSizeResult {
  shares: number;
  riskDollars: number;
  notional: number;       // shares × entry
  pctOfAccount: number;   // notional / account × 100
  stopDistance: number;   // |entry − stop|
  stopDistancePct: number;
  rrAt15: number;         // reward-to-risk if exit at +1.5%
  rrAt20: number;
  isValid: boolean;
  reason?: string;        // when isValid = false
}

export function computePositionSize(input: PositionSizeInput): PositionSizeResult {
  const { accountSize, riskPct, entry, stop } = input;
  const empty: PositionSizeResult = {
    shares: 0,
    riskDollars: 0,
    notional: 0,
    pctOfAccount: 0,
    stopDistance: 0,
    stopDistancePct: 0,
    rrAt15: 0,
    rrAt20: 0,
    isValid: false,
  };

  if (!Number.isFinite(accountSize) || accountSize <= 0) {
    return { ...empty, reason: 'Account size must be > 0' };
  }
  if (!Number.isFinite(riskPct) || riskPct <= 0) {
    return { ...empty, reason: 'Risk % must be > 0' };
  }
  if (!Number.isFinite(entry) || entry <= 0) {
    return { ...empty, reason: 'Entry price must be > 0' };
  }
  if (!Number.isFinite(stop) || stop <= 0) {
    return { ...empty, reason: 'Stop price must be > 0' };
  }
  if (stop >= entry) {
    return { ...empty, reason: 'For a long position, stop must be below entry' };
  }

  const stopDistance = entry - stop;
  const riskDollars = accountSize * (riskPct / 100);
  const sharesRaw = riskDollars / stopDistance;
  const shares = Math.floor(sharesRaw);

  if (shares < 1) {
    return {
      ...empty,
      stopDistance,
      stopDistancePct: (stopDistance / entry) * 100,
      reason: 'Stop is too far for risk budget — would size below 1 share',
    };
  }

  const notional = shares * entry;
  const pctOfAccount = (notional / accountSize) * 100;
  const target15Reward = (entry * 1.015 - entry) * shares;
  const target20Reward = (entry * 1.02 - entry) * shares;
  const actualRisk = stopDistance * shares;

  return {
    shares,
    riskDollars: actualRisk,
    notional,
    pctOfAccount,
    stopDistance,
    stopDistancePct: (stopDistance / entry) * 100,
    rrAt15: actualRisk > 0 ? target15Reward / actualRisk : 0,
    rrAt20: actualRisk > 0 ? target20Reward / actualRisk : 0,
    isValid: true,
  };
}
