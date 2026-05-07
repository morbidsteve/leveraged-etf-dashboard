import { Trade } from '@/types';
import { PaperTrade } from '@/store/paperStore';

export interface GuardrailState {
  tradesToday: number;
  maxTradesPerDay: number | null;
  dayPnL: number;
  dailyLossLimit: number | null;
  /** when true, no NEW entries should fire today */
  entriesBlocked: boolean;
  /** human-readable reason, when blocked */
  blockReason: string | null;
}

/**
 * Pure function: given the trade lists, today's running P&L, and configured
 * caps, decide whether new entries should be blocked.
 *
 * Counts every trade ENTRY that occurred today (manual + paper) — exits
 * don't count against the trade limit.
 */
export function evaluateGuardrails(args: {
  manualTrades: Trade[];
  paperTrades: PaperTrade[];
  dayPnL: number;
  maxTradesPerDay?: number;
  dailyLossLimit?: number;
  now?: Date;
}): GuardrailState {
  const now = args.now ?? new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const manualToday = args.manualTrades.filter(
    (t) => new Date(t.createdAt) >= startOfDay
  ).length;
  const paperToday = args.paperTrades.filter(
    (t) => new Date(t.entryAt) >= startOfDay
  ).length;
  const tradesToday = manualToday + paperToday;

  const maxTradesPerDay =
    args.maxTradesPerDay && args.maxTradesPerDay > 0 ? args.maxTradesPerDay : null;
  const dailyLossLimit =
    args.dailyLossLimit && args.dailyLossLimit > 0 ? args.dailyLossLimit : null;

  let blockReason: string | null = null;

  if (maxTradesPerDay !== null && tradesToday >= maxTradesPerDay) {
    blockReason = `Daily trade limit reached (${tradesToday}/${maxTradesPerDay}). No new entries until midnight ET.`;
  } else if (dailyLossLimit !== null && args.dayPnL <= -dailyLossLimit) {
    blockReason = `Daily loss limit hit (${args.dayPnL.toFixed(2)} ≤ -${dailyLossLimit}). Strategies paused.`;
  }

  return {
    tradesToday,
    maxTradesPerDay,
    dayPnL: args.dayPnL,
    dailyLossLimit,
    entriesBlocked: blockReason !== null,
    blockReason,
  };
}
