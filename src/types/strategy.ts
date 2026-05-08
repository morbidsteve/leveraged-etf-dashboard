// ─── Strategy DSL types ─────────────────────────────────────────────────
// Composable, type-safe representation of a trading strategy. Same types are
// used by the live evaluator, the paper-trading runner, and the backtester.

import { RSIConfig } from './index';

// ── Value references — what conditions can read ────────────────────────

/** Supported chart timeframes for multi-timeframe conditions. */
export type Timeframe = '1m' | '5m' | '15m' | '1h' | '1d';

export type ValueRef =
  | { kind: 'literal'; value: number }
  /**
   * Indicator values. Optional `ticker` lets a condition reference data
   * from a DIFFERENT ticker than the strategy is acting on — e.g. "when
   * SPY price > 600, buy TQQQ" sets ticker='SPY' on the price ValueRef
   * even though the strategy's action ticker is TQQQ. The evaluator
   * looks up the other ticker's data from ctx.byTicker.
   */
  | { kind: 'price'; tf?: Timeframe; ticker?: string }
  | { kind: 'rsi'; period: number; tf?: Timeframe; ticker?: string }
  | { kind: 'ema'; period: number; tf?: Timeframe; ticker?: string }
  | { kind: 'sma'; period: number; tf?: Timeframe; ticker?: string }
  | { kind: 'vwap'; tf?: Timeframe; ticker?: string }
  | { kind: 'volume'; tf?: Timeframe; ticker?: string }
  | { kind: 'minutes_since_open' }            // 0 at 9:30 ET
  | { kind: 'entry_price' }                   // valid only in EXIT/STOP context
  | { kind: 'minutes_since_entry' }           // valid only in EXIT/STOP context
  | { kind: 'pct_of'; base: ValueRef; pct: number }  // base × (1 + pct/100)
  // ── Options-aware values (Sprint O7) ─────────────────────────────────
  /** ATM IV at the front-month expiration of the strategy's underlying.
   * `period` selects 'live' (current) or 'percentile_252' (rolling rank). */
  | { kind: 'iv'; period: 'live' | 'percentile_252' }
  /** Resolved-contract delta. Used to gate on "is there a contract at
   * this delta available?" rarely; mostly informational. */
  | { kind: 'delta'; daysToExpiry: number; type: 'call' | 'put' }
  /** Days until soonest leg in current options position. valid in EXIT context. */
  | { kind: 'days_to_expiry' }
  /** Position-relative P&L percent for the active options position.
   * Computed as realized + unrealized over net cost. valid in EXIT context. */
  | { kind: 'position_pnl_pct' };

// ── Conditions — boolean-valued expressions on the data context ────────

export type CompareOp = '>' | '<' | '>=' | '<=' | '==' | '!=';

export interface CompareLeaf {
  type: 'compare';
  left: ValueRef;
  op: CompareOp;
  right: ValueRef;
}

export interface CrossLeaf {
  type: 'cross';
  target: ValueRef;        // typically rsi/price/ema
  threshold: ValueRef;     // typically literal or another value
  dir: 'above' | 'below';  // crosses_above | crosses_below
}

export interface TimeLeaf {
  type: 'time_window';
  start: string;           // "HH:MM" 24h ET
  end: string;
}

export type ConditionLeaf = CompareLeaf | CrossLeaf | TimeLeaf;

export interface AndNode {
  type: 'and';
  children: ConditionTree[];
}
export interface OrNode {
  type: 'or';
  children: ConditionTree[];
}
export interface NotNode {
  type: 'not';
  child: ConditionTree;
}

export type ConditionTree = ConditionLeaf | AndNode | OrNode | NotNode;

// ── Strategy ────────────────────────────────────────────────────────────

export type StrategyMode =
  | 'paper'           // virtual fills, tracked separately
  | 'manual_confirm'  // engine fires modal; user confirms each order
  | 'auto';           // engine sends orders directly to broker (Tier 3)

export type SizeRule =
  | { kind: 'shares'; n: number }
  | { kind: 'risk_pct'; pct: number; stop: ValueRef }; // shares = (account × pct/100) / |entry − stop|

export interface Strategy {
  id: string;
  name: string;
  /** All tickers this strategy applies to. Each runs as an independent
   * runtime/paper instance. Migration: legacy `ticker: string` strategies
   * are auto-converted to `tickers: [ticker]`. */
  tickers: string[];
  enabled: boolean;
  mode: StrategyMode;
  size: SizeRule;

  rsiConfig?: RSIConfig;   // optional override of global config
  /** Extra timeframes this strategy needs (beyond the main chartInterval). */
  additionalTimeframes?: Timeframe[];

