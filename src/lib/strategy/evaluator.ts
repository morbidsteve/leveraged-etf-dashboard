import {
  Strategy,
  StrategyRuntime,
  StrategyState,
  Action,
  DataContext,
  ConditionTree,
} from '@/types/strategy';
import { evaluate, describeCondition } from './conditions';

export interface TickInput {
  strategy: Strategy;
  runtime: StrategyRuntime;
  prevCtx: DataContext | null;
  currCtx: DataContext;
  now: Date;
}

export interface TickOutput {
  runtime: StrategyRuntime;
  actions: Action[];
  events: { type: 'state_change' | 'action_emitted'; detail: string }[];
}

/**
 * Pure tick evaluator — given a strategy + its prior runtime + the data
 * context, returns the new runtime, any actions to take, and any events
 * worth logging. Deterministic: same inputs → same outputs, always.
 *
 * The hook layer (useStrategyEngine) wires this up to live data and
 * dispatches the actions through the executor.
 */
export function tick(input: TickInput): TickOutput {
  const { strategy, runtime, prevCtx, currCtx, now } = input;
  const events: TickOutput['events'] = [];
  const actions: Action[] = [];
  let nextRuntime = runtime;

  if (!strategy.enabled) {
    if (runtime.state !== 'idle') {
      nextRuntime = { ...runtime, state: 'idle' };
      events.push({ type: 'state_change', detail: 'Strategy disabled — moving to idle' });
    }
    return { runtime: nextRuntime, actions, events };
  }

  switch (runtime.state) {
    case 'idle': {
      // Enabled → arm
      nextRuntime = {
        ...runtime,
        state: 'armed',
        entryPrice: null,
        entryAt: null,
        shares: null,
        cooldownUntil: null,
      };
      events.push({ type: 'state_change', detail: 'idle → armed' });
      break;
    }

    case 'armed': {
      // Watch entry condition
      if (evaluate(strategy.entry.when, currCtx, prevCtx)) {
        const shares = resolveShares(strategy);
        if (shares <= 0) {
          events.push({
            type: 'state_change',
            detail: `Entry condition fired but resolved share count is ${shares}; ignoring.`,
          });
          break;
        }
        actions.push({
          kind: 'enter',
          strategyId: strategy.id,
          ticker: strategy.ticker,
          shares,
          orderType: 'marketable_limit',
          reason: describeCondition(strategy.entry.when),
        });
        // Optimistically transition to in_position; the engine layer is
        // responsible for tracking actual fill confirmation. For paper mode
        // this is correct — paper fills are synchronous at currCtx.price.
        nextRuntime = {
          ...runtime,
          state: 'in_position',
          entryPrice: currCtx.price,
          entryAt: currCtx.timestamp,
          shares,
        };
        events.push({
          type: 'state_change',
          detail: `armed → in_position (entry ${currCtx.price.toFixed(4)} × ${shares})`,
        });
        events.push({
          type: 'action_emitted',
          detail: `BUY ${shares} ${strategy.ticker} marketable @ ${currCtx.price.toFixed(2)} — ${describeCondition(strategy.entry.when)}`,
        });
      }
      break;
    }

    case 'in_position': {
      const inPositionCtx: DataContext = {
        ...currCtx,
        entryPrice: runtime.entryPrice ?? undefined,
        entryAt: runtime.entryAt ?? undefined,
      };
      const prevInPosition: DataContext | null = prevCtx
        ? { ...prevCtx, entryPrice: runtime.entryPrice ?? undefined, entryAt: runtime.entryAt ?? undefined }
        : null;

      const stopFired = evaluateStopLoss(strategy, inPositionCtx, prevInPosition);
      const exitFired = evaluate(strategy.exit.when, inPositionCtx, prevInPosition);

      if (stopFired || exitFired) {
        const shares = runtime.shares ?? 0;
        const isTargetExit = isTargetCondition(strategy.exit.when);

        actions.push({
          kind: 'exit',
          strategyId: strategy.id,
          ticker: strategy.ticker,
          shares,
          orderType: stopFired ? 'marketable_limit' : isTargetExit ? 'resting_limit' : 'marketable_limit',
          limitPrice: isTargetExit && !stopFired ? targetPrice(strategy, runtime) : undefined,
          reason: stopFired
            ? `Safety stop: ${describeCondition(buildStopCondition(strategy)!)}`
            : describeCondition(strategy.exit.when),
        });

        const cooldownUntil = new Date(now.getTime() + strategy.cooldownMinutes * 60_000);
        nextRuntime = {
          ...runtime,
          state: 'cooldown',
          cooldownUntil,
        };
        events.push({
          type: 'state_change',
          detail: `in_position → cooldown (until ${cooldownUntil.toISOString()})`,
        });
        events.push({
          type: 'action_emitted',
          detail: `SELL ${shares} ${strategy.ticker} — ${stopFired ? 'STOP' : 'EXIT'}`,
        });
      }
      break;
    }

    case 'cooldown': {
      if (runtime.cooldownUntil && now >= runtime.cooldownUntil) {
        nextRuntime = {
          ...runtime,
          state: 'armed',
          entryPrice: null,
          entryAt: null,
          shares: null,
          cooldownUntil: null,
        };
        events.push({ type: 'state_change', detail: 'cooldown → armed' });
      }
      break;
    }
  }

  return { runtime: nextRuntime, actions, events };
}

