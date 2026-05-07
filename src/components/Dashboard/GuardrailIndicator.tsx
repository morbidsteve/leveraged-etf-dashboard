'use client';

import { useMemo } from 'react';
import { useSettingsStore, useTradeStore, usePaperStore } from '@/store';
import { evaluateGuardrails } from '@/lib/guardrails';
import { formatCurrency } from '@/lib/calculations';

/**
 * Compact top-bar pill showing today's trade count vs cap and any active
 * guardrail block. Hidden if neither cap is configured.
 */
export default function GuardrailIndicator({ dayPnL }: { dayPnL: number }) {
  const settings = useSettingsStore((s) => s.settings);
  const manualTrades = useTradeStore((s) => s.trades);
  const paperClosed = usePaperStore((s) => s.closed);

  const cfg = settings.guardrails;
  const hasCap =
    (cfg?.maxTradesPerDay && cfg.maxTradesPerDay > 0) ||
    (cfg?.dailyLossLimit && cfg.dailyLossLimit > 0);

  const guard = useMemo(
    () =>
      evaluateGuardrails({
        manualTrades,
        paperTrades: paperClosed,
        dayPnL,
        maxTradesPerDay: cfg?.maxTradesPerDay,
        dailyLossLimit: cfg?.dailyLossLimit,
      }),
    [manualTrades, paperClosed, dayPnL, cfg?.maxTradesPerDay, cfg?.dailyLossLimit]
  );

  if (!hasCap) return null;

  const tradeCapText =
    guard.maxTradesPerDay !== null
      ? `${guard.tradesToday}/${guard.maxTradesPerDay} trades`
      : `${guard.tradesToday} trades`;
  const lossCapText =
    guard.dailyLossLimit !== null
      ? `${formatCurrency(dayPnL)} / -${formatCurrency(guard.dailyLossLimit)}`
      : null;

  const tone = guard.entriesBlocked
    ? 'border-loss/60 bg-loss/15 text-loss'
    : 'border-white/10 bg-white/[0.04] text-gray-300';

  return (
    <div
      className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border ${tone}`}
      title={guard.blockReason ?? 'Daily guardrails'}
    >
      <span className="text-[10px] uppercase tracking-widest opacity-70">Today</span>
      <span className="font-mono text-xs font-semibold">{tradeCapText}</span>
      {lossCapText && (
        <>
          <span className="text-gray-600">·</span>
          <span className="font-mono text-xs font-semibold">{lossCapText}</span>
        </>
      )}
      {guard.entriesBlocked && (
        <span className="text-[10px] uppercase tracking-widest font-bold ml-1">
          🔒 Blocked
        </span>
      )}
    </div>
  );
}