  entry: { when: ConditionTree };
  exit:  { when: ConditionTree };
  stopLoss?: {                // optional safety net stop loss
    pct?: number;             // % below entry, e.g. 1
    when?: ConditionTree;     // OR a custom condition
  };

  cooldownMinutes: number;
  /**
   * Which market sessions this strategy is allowed to fire in. Default
   * is `['open']` (regular hours only, 9:30–16:00 ET). Including 'pre'
   * or 'post' lets the engine evaluate during 4:00–9:30 / 16:00–20:00 ET.
   * The engine + Schwab order session both gate on this.
   */
  sessions?: Array<'pre' | 'open' | 'post'>;
  createdAt: Date;
  updatedAt: Date;
}

// ── Strategy runtime state ──────────────────────────────────────────────
// Lives separately from the Strategy definition so config edits don't reset state.

export type StrategyState =
  | 'idle'              // strategy disabled
  | 'armed'             // waiting for entry condition
  | 'in_position'       // entry filled, watching exit/stop
  | 'cooldown';         // exited; waiting before re-arming

export interface StrategyRuntime {
  strategyId: string;
  /** Specific ticker this runtime tracks (one strategy can have N runtimes,
   * one per ticker). Composite key for storage: `${strategyId}:${ticker}`. */
  ticker: string;
  state: StrategyState;
  entryPrice: number | null;
  entryAt: Date | null;
  shares: number | null;
  cooldownUntil: Date | null;
}

/** Build a composite runtime key for a (strategy, ticker) pair. */
export function runtimeKey(strategyId: string, ticker: string): string {
  return `${strategyId}:${ticker}`;
}

// ── Actions emitted by the evaluator ────────────────────────────────────

export type Action =
  | {
      kind: 'enter';
      strategyId: string;
      ticker: string;
      shares: number;
      orderType: 'marketable_limit';     // ask + buffer
      reason: string;                    // "rsi(250) crossed below 50"
    }
  | {
      kind: 'exit';
      strategyId: string;
      ticker: string;
      shares: number;
      orderType: 'resting_limit' | 'marketable_limit';
      limitPrice?: number;               // populated for resting_limit (= target price)
      reason: string;
    };

// ── Evaluation context — everything a condition might read ──────────────

/** Indicator values for a single timeframe. */
export interface TimeframeIndicators {
  price: number;
  rsi: Record<number, number>;     // keyed by period
  ema: Record<number, number>;
  sma: Record<number, number>;
  vwap: number | null;
  volume: number;
}

export interface DataContext {
  ticker: string;
  /** "Native" timeframe values — what the strategy's main chartInterval gave us. */
  price: number;
  rsi: Record<number, number>;     // keyed by period — fill on demand
  ema: Record<number, number>;
  sma: Record<number, number>;
  vwap: number | null;
  volume: number;
  /** Per-timeframe indicators for multi-timeframe conditions. */
  byTf?: Partial<Record<Timeframe, TimeframeIndicators>>;
  /** Per-OTHER-ticker indicators for cross-asset conditions. Populated
   * when a ValueRef in the strategy specifies a `ticker` different from
   * the strategy's runtime ticker. */
  byTicker?: Record<
    string,
    {
      price: number;
      rsi: Record<number, number>;
      ema: Record<number, number>;
      sma: Record<number, number>;
      vwap: number | null;
      volume: number;
    }
  >;
  timestamp: Date;
  // Position-relative values (set when in_position)
  entryPrice?: number;
  entryAt?: Date;
  // ── Options-aware extensions (Sprint O7) ───────────────────────────────
  /** Front-month ATM IV (decimal). Populated when the strategy is
   * options-aware and an OptionChain has been fetched for the ticker. */
  ivLive?: number;
  /** IV percentile (0-100, rolling 252-day). Null until enough history. */
  ivPercentile?: number | null;
  /** Resolved deltas at common DTEs, keyed as `${dte}:${type}` → delta.
   * Used by 'delta' value-refs without re-walking the chain. */
  deltas?: Record<string, number>;
  /** Days to expiry of the soonest leg in the current options position. */
  optionDaysToExpiry?: number;
  /** % P&L on the open options position (unrealized + realized over cost). */
  optionPositionPnlPct?: number;
}

// ── Strategy event log entry ────────────────────────────────────────────

export type StrategyEventType =
  | 'state_change'
  | 'condition_eval'
  | 'action_emitted'
  | 'fill'
  | 'error';

export interface StrategyEvent {
  id: string;
  strategyId: string;
  timestamp: Date;
  type: StrategyEventType;
  detail: string;
  payload?: Record<string, unknown>;
}
