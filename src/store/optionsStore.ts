import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  OptionPosition,
  OptionLeg,
  OptionStructure,
} from '@/types/options';

/**
 * Options positions store. Parallel to the equity tradeStore — options
 * are multi-leg structures with non-linear P&L, so they don't fit the
 * Trade.entries/exits model cleanly.
 *
 * Each position is open or closed; closed positions retain their full
 * leg history + realized P&L for the journal/analytics views.
 */

interface OptionsState {
  positions: OptionPosition[];
  _hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;

  /** Open a new position from one or more legs. Computes net cost +
   * derived risk metrics from the legs. */
  openPosition: (
    input: Omit<OptionPosition, 'id' | 'openedAt' | 'netCost' | 'maxProfit' | 'maxLoss' | 'breakevens'> & {
      netCost?: number;
      maxProfit?: number;
      maxLoss?: number;
      breakevens?: number[];
    }
  ) => OptionPosition;

  /** Close a position at a given net price. Computes realized P&L. */
  closePosition: (id: string, closeNetValue: number, closedAt?: Date) => OptionPosition | null;

  /** Replace one open position's data (e.g. roll to a later expiration). */
  updatePosition: (id: string, patch: Partial<OptionPosition>) => void;

  deletePosition: (id: string) => void;
  reset: () => void;
}