// ── helpers ──────────────────────────────────────────────────────────────

export function initialRuntime(strategyId: string): StrategyRuntime {
  return {
    strategyId,
    state: 'idle',
    entryPrice: null,
    entryAt: null,
    shares: null,
    cooldownUntil: null,
  };
}

export function describeState(s: StrategyState): string {
  switch (s) {
    case 'idle': return 'Idle';
    case 'armed': return 'Watching for entry';
    case 'in_position': return 'In position';
    case 'cooldown': return 'Cooldown';
  }
}

function resolveShares(strategy: Strategy): number {
  // Tier 1: only fixed-share sizing supported. Risk-pct sizing requires
  // accountSize from settings + a stop reference; we'll wire it in Tier 1.5.
  if (strategy.size.kind === 'shares') return strategy.size.n;
  return 0;
}

function isTargetCondition(cond: ConditionTree): boolean {
  // Heuristic: a "target" exit is a `compare` that references entry_price.
  // For target exits we use a resting limit at the target price.
  if (cond.type !== 'compare') return false;
  return refsEntryPrice(cond.left) || refsEntryPrice(cond.right);
}

function refsEntryPrice(ref: { kind: string }): boolean {
  if (ref.kind === 'entry_price') return true;
  if (ref.kind === 'pct_of') return refsEntryPrice((ref as unknown as { base: { kind: string } }).base);
  return false;
}

function targetPrice(strategy: Strategy, runtime: StrategyRuntime): number | undefined {
  if (strategy.exit.when.type !== 'compare') return undefined;
  if (runtime.entryPrice === null) return undefined;

  const cmp = strategy.exit.when;
  // Find the side that references entry_price (directly or via pct_of)
  const r = cmp.right;
  if (r.kind === 'pct_of' && r.base.kind === 'entry_price') {
    return runtime.entryPrice * (1 + r.pct / 100);
  }
  return undefined;
}

/** Build the implicit stop-loss condition from the strategy.stopLoss config. */
function buildStopCondition(strategy: Strategy): ConditionTree | null {
  if (!strategy.stopLoss) return null;
  if (strategy.stopLoss.when) return strategy.stopLoss.when;
  if (strategy.stopLoss.pct !== undefined) {
    return {
      type: 'compare',
      left: { kind: 'price' },
      op: '<=',
      right: {
        kind: 'pct_of',
        base: { kind: 'entry_price' },
        pct: -Math.abs(strategy.stopLoss.pct),  // negative → below entry
      },
    };
  }
  return null;
}

function evaluateStopLoss(
  strategy: Strategy,
  ctx: DataContext,
  prevCtx: DataContext | null
): boolean {
  const cond = buildStopCondition(strategy);
  if (!cond) return false;
  return evaluate(cond, ctx, prevCtx);
}
