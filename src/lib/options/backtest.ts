import { Candle } from '@/types';
import {
  OptionsResolverRule,
  describeRule,
} from '@/lib/strategy/optionsResolver';

/**
 * Pure options-strategy backtest using a "VIX-proxy" model:
 *
 * - We don't have historical chain data, so we approximate option premium
 *   using Black-Scholes-Merton with IV proxied from the underlying's
 *   realized volatility (rolling 20-bar stdev × √252 × scale factor).
 * - Greeks are computed in closed form from BSM. Good enough for
 *   modeling premium decay + directional sensitivity.
 *
 * Limits: doesn't model IV smile / skew / term structure surprise, so
 * earnings-event backtests are unrealistic. Fine for "sell 10-delta
 * puts weekly when IV > 60th percentile" baseline studies.
 */

// ── BSM math ──────────────────────────────────────────────────────────

/** Standard normal CDF (Abramowitz–Stegun approximation). */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/** Black-Scholes-Merton call price + delta (no dividends). */
export function bsmCall(
  spot: number,
  strike: number,
  rate: number,
  iv: number,
  yearsToExpiry: number
): { price: number; delta: number } {
  if (yearsToExpiry <= 0 || iv <= 0) {
    const intrinsic = Math.max(0, spot - strike);
    return { price: intrinsic, delta: spot > strike ? 1 : 0 };
  }
  const d1 =
    (Math.log(spot / strike) + (rate + (iv * iv) / 2) * yearsToExpiry) /
    (iv * Math.sqrt(yearsToExpiry));
  const d2 = d1 - iv * Math.sqrt(yearsToExpiry);
  const price = spot * normCdf(d1) - strike * Math.exp(-rate * yearsToExpiry) * normCdf(d2);
  return { price, delta: normCdf(d1) };
}

/** Black-Scholes-Merton put price + delta (no dividends). */
export function bsmPut(
  spot: number,
  strike: number,
  rate: number,
  iv: number,
  yearsToExpiry: number
): { price: number; delta: number } {
  const call = bsmCall(spot, strike, rate, iv, yearsToExpiry);
  // Put-call parity: P = C - S + K e^-rT
  const price = call.price - spot + strike * Math.exp(-rate * yearsToExpiry);
  return { price: Math.max(0, price), delta: call.delta - 1 };
}

/** Realized volatility from a window of closes — stdev of log returns × √252. */
export function realizedVol(closes: number[], window = 20): number {
  if (closes.length < window + 1) return 0.3;
  const recent = closes.slice(-window - 1);
  const rets: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    rets.push(Math.log(recent[i] / recent[i - 1]));
  }
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length;
  // Daily vol → annualized
  return Math.sqrt(variance) * Math.sqrt(252);
}

/** Find the strike that yields the target delta in a synthetic chain. */
export function findStrikeForDelta(
  spot: number,
  rate: number,
  iv: number,
  yearsToExpiry: number,
  type: 'call' | 'put',
  targetDelta: number
): number {
  // Search ±50% around spot in 0.5 steps
  let best = spot;
  let bestDist = Infinity;
  for (let k = spot * 0.5; k <= spot * 1.5; k += 0.5) {
    const fn = type === 'call' ? bsmCall : bsmPut;
    const r = fn(spot, k, rate, iv, yearsToExpiry);
    const d = Math.abs(r.delta - targetDelta);
    if (d < bestDist) {
      best = k;
      bestDist = d;
    }
  }
  return Math.round(best * 4) / 4; // round to 0.25 strike
}

// ── Backtest runner ────────────────────────────────────────────────────

export interface OptionsBacktestTrade {
  index: number;
  openedAt: Date;
  closedAt: Date;
  ruleDescription: string;
  netCredit: number;        // signed: + paid debit, - received credit
  closeNetValue: number;    // value at close (mark-based)
  realizedPnL: number;
  spotAtOpen: number;
  spotAtClose: number;
  ivAtOpen: number;
}

