import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { generateId } from '@/lib/calculations';

/**
 * Compact snapshot data captured at trade entry/exit. Renders as a small
 * SVG sparkline + RSI line in the journal. Stored as data, not pixels —
 * lighter on disk and resolution-independent.
 */
export interface TradeSnapshot {
  ticker: string;
  capturedAt: Date;
  // last N candles (closes only — keeps it small)
  closes: { time: number; close: number }[];
  // last N RSI values (parallel to closes)
  rsi: { time: number; value: number }[];
  // Marker for the entry/exit moment within the window
  markerTime: number;
  // RSI thresholds at capture time
  oversold: number;
  overbought: number;
}

export interface PaperEntry {
  id: string;
  strategyId: string;
  ticker: string;
  shares: number;
  entryPrice: number;
  entryAt: Date;
  entrySnapshot?: TradeSnapshot;
}

export interface PaperTrade {
  id: string;
  strategyId: string;
  ticker: string;
  shares: number;
  entryPrice: number;
  exitPrice: number;
  entryAt: Date;
  exitAt: Date;
  reason: string;
  realizedPnL: number;
  entrySnapshot?: TradeSnapshot;
  exitSnapshot?: TradeSnapshot;
}

interface PaperState {
  open: PaperEntry[];
  closed: PaperTrade[];
  _hasHydrated: boolean;

  setHasHydrated: (s: boolean) => void;
  openPosition: (input: Omit<PaperEntry, 'id'>) => void;
  closePosition: (
    strategyId: string,
    exitPrice: number,
    exitAt: Date,
    reason: string,
    exitSnapshot?: TradeSnapshot
  ) => PaperTrade | null;
  closeAllForStrategy: (strategyId: string) => void;
  reset: () => void;
}

export const usePaperStore = create<PaperState>()(
  persist(
    (set, get) => ({
      open: [],
      closed: [],
      _hasHydrated: false,

      setHasHydrated: (s) => set({ _hasHydrated: s }),

      openPosition: (input) => {
        // Don't open multiple paper positions for the same strategy at once
        if (get().open.some((p) => p.strategyId === input.strategyId)) return;
        const entry: PaperEntry = { ...input, id: generateId() };
        set((state) => ({ open: [...state.open, entry] }));
      },

      closePosition: (strategyId, exitPrice, exitAt, reason, exitSnapshot) => {
        const open = get().open.find((p) => p.strategyId === strategyId);
        if (!open) return null;
        const realizedPnL = (exitPrice - open.entryPrice) * open.shares;
        const trade: PaperTrade = {
          id: generateId(),
          strategyId,
          ticker: open.ticker,
          shares: open.shares,
          entryPrice: open.entryPrice,
          exitPrice,
          entryAt: open.entryAt,
          exitAt,
          reason,
          realizedPnL,
          entrySnapshot: open.entrySnapshot,
          exitSnapshot,
        };
        set((state) => ({
          open: state.open.filter((p) => p.strategyId !== strategyId),
          closed: [...state.closed, trade],
        }));
        return trade;
      },

      closeAllForStrategy: (strategyId) =>
        set((state) => ({
          open: state.open.filter((p) => p.strategyId !== strategyId),
        })),

      reset: () => set({ open: [], closed: [] }),
    }),
    {
      name: 'paper-storage',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