function genId(): string {
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Compute net cost from legs. Buy-to-open is a debit (+), sell-to-open
 * is a credit (–), buy-to-close is +, sell-to-close is –. We sum the
 * signed (price × quantity × 100) per leg. Result: + = paid, – = received.
 */
function computeNetCost(legs: OptionLeg[]): number {
  let net = 0;
  for (const l of legs) {
    const sign =
      l.instruction === 'BUY_TO_OPEN' || l.instruction === 'BUY_TO_CLOSE' ? 1 : -1;
    net += sign * l.fillPrice * l.quantity * 100;
  }
  return net;
}

/** Approximate max P&L for common structures. Best-effort — the real
 *  numbers depend on broker margin models for spreads, but for vertical /
 *  iron-condor / single this is exact. */
export function computeStructureRisk(
  structure: OptionStructure,
  legs: OptionLeg[],
  netCost: number
): { maxProfit: number; maxLoss: number; breakevens: number[] } {
  if (legs.length === 0) {
    return { maxProfit: 0, maxLoss: 0, breakevens: [] };
  }
  const isCredit = netCost < 0;
  const credit = Math.abs(netCost);

  if (structure === 'single') {
    const leg = legs[0];
    const cost = Math.abs(netCost);
    if (leg.instruction === 'BUY_TO_OPEN') {
      // Long single: max loss = premium paid; max profit = unbounded
      // (∞ for calls; up to strike × 100 for puts).
      const breakeven =
        leg.type === 'call' ? leg.strike + cost / leg.quantity / 100 : leg.strike - cost / leg.quantity / 100;
      return {
        maxProfit: leg.type === 'call' ? Infinity : leg.strike * 100 * leg.quantity,
        maxLoss: cost,
        breakevens: [breakeven],
      };
    }
    // Short single — risk is asymmetric. Naked calls = unlimited.
    return {
      maxProfit: cost, // premium received
      maxLoss: leg.type === 'call' ? Infinity : leg.strike * 100 * leg.quantity,
      breakevens: [
        leg.type === 'call' ? leg.strike + credit / leg.quantity / 100 : leg.strike - credit / leg.quantity / 100,
      ],
    };
  }

  if (structure === 'vertical') {
    // 2 legs same type, opposite direction. Width = |strike diff| × 100 × qty.
    const sameType = legs[0].type;
    const strikes = legs.map((l) => l.strike).sort((a, b) => a - b);
    const width = (strikes[strikes.length - 1] - strikes[0]) * 100 * legs[0].quantity;
    if (isCredit) {
      // Credit spread: max profit = credit; max loss = width − credit
      return {
        maxProfit: credit,
        maxLoss: Math.max(0, width - credit),
        breakevens:
          sameType === 'call'
            ? [strikes[0] + credit / legs[0].quantity / 100]
            : [strikes[1] - credit / legs[0].quantity / 100],
      };
    }
    // Debit spread: max profit = width − debit; max loss = debit
    return {
      maxProfit: Math.max(0, width - Math.abs(netCost)),
      maxLoss: Math.abs(netCost),
      breakevens:
        sameType === 'call'
          ? [strikes[0] + Math.abs(netCost) / legs[0].quantity / 100]
          : [strikes[1] - Math.abs(netCost) / legs[0].quantity / 100],
    };
  }

  if (structure === 'iron_condor') {
    // 4 legs: short put + long lower put, short call + long higher call.
    // Max profit = credit. Max loss = wider wing − credit.
    const putStrikes = legs
      .filter((l) => l.type === 'put')
      .map((l) => l.strike)
      .sort((a, b) => a - b);
    const callStrikes = legs
      .filter((l) => l.type === 'call')
      .map((l) => l.strike)
      .sort((a, b) => a - b);
    const putWidth =
      putStrikes.length === 2
        ? (putStrikes[1] - putStrikes[0]) * 100 * legs[0].quantity
        : 0;
    const callWidth =
      callStrikes.length === 2
        ? (callStrikes[1] - callStrikes[0]) * 100 * legs[0].quantity
        : 0;
    const maxLoss = Math.max(putWidth, callWidth) - credit;
    const beLow = putStrikes[1] - credit / legs[0].quantity / 100;
    const beHigh = callStrikes[0] + credit / legs[0].quantity / 100;
    return {
      maxProfit: credit,
      maxLoss: Math.max(0, maxLoss),
      breakevens: [beLow, beHigh],
    };
  }

  // Fallback for structures we haven't fully modeled — leave the broker
  // to handle margin; we report what we know.
  return {
    maxProfit: isCredit ? credit : Infinity,
    maxLoss: isCredit ? Infinity : Math.abs(netCost),
    breakevens: [],
  };
}

export const useOptionsStore = create<OptionsState>()(
  persist(
    (set) => ({
      positions: [],
      _hasHydrated: false,
      setHasHydrated: (v) => set({ _hasHydrated: v }),

      openPosition: (input) => {
        const netCost = input.netCost ?? computeNetCost(input.legs);
        const risk = computeStructureRisk(input.structure, input.legs, netCost);
        const pos: OptionPosition = {
          id: genId(),
          underlying: input.underlying,
          structure: input.structure,
          legs: input.legs,
          netCost,
          maxProfit: input.maxProfit ?? risk.maxProfit,
          maxLoss: input.maxLoss ?? risk.maxLoss,
          breakevens: input.breakevens ?? risk.breakevens,
          openedAt: new Date(),
          notes: input.notes,
        };
        set((state) => ({ positions: [...state.positions, pos] }));
        return pos;
      },

      closePosition: (id, closeNetValue, closedAt = new Date()) => {
        let updated: OptionPosition | null = null;
        set((state) => ({
          positions: state.positions.map((p) => {
            if (p.id !== id) return p;
            // realizedPnL = closeNetValue - netCost (debit positions)
            // For credit positions netCost is negative; we received it.
            // Closing means we pay (positive number). realized = -netCost - closeNetValue
            const realizedPnL = -p.netCost - closeNetValue;
            const next: OptionPosition = {
              ...p,
              closedAt,
              closedNetValue: closeNetValue,
              realizedPnL,
            };
            updated = next;
            return next;
          }),
        }));
        return updated;
      },

      updatePosition: (id, patch) =>
        set((state) => ({
          positions: state.positions.map((p) =>
            p.id === id ? { ...p, ...patch } : p
          ),
        })),

      deletePosition: (id) =>
        set((state) => ({ positions: state.positions.filter((p) => p.id !== id) })),

      reset: () => set({ positions: [] }),
    }),
    {
      name: 'options-storage',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
