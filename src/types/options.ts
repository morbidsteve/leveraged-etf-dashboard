/**
 * Options trading domain types. Parallel to /types/index.ts (equities)
 * since the data shapes and risk model are different enough that
 * shoehorning into Trade would create more friction than value.
 */

/** A single option contract (one strike + expiration + call/put). */
export interface OptionContract {
  /** OCC-style symbol: SOXL  260117C00050000 (or Schwab variant). */
  symbol: string;
  underlying: string;
  expiration: string;          // YYYY-MM-DD
  daysToExpiry: number;
  strike: number;
  type: 'call' | 'put';

  // Live quote
  bid: number;
  ask: number;
  last: number | null;
  mark: number;                // (bid + ask) / 2
  volume: number;
  openInterest: number;

  // Greeks (broker-supplied)
  iv: number;                  // implied volatility, decimal (0.45 = 45%)
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;

  // Optional metadata
  bidSize?: number;
  askSize?: number;
  intrinsicValue?: number;
  timeValue?: number;
  inTheMoney?: boolean;
}

/** All contracts at a single expiration, keyed by strike. */
export interface OptionExpiration {
  date: string;                // YYYY-MM-DD
  daysToExpiry: number;
  calls: Record<number, OptionContract>;  // keyed by strike
  puts: Record<number, OptionContract>;
}

/** Full chain for an underlying. */
export interface OptionChain {
  underlying: string;
  underlyingPrice: number;     // mark of the underlying at fetch time
  fetchedAt: Date;
  expirations: OptionExpiration[];
  /** Did the broker actually return this, or is it a graceful-empty stub? */
  configured: boolean;
  /** Surface upstream errors back to the UI without throwing. */
  error?: string;
}

// ── Position model ──────────────────────────────────────────────────────

export type OptionInstruction =
  | 'BUY_TO_OPEN'
  | 'SELL_TO_OPEN'
  | 'BUY_TO_CLOSE'
  | 'SELL_TO_CLOSE';

/** One leg of a (possibly multi-leg) option position. */
export interface OptionLeg {
  contractSymbol: string;
  underlying: string;
  expiration: string;
  strike: number;
  type: 'call' | 'put';
  instruction: OptionInstruction;
  quantity: number;            // contracts (each = 100 shares)
  /** Per-contract premium at fill (+ for paid debit, – for received credit). */
  fillPrice: number;
  filledAt: Date;
}

export type OptionStructure =
  | 'single'
  | 'vertical'                 // Bull call / bear put / bull put / bear call
  | 'calendar'                 // same strike, different expirations
  | 'diagonal'                 // different strike + different expiration
  | 'iron_condor'              // call spread + put spread, defined risk
  | 'iron_butterfly'           // ATM call + put short, OTM call + put long
  | 'butterfly'                // 1 long ITM, 2 short ATM, 1 long OTM (calls or puts)
  | 'straddle'                 // long call + long put at same strike (or short)
  | 'strangle'                 // long OTM call + long OTM put
  | 'custom';

/** A user's open or closed options position. Contains 1+ legs that
 *  net into a defined-risk structure. */
export interface OptionPosition {
  id: string;
  underlying: string;
  structure: OptionStructure;
  legs: OptionLeg[];

  /** Net debit (+) or credit (–) at open, summed across all legs. */
  netCost: number;
  /** Maximum profit at expiration, broker-style (signed). */
  maxProfit: number;
  /** Maximum loss at expiration, broker-style (positive number). */
  maxLoss: number;
  /** Breakeven points at expiration. 0–2 entries depending on structure. */
  breakevens: number[];

  openedAt: Date;
  closedAt?: Date;
  closedNetValue?: number;     // proceeds at close
  realizedPnL?: number;
  notes?: string;
}

// ── Order placement payload ─────────────────────────────────────────────

/** Schwab options-order JSON shape. We only model the subset we emit. */
export interface OptionOrderRequest {
  symbol: string;              // for telemetry; not Schwab field
  legs: Array<{
    contractSymbol: string;
    instruction: OptionInstruction;
    quantity: number;
  }>;
  /** Net price across all legs. + = debit, – = credit. */
  netPrice: number;
  duration: 'DAY' | 'GOOD_TILL_CANCEL';
  /** Schwab strategy-type hint — defaults SINGLE for 1 leg, otherwise
   * the structure's complex name. */
  complexStrategyType?: string;
}

// ── Volatility / IV summary ─────────────────────────────────────────────

export interface IVSummary {
  underlying: string;
  /** ATM IV at the nearest weekly expiration. */
  atmIv: number;
  /** ATM IV per expiration (term structure). */
  termStructure: Array<{
    expiration: string;
    daysToExpiry: number;
    atmIv: number;
  }>;
  /** Smile at the front-month: IV by strike. */
  smile: Array<{
    strike: number;
    iv: number;
    type: 'call' | 'put';
  }>;
  /** Percentile of current ATM IV vs trailing window. Null if not enough
   * history is available. */
  ivPercentile252?: number;
}
