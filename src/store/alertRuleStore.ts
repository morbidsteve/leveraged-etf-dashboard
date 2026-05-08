import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { ConditionTree } from '@/types/strategy';

/** A user-defined custom alert. Decoupled from strategies — fires
 * notifications when its condition evaluates true on any of its tickers,
 * with a per-ticker cooldown. */
export interface AlertRule {
  id: string;
  name: string;
  tickers: string[];
  condition: ConditionTree;
  enabled: boolean;
  channels: {
    sound: boolean;
    toast: boolean;
    browserNotif: boolean;
  };
  cooldownMinutes: number;
  /** Per-ticker timestamp of most recent fire (epoch ms). */
  lastFiredAt?: Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AlertRuleFire {
  id: string;
  ruleId: string;
  ruleName: string;
  ticker: string;
  timestamp: Date;
  detail: string;
  acknowledged: boolean;
}

interface AlertRuleState {
  rules: AlertRule[];
  fires: AlertRuleFire[];
  _hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  addRule: (
    input: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt' | 'lastFiredAt'>
  ) => AlertRule;
  updateRule: (id: string, patch: Partial<AlertRule>) => void;
  deleteRule: (id: string) => void;
  recordFire: (ruleId: string, ticker: string, detail: string) => AlertRuleFire | null;
  acknowledgeFire: (id: string) => void;
  clearFires: () => void;
}

function genId(): string {
  return `ar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useAlertRuleStore = create<AlertRuleState>()(
  persist(
    (set, get) => ({
      rules: [],
      fires: [],
      _hasHydrated: false,

      setHasHydrated: (v) => set({ _hasHydrated: v }),

      addRule: (input) => {
        const now = new Date();
        const rule: AlertRule = {
          ...input,
          id: genId(),
          tickers: input.tickers.map((t) => t.toUpperCase()),
          createdAt: now,
          updatedAt: now,
          lastFiredAt: {},
        };
        set((s) => ({ rules: [...s.rules, rule] }));
        return rule;
      },

      updateRule: (id, patch) =>
        set((s) => ({
          rules: s.rules.map((r) =>
            r.id === id
              ? {
                  ...r,
                  ...patch,
                  tickers: patch.tickers
                    ? patch.tickers.map((t) => t.toUpperCase())
                    : r.tickers,
                  updatedAt: new Date(),
                }
              : r
          ),
        })),

      deleteRule: (id) =>
        set((s) => ({
          rules: s.rules.filter((r) => r.id !== id),
        })),

      recordFire: (ruleId, ticker, detail) => {
        const rule = get().rules.find((r) => r.id === ruleId);
        if (!rule) return null;
        const now = Date.now();
        const last = rule.lastFiredAt?.[ticker] ?? 0;
        if (now - last < rule.cooldownMinutes * 60_000) {
          return null; // cooldown
        }
        const fire: AlertRuleFire = {
          id: genId(),
          ruleId,
          ruleName: rule.name,
          ticker,
          timestamp: new Date(now),
          detail,
          acknowledged: false,
        };
        set((s) => ({
          rules: s.rules.map((r) =>
            r.id === ruleId
              ? { ...r, lastFiredAt: { ...(r.lastFiredAt ?? {}), [ticker]: now } }
              : r
          ),
          // Keep only the last 200 fires to bound storage
          fires: [...s.fires.slice(-199), fire],
        }));
        return fire;
      },

      acknowledgeFire: (id) =>
        set((s) => ({
          fires: s.fires.map((f) =>
            f.id === id ? { ...f, acknowledged: true } : f
          ),
        })),

      clearFires: () => set({ fires: [] }),
    }),
    {
      name: 'alert-rule-storage',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
