import { OptionLeg, OptionPosition, OptionStructure } from '@/types/options';

/**
 * Risk-engine helpers for options positions: max-loss / max-profit /
 * breakeven computation plus margin/buying-power estimation.
 *
 * Pure functions — no I/O. Consumed by the position store, the order
 * ticket preview, and the buying-power tracker.
 */

export interface PositionRisk {
  maxProfit: number;
  maxLoss: number;
  breakevens: number[];
  /** Estimated margin / buying-power requirement in dollars. Defined-risk
   * positions = max loss; naked = many multiples (we approximate). */
  buyingPowerReq: number;
}

/**
 * Approximate buying-power requirement for a position. Defined-risk
 * structures (vertical, condor, butterfly, debit spreads): max loss.
 * Naked short calls/puts: 20% of underlying notional minus OTM amount,
 * a common Reg-T heuristic. Long single options: just the debit.
 */
export function estimateBuyingPower(
  structure: OptionStructure,
  legs: OptionLeg[],
  netCost: number,
  underlyingPrice: number
): number {
  const isCredit = netCost < 0;

  if (structure === 'vertical' || structure === 'iron_condor' || structure === 'iron_butterfly') {
    return computeMaxLoss(structure, legs, netCost);
  }

  if (structure === 'single') {
    const leg = legs[0];
    if (leg.instruction === 'BUY_TO_OPEN') {
      // Long single: BP = debit
      return Math.abs(netCost);
    }
    // Short single (naked): Reg-T 20% rule of thumb
    // 20% × underlying × shares + premium received - OTM amount
    const shares = leg.quantity * 100;
    const otm =
      leg.type === 'call'
        ? Math.max(0, leg.strike - underlyingPrice)
        : Math.max(0, underlyingPrice - leg.strike);
    const credit = Math.abs(netCost);
    const req = 0.2 * underlyingPrice * shares + credit - otm * shares;
    return Math.max(req, credit + 0.1 * underlyingPrice * shares);
  }

  // Calendar/diagonal/butterfly fallback: approximate as max loss + small buffer
  if (isCredit) {
    return computeMaxLoss(structure, legs, netCost) || Math.abs(netCost) * 4;
  }
  return Math.abs(netCost);
}

/** Compute max loss using the same logic as computeStructureRisk in the
 *  store, kept here as a pure helper so the BP estimator doesn't need
 *  to import the store. */
export function computeMaxLoss(
  structure: OptionStructure,
  legs: OptionLeg[],
  netCost: number
): number {
  const isCredit = netCost < 0;
  const credit = Math.abs(netCost);
  if (structure === 'vertical') {
    const strikes = legs.map((l) => l.strike).sort((a, b) => a - b);
    const width = (strikes[strikes.length - 1] - strikes[0]) * 100 * legs[0].quantity;
    return isCredit ? Math.max(0, width - credit) : Math.abs(netCost);
  }
  if (structure === 'iron_condor' || structure === 'iron_butterfly') {
    const callStrikes = legs.filter((l) => l.type === 'call').map((l) => l.strike).sort((a, b) => a - b);
    const putStrikes = legs.filter((l) => l.type === 'put').map((l) => l.strike).sort((a, b) => a - b);
    const cw = callStrikes.length === 2 ? (callStrikes[1] - callStrikes[0]) * 100 * legs[0].quantity : 0;
    const pw = putStrikes.length === 2 ? (putStrikes[1] - putStrikes[0]) * 100 * legs[0].quantity : 0;
    return Math.max(0, Math.max(cw, pw) - credit);
  }
  if (structure === 'single' && legs[0]?.instruction === 'BUY_TO_OPEN') {
    return Math.abs(netCost);
  }
  // Other structures: caller provides better numbers
  return Math.abs(netCost);
}

/**
 * P&L of a position at expiration as a function of underlying price.
 * Used by the P&L curve renderer in the UI.
 */
export function plAtExpiration(
  position: OptionPosition,
  underlyingPrice: number
): number {
  let pl = -position.netCost; // start with what we paid (or received as -credit)
  for (const leg of position.legs) {
    const sign =
      leg.instruction === 'BUY_TO_OPEN' || leg.instruction === 'BUY_TO_CLOSE' ? 1 : -1;
    const intrinsic =
      leg.type === 'call'
        ? Math.max(0, underlyingPrice - leg.strike)
        : Math.max(0, leg.strike - underlyingPrice);
    pl += sign * intrinsic * leg.quantity * 100;
  }
  return pl;
}

/** Sample N points across a price range for plotting the P&L curve. */
export function plCurve(
  position: OptionPosition,
  centerPrice: number,
  rangePct = 0.20,
  samples = 40
): { price: number; pl: number }[] {
  const lo = centerPrice * (1 - rangePct);
  const hi = centerPrice * (1 + rangePct);
  const step = (hi - lo) / (samples - 1);
  const out: { price: number; pl: number }[] = [];
  for (let i = 0; i < samples; i++) {
    const price = lo + step * i;
    out.push({ price, pl: plAtExpiration(position, price) });
  }
  return out;
}