export interface OptionsBacktestResult {
  trades: OptionsBacktestTrade[];
  totalPnL: number;
  winRate: number;
  expectancy: number;
  warnings: string[];
}

interface RunOptsBacktestOpts {
  candles: Candle[];
  rule: OptionsResolverRule;
  /** Open a new position every N bars when no position is active. */
  cadenceBars: number;
  /** Risk-free rate (annualized, decimal). 0.05 = 5%. */
  rate?: number;
  /** Close at +pct of max profit (credit) or -pct of debit. Default 0.5. */
  takeProfitPct?: number;
  candleTimeToDate?: (t: number) => Date;
}

/**
 * Walk historical candles, opening a synthetic options position per the
 * rule at the configured cadence, then closing it at expiration or when
 * take-profit fires. Returns aggregate stats.
 */
export function runOptionsBacktest({
  candles,
  rule,
  cadenceBars,
  rate = 0.05,
  takeProfitPct = 0.5,
  candleTimeToDate = (t) => new Date(t * 1000),
}: RunOptsBacktestOpts): OptionsBacktestResult {
  const warnings: string[] = [];
  const trades: OptionsBacktestTrade[] = [];
  if (candles.length < 50) {
    warnings.push(`Need ≥50 bars; got ${candles.length}`);
    return { trades, totalPnL: 0, winRate: 0, expectancy: 0, warnings };
  }

  type SyntheticPosition = {
    openedAtIdx: number;
    closeIdx: number;          // bar index where the position expires
    initialIV: number;
    initialSpot: number;
    ruleSnapshot: OptionsResolverRule;
    netCredit: number;         // positive value of credit received (credit) or paid (debit, signed)
    legs: { strike: number; type: 'call' | 'put'; sign: 1 | -1; iv: number }[];
  };

  let active: SyntheticPosition | null = null;
  const closes = candles.map((c) => c.close);

  // Bars per year (for DTE → years conversion). Assumes 1m bars on a
  // ~6.5h trading day × 252 days = 98280 bars/year. We use trading
  // days more loosely: dte (days) → fraction of year.
  const yearsPerDay = 1 / 252;

  const openSyntheticPosition = (
    idx: number
  ): SyntheticPosition | null => {
    const spot = closes[idx];
    const iv = realizedVol(closes.slice(0, idx + 1), 20) || 0.3;
    const yearsToExpiry = rule.dte * yearsPerDay;
    const closeIdx = Math.min(candles.length - 1, idx + rule.dte);

    let netCredit = 0;
    const legs: SyntheticPosition['legs'] = [];

    const addLeg = (
      type: 'call' | 'put',
      strike: number,
      sign: 1 | -1
    ) => {
      const fn = type === 'call' ? bsmCall : bsmPut;
      const px = fn(spot, strike, rate, iv, yearsToExpiry).price;
      // sign +1 = bought (debit, costs money); -1 = sold (credit, receives)
      netCredit += sign * px * rule.quantity * 100;
      legs.push({ strike, type, sign, iv });
    };

    switch (rule.kind) {
      case 'long_call': {
        const k = findStrikeForDelta(spot, rate, iv, yearsToExpiry, 'call', rule.delta);
        addLeg('call', k, 1);
        break;
      }
      case 'long_put': {
        const k = findStrikeForDelta(spot, rate, iv, yearsToExpiry, 'put', rule.delta);
        addLeg('put', k, 1);
        break;
      }
      case 'short_put_vertical': {
        const kShort = findStrikeForDelta(spot, rate, iv, yearsToExpiry, 'put', rule.shortDelta);
        const kLong = kShort - rule.width;
        addLeg('put', kShort, -1);
        addLeg('put', kLong, 1);
        break;
      }
      case 'short_call_vertical': {
        const kShort = findStrikeForDelta(spot, rate, iv, yearsToExpiry, 'call', rule.shortDelta);
        const kLong = kShort + rule.width;
        addLeg('call', kShort, -1);
        addLeg('call', kLong, 1);
        break;
      }
      case 'iron_condor': {
        const kCallShort = findStrikeForDelta(spot, rate, iv, yearsToExpiry, 'call', rule.shortDelta);
        const kPutShort = findStrikeForDelta(spot, rate, iv, yearsToExpiry, 'put', -rule.shortDelta);
        const kCallLong = kCallShort + rule.width;
        const kPutLong = kPutShort - rule.width;
        addLeg('put', kPutLong, 1);
        addLeg('put', kPutShort, -1);
        addLeg('call', kCallShort, -1);
        addLeg('call', kCallLong, 1);
        break;
      }
    }
    return {
      openedAtIdx: idx,
      closeIdx,
      initialIV: iv,
      initialSpot: spot,
      ruleSnapshot: rule,
      netCredit,
      legs,
    };
  };

  const valuePosition = (
    pos: SyntheticPosition,
    barIdx: number
  ): number => {
    const spot = closes[barIdx];
    const yearsRemaining = Math.max(0, (pos.closeIdx - barIdx) * yearsPerDay);
    let total = 0;
    for (const leg of pos.legs) {
      const fn = leg.type === 'call' ? bsmCall : bsmPut;
      const px = fn(spot, leg.strike, rate, leg.iv, yearsRemaining).price;
      total += leg.sign * px * pos.ruleSnapshot.quantity * 100;
    }
    return total;
  };

  for (let i = 50; i < candles.length; i++) {
    if (active) {
      // Check take-profit
      const cur = valuePosition(active, i);
      const isCredit = active.netCredit < 0; // signed
      const credit = Math.abs(active.netCredit);
      const debit = Math.abs(active.netCredit);

      let close = false;
      let closeReason = '';
      if (i >= active.closeIdx) {
        close = true;
        closeReason = 'expiration';
      } else if (isCredit && cur > -credit + credit * (1 - takeProfitPct)) {
        // Wait — for a credit, we received `credit` (negative netCredit).
        // We close when current value to close out is small enough that
        // we keep `takeProfitPct` of the credit.
        // currentValue is net debit to close (positive when we have to pay).
        // For a credit position: opened at net = -credit. P&L = -netCredit - currentValue
        // = credit - currentValue. We want P&L >= takeProfitPct × credit.
        // → currentValue <= credit × (1 - takeProfitPct)
        if (Math.abs(cur) <= credit * (1 - takeProfitPct)) {
          close = true;
          closeReason = 'take_profit';
        }
      } else if (!isCredit && cur >= debit * (1 + takeProfitPct)) {
        close = true;
        closeReason = 'take_profit';
      }

      if (close) {
        // realized P&L for credit: credit - currentValueAtClose
        // realized P&L for debit: currentValueAtClose - debit
        const closeValue = cur;
        const realizedPnL = isCredit
          ? credit - Math.abs(closeValue)
          : closeValue - debit;
        trades.push({
          index: trades.length,
          openedAt: candleTimeToDate(candles[active.openedAtIdx].time),
          closedAt: candleTimeToDate(candles[i].time),
          ruleDescription: describeRule(active.ruleSnapshot) + ` [${closeReason}]`,
          netCredit: active.netCredit,
          closeNetValue: closeValue,
          realizedPnL,
          spotAtOpen: active.initialSpot,
          spotAtClose: closes[i],
          ivAtOpen: active.initialIV,
        });
        active = null;
      }
    }

    // Open if no active and cadence hits
    if (!active && (i - 50) % cadenceBars === 0) {
      active = openSyntheticPosition(i);
    }
  }

  const totalPnL = trades.reduce((s, t) => s + t.realizedPnL, 0);
  const winRate =
    trades.length > 0
      ? (trades.filter((t) => t.realizedPnL > 0).length / trades.length) * 100
      : 0;
  const expectancy = trades.length > 0 ? totalPnL / trades.length : 0;

  return { trades, totalPnL, winRate, expectancy, warnings };
}
