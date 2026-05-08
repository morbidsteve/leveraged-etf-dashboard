'use client';

import { useMemo, useState } from 'react';
import { usePaperStore, useStrategyStore } from '@/store';
import {
  attributeByTicker,
  attributeByStrategy,
  attributeByHour,
  attributeByDayOfWeek,
  attributeByHoldTime,
  AttributionBucket,
} from '@/lib/attribution';
import { formatCurrency } from '@/lib/calculations';

type Slice = 'ticker' | 'strategy' | 'hour' | 'dayOfWeek' | 'holdTime';

const SLICES: { id: Slice; label: string }[] = [
  { id: 'ticker', label: 'Ticker' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'hour', label: 'Hour of day' },
  { id: 'dayOfWeek', label: 'Day of week' },
  { id: 'holdTime', label: 'Hold time' },
];

/**
 * Performance attribution panel — slice paper P&L across multiple
 * dimensions to find which subsets of trading make money. Lives in
 * the Analytics drawer as a third section after the rollup.
 */
export default function PerformanceAttribution() {
  const closedPaper = usePaperStore((s) => s.closed);
  const strategies = useStrategyStore((s) => s.strategies);
  const [slice, setSlice] = useState<Slice>('ticker');

  const strategyNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of strategies) m[s.id] = s.name;
    return m;
  }, [strategies]);

  const buckets: AttributionBucket[] = useMemo(() => {
    switch (slice) {
      case 'ticker': return attributeByTicker(closedPaper);
      case 'strategy': return attributeByStrategy(closedPaper, strategyNameById);
      case 'hour': return attributeByHour(closedPaper);
      case 'dayOfWeek': return attributeByDayOfWeek(closedPaper);
      case 'holdTime': return attributeByHoldTime(closedPaper);
    }
  }, [slice, closedPaper, strategyNameById]);

  if (closedPaper.length === 0) return null;

  const maxAbsTotal = Math.max(...buckets.map((b) => Math.abs(b.totalPnL)), 1);

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">Performance attribution</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">
            Slice paper P&L across {closedPaper.length} closed trades to find what's working.
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {SLICES.map((s) => (
            <button
              key={s.id}
              onClick={() => setSlice(s.id)}
              className={`text-[10px] uppercase tracking-widest font-mono px-2 py-1 rounded border ${
                slice === s.id
                  ? 'bg-accent/20 border-accent/40 text-accent-light'
                  : 'bg-white/[0.03] border-white/10 text-gray-500 hover:text-white'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="card-body">
        {buckets.length === 0 ? (
          <div className="text-xs text-gray-500 italic">No data for this slice.</div>
        ) : (
          <div className="space-y-1">
            {buckets.map((b) => {
              const widthPct = (Math.abs(b.totalPnL) / maxAbsTotal) * 100;
              const isProfit = b.totalPnL >= 0;
              return (
                <div key={b.key} className="flex items-center gap-2 text-xs font-mono">
                  <span className="text-gray-300 w-24 truncate shrink-0" title={b.label}>
                    {b.label}
                  </span>
                  <span className="text-gray-500 w-12 shrink-0 text-right">{b.trades}t</span>
                  <span className="text-gray-400 w-12 shrink-0 text-right">
                    {b.winRate.toFixed(0)}%
                  </span>
                  <div className="flex-1 relative h-4 bg-white/[0.03] rounded">
                    <div
                      className={`absolute top-0 ${isProfit ? 'left-1/2' : 'right-1/2'} h-full rounded ${
                        isProfit ? 'bg-profit/40' : 'bg-loss/40'
                      }`}
                      style={{ width: `${widthPct / 2}%` }}
                    />
                    <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
                  </div>
                  <span
                    className={`w-20 shrink-0 text-right font-semibold ${
                      isProfit ? 'text-profit' : 'text-loss'
                    }`}
                  >
                    {formatCurrency(b.totalPnL)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
