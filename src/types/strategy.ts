// ─── Strategy DSL types ─────────────────────────────────────────────────
// Composable, type-safe representation of a trading strategy. Same types are
// used by the live evaluator, the paper-trading runner, and the backtester.

import { RSIConfig } from './index';

// ── Value references — what conditions can read ────────────────────────

/** Supported chart timeframes for multi-timeframe conditions. */
export type Timeframe = '1m' | '5m' | '15m' | '1h' | '1d';

export type ValueRef =
  | { kind: 'literal'; value: number }
  | { kind: 'price'; tf?: Timeframe }                          // close of the most recent bar at tf
  | { kind: 'rsi'; period: number; tf?: Timeframe }
  | { kind: 'ema'; period: number; tf?: Timeframe }
  | { kind: 'sma'; period: number; tf?: Timeframe }
  | { kind: 'vwap'; tf?: Timeframe }
  | { kind: 'volume'; tf?: Timeframe }
  | { kind: 'minutes_since_open' }            // 0 at 9:30 ET
  | { kind: 'entry_price' }                   // valid only in EXIT/STOP context
  | { kind: 'minutes_since_entry' }           // valid only in EXIT/STOP context
  | { kind: 'pct_of'; base: ValueRef; pct: number }; // base × (1 + pct/100)

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
  timestamp: Date;
  // Position-relative values (set when in_position)
  entryPrice?: number;
  entryAt?: Date;
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
