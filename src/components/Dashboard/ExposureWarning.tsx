'use client';

import { useMemo } from 'react';
import { useTradeStore, usePriceStore } from '@/store';
import { evaluateExposure } from '@/lib/correlations';

/**
 * Inline warning above the open positions area when stacked exposure is
 * detected. Hidden when there's nothing to flag.
 */
export default function ExposureWarning() {
  const trades = useTradeStore((s) => s.trades);
  const prices = usePriceStore((s) => s.prices);

  const summary = useMemo(() => {
    const open = trades
      .filter((t) => t.status === 'open')
      .map((t) => {
        const cp = prices[t.ticker]?.price || t.avgCost;
        return { ticker: t.ticker, notional: cp * t.totalShares };
      });
    return evaluateExposure(open);
  }, [trades, prices]);

  if (summary.warnings.length === 0) return null;

  return (
    <div className="space-y-1.5 mb-2">
      {summary.warnings.map((w, i) => {
        const cls =
          w.level === 'severe'
            ? 'border-loss/50 bg-loss/10 text-loss'
            : w.level === 'warn'
            ? 'border-neutral/40 bg-neutral/10 text-neutral'
            : 'border-white/10 bg-white/[0.04] text-gray-300';
        const icon = w.level === 'severe' ? '🚨' : w.level === 'warn' ? '⚠' : 'ⓘ';
        return (
          <div
            key={i}
            className={`text-[11px] leading-relaxed px-3 py-2 rounded-lg border ${cls}`}
          >
            <span className="font-bold mr-1.5">{icon}</span>
            {w.message}
          </div>
        );
      })}
    </div>
  );
}
