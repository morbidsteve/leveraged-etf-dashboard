import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  Strategy,
  StrategyRuntime,
  StrategyEvent,
} from '@/types/strategy';
import { initialRuntime } from '@/lib/strategy/evaluator';
import { generateId } from '@/lib/calculations';

interface StrategyState {
  strategies: Strategy[];
  runtimes: Record<string, StrategyRuntime>;
  events: StrategyEvent[];
  _hasHydrated: boolean;

  setHasHydrated: (state: boolean) => void;
  addStrategy: (input: Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'>) => Strategy;
  updateStrategy: (id: string, patch: Partial<Strategy>) => void;
  deleteStrategy: (id: string) => void;
  setRuntime: (strategyId: string, runtime: StrategyRuntime) => void;
  appendEvents: (events: Omit<StrategyEvent, 'id'>[]) => void;
  clearEvents: (strategyId?: string) => void;
}

const MAX_EVENTS_KEPT = 1000;

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
        const strategy: Strategy = {
          ...input,
          id: generateId(),
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          strategies: [...state.strategies, strategy],
          runtimes: { ...state.runtimes, [strategy.id]: initialRuntime(strategy.id) },
        }));
        return strategy;
      },

      updateStrategy: (id, patch) =>
        set((state) => ({
          strategies: state.strategies.map((s) =>
            s.id === id ? { ...s, ...patch, updatedAt: new Date() } : s
          ),
        })),

      deleteStrategy: (id) =>
        set((state) => {
          const { [id]: _removed, ...rest } = state.runtimes;
          return {
            strategies: state.strategies.filter((s) => s.id !== id),
            runtimes: rest,
            events: state.events.filter((e) => e.strategyId !== id),
          };
        }),

      setRuntime: (strategyId, runtime) =>
        set((state) => ({ runtimes: { ...state.runtimes, [strategyId]: runtime } })),

      appendEvents: (newEvents) =>
        set((state) => {
          const stamped = newEvents.map((e) => ({ ...e, id: generateId() }));
          const next = [...state.events, ...stamped];
          // Cap event history so localStorage doesn't bloat
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
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        strategies: state.strategies,
        runtimes: state.runtimes,
        events: state.events.slice(-200),  // persist a smaller window of events
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
