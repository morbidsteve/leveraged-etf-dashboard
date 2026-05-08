'use client';

import { useMemo } from 'react';
import { Strategy } from '@/types/strategy';
import { usePaperStore } from '@/store';
import { computeKelly } from '@/lib/kelly';

/**
 * Kelly-criterion sizing card for a single strategy. Computed from
 * the strategy's paper trade history (win rate, avg win, avg loss)
 * and surfaces full / half / quarter Kelly. Embedded in StrategyDetail.
 */
export default function KellyCard({ strategy }: { strategy: Strategy }) {
  const closedPaper = usePaperStore((s) => s.closed);

  const stats = useMemo(() => {
    const myTrades = closedPaper.filter((t) => t.strategyId === strategy.id);
    if (myTrades.length === 0) return null;
    const wins = myTrades.filter((t) => t.realizedPnL > 0);
    const losses = myTrades.filter((t) => t.realizedPnL <= 0);
    const winRate = wins.length / myTrades.length;
    const avgWin = wins.length > 0
      ? wins.reduce((s, t) => s + t.realizedPnL, 0) / wins.length
      : 0;
    const avgLoss = losses.length > 0
      ? Math.abs(losses.reduce((s, t) => s + t.realizedPnL, 0) / losses.length)
      : 0;
    return computeKelly({ winRate, avgWin, avgLoss, tradeCount: myTrades.length });
  }, [closedPaper, strategy.id]);

  if (!stats) return null;

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
          Kelly sizing
        </h4>
        {!stats.reliable && (
          <span className="text-[9px] uppercase tracking-widest text-amber-300">
            ⚠ low data
          </span>
        )}
      </div>
      <p className="text-[11px] text-gray-300 leading-relaxed">{stats.description}</p>
      <div className="grid grid-cols-3 gap-2">
        <KellyStat label="Full Kelly" value={`${(stats.fullKelly * 100).toFixed(1)}%`} tone={stats.fullKelly > 0 ? 'profit' : 'loss'} />
        <KellyStat label="½ Kelly" value={`${(stats.halfKelly * 100).toFixed(1)}%`} hint="recommended" />
        <KellyStat label="¼ Kelly" value={`${(stats.quarterKelly * 100).toFixed(1)}%`} hint="conservative" />
      </div>
      <div className="text-[10px] text-gray-500 font-mono">
        Win rate {((stats.fullKelly + (1 - (stats.fullKelly < 0 ? 0 : 1))) * 100).toFixed(0)}%
        · Payoff {stats.payoffRatio.toFixed(2)}:1
      </div>
    </div>
  );
}

function KellyStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'profit' | 'loss';
}) {
  return (
    <div className="rounded bg-black/30 border border-white/5 p-1.5">
      <div className="text-[8px] uppercase tracking-widest text-gray-500">{label}</div>
      <div
        className={`text-xs font-mono font-semibold mt-0.5 ${
          tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-white'
        }`}
      >
        {value}
      </div>
      {hint && <div className="text-[8px] text-gray-500 mt-0.5">{hint}</div>}
    </div>
  );
}
