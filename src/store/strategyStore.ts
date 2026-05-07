import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  Strategy,
  StrategyRuntime,
  StrategyEvent,
  runtimeKey,
} from '@/types/strategy';
import { initialRuntime } from '@/lib/strategy/evaluator';
import { generateId } from '@/lib/calculations';

interface StrategyState {
  strategies: Strategy[];
  /** Composite-keyed by `${strategyId}:${ticker}` so one strategy with N
   * tickers has N independent runtime states. */
  runtimes: Record<string, StrategyRuntime>;
  events: StrategyEvent[];
  _hasHydrated: boolean;

  setHasHydrated: (state: boolean) => void;
  addStrategy: (input: Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'>) => Strategy;
  updateStrategy: (id: string, patch: Partial<Strategy>) => void;
  deleteStrategy: (id: string) => void;
  setRuntime: (strategyId: string, ticker: string, runtime: StrategyRuntime) => void;
  appendEvents: (events: Omit<StrategyEvent, 'id'>[]) => void;
  clearEvents: (strategyId?: string) => void;
}

const MAX_EVENTS_KEPT = 1000;

/**
 * Migration from v1 (single-ticker strategies) to v2 (multi-ticker).
 * Legacy strategies stored `ticker: string` and runtimes keyed by strategyId.
 * After migration: `tickers: string[]`, runtimes keyed by `${strategyId}:${ticker}`.
 */
interface LegacyStrategyV1 {
  id: string;
  name: string;
  ticker: string;          // legacy
  enabled: boolean;
  mode: string;
  size: unknown;
  rsiConfig?: unknown;
  entry: unknown;
  exit: unknown;
  stopLoss?: unknown;
  cooldownMinutes: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}
interface LegacyRuntimeV1 {
  strategyId: string;
  state: string;
  entryPrice: number | null;
  entryAt: string | Date | null;
  shares: number | null;
  cooldownUntil: string | Date | null;
  // no ticker field
}

function migrateV1ToV2(persistedState: unknown): {
  strategies: Strategy[];
  runtimes: Record<string, StrategyRuntime>;
  events: StrategyEvent[];
} {
  const s = persistedState as {
    strategies?: (LegacyStrategyV1 | Strategy)[];
    runtimes?: Record<string, LegacyRuntimeV1 | StrategyRuntime>;
    events?: StrategyEvent[];
  };

  const newStrategies: Strategy[] = (s.strategies ?? []).map((leg) => {
    // Already migrated?
    if ('tickers' in leg && Array.isArray(leg.tickers)) return leg as Strategy;
    // Legacy single-ticker -> array
    const oldTicker = (leg as LegacyStrategyV1).ticker;
    return {
      ...(leg as unknown as Strategy),
      tickers: oldTicker ? [oldTicker] : [],
    };
  });

  // Rebuild runtimes from scratch — old single-key runtimes get upgraded to
  // composite keys for each strategy's tickers.
  const newRuntimes: Record<string, StrategyRuntime> = {};
  for (const strat of newStrategies) {
    for (const ticker of strat.tickers) {
      const key = runtimeKey(strat.id, ticker);
      // If a legacy runtime exists for this strategy, port its state to
      // the first ticker (or all of them — legacy was single-ticker so
      // this is a one-to-one transfer).
      const legacyRt = s.runtimes?.[strat.id];
      if (legacyRt && !('ticker' in legacyRt)) {
        newRuntimes[key] = {
          strategyId: strat.id,
          ticker,
          state: (legacyRt as LegacyRuntimeV1).state as StrategyRuntime['state'],
          entryPrice: legacyRt.entryPrice,
          entryAt: legacyRt.entryAt ? new Date(legacyRt.entryAt) : null,
          shares: legacyRt.shares,
          cooldownUntil: legacyRt.cooldownUntil ? new Date(legacyRt.cooldownUntil) : null,
        };
      } else if (s.runtimes?.[key]) {
        newRuntimes[key] = s.runtimes[key] as StrategyRuntime;
      } else {
        newRuntimes[key] = initialRuntime(strat.id, ticker);
      }
    }
  }

  return {
    strategies: newStrategies,
    runtimes: newRuntimes,
    events: s.events ?? [],
  };
}

export const useStrategyStore = create<StrategyState>()(
  persist(
    (set) => ({
      strategies: [],
      runtimes: {},
      events: [],
      _hasHydrated: false,

      setHasHydrated: (state) => set({ _hasHydrated: state }),

      addStrategy: (input) => {
        const now = new Date();
        const tickers = (input.tickers && input.tickers.length > 0) ? input.tickers : ['SOXL'];
        const strategy: Strategy = {
          ...input,
          tickers,
          id: generateId(),
          createdAt: now,
          updatedAt: now,
        };
        // One runtime per (strategy, ticker) pair
        const newRuntimes: Record<string, StrategyRuntime> = {};
        for (const t of tickers) {
          newRuntimes[runtimeKey(strategy.id, t)] = initialRuntime(strategy.id, t);
        }
        set((state) => ({
          strategies: [...state.strategies, strategy],
          runtimes: { ...state.runtimes, ...newRuntimes },
        }));
        return strategy;
      },

      updateStrategy: (id, patch) =>
        set((state) => {
          const current = state.strategies.find((s) => s.id === id);
          if (!current) return state;

          // If tickers changed, sync runtime entries: add new, drop removed.
          const updated: Strategy = { ...current, ...patch, updatedAt: new Date() };
          let runtimes = state.runtimes;
          if (patch.tickers) {
            const newTickerSet = new Set(updated.tickers);
            const oldTickerSet = new Set(current.tickers);
            const adds: string[] = updated.tickers.filter((t) => !oldTickerSet.has(t));
            const drops: string[] = current.tickers.filter((t) => !newTickerSet.has(t));

            const next = { ...runtimes };
            for (const t of adds) {
              next[runtimeKey(id, t)] = initialRuntime(id, t);
            }
            for (const t of drops) {
              delete next[runtimeKey(id, t)];
            }
            runtimes = next;
          }

          return {
            strategies: state.strategies.map((s) => (s.id === id ? updated : s)),
            runtimes,
          };
        }),

      deleteStrategy: (id) =>
        set((state) => {
          const filteredRuntimes: Record<string, StrategyRuntime> = {};
          for (const [k, v] of Object.entries(state.runtimes)) {
            if (v.strategyId !== id) filteredRuntimes[k] = v;
          }
          return {
            strategies: state.strategies.filter((s) => s.id !== id),
            runtimes: filteredRuntimes,
            events: state.events.filter((e) => e.strategyId !== id),
          };
        }),

      setRuntime: (strategyId, ticker, runtime) =>
        set((state) => ({
          runtimes: { ...state.runtimes, [runtimeKey(strategyId, ticker)]: runtime },
        })),

      appendEvents: (newEvents) =>
        set((state) => {
          const stamped = newEvents.map((e) => ({ ...e, id: generateId() }));
          const next = [...state.events, ...stamped];
          const trimmed =
            next.length > MAX_EVENTS_KEPT ? next.slice(-MAX_EVENTS_KEPT) : next;
          return { events: trimmed };
        }),

      clearEvents: (strategyId) =>
        set((state) => ({
          events: strategyId ? state.events.filter((e) => e.strategyId !== strategyId) : [],
        })),
    }),
    {
      name: 'strategy-storage',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState, version) => {
        if (version < 2) {
          return migrateV1ToV2(persistedState) as unknown as StrategyState;
        }
        return persistedState as StrategyState;
      },
      partialize: (state) => ({
        strategies: state.strategies,
        runtimes: state.runtimes,
        events: state.events.slice(-200),
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
