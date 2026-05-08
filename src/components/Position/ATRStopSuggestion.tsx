'use client';

import { useMemo } from 'react';
import { calculateATR } from '@/lib/indicators';
import { usePriceStore } from '@/store';

/**
 * Recommended stop-loss price based on N-period ATR (default 14).
 * Common practice: stop = entry - (multiplier * ATR), with 1.5–2×
 * being typical for a swing trade and 1× for tight intraday scalps.
 *
 * Renders nothing when there's no candle data for the ticker (yet).
 */
export default function ATRStopSuggestion({
  ticker,
  entryPrice,
  side = 'long',
  multiplier = 1.5,
  period = 14,
  onApply,
}: {
  ticker: string;
  entryPrice: number;
  side?: 'long' | 'short';
  multiplier?: number;
  period?: number;
  onApply?: (price: number) => void;
}) {
  const candles = usePriceStore((s) => s.candles[ticker] ?? []);
  const liveBid = usePriceStore((s) => s.prices[ticker]?.price);

  const result = useMemo(() => {
    if (candles.length < period + 5) return null;
    const atrSeries = calculateATR(candles, period);
    if (atrSeries.length === 0) return null;
    const atr = atrSeries[atrSeries.length - 1].value;
    if (!isFinite(atr) || atr <= 0) return null;
    const offset = atr * multiplier;
    const stopPrice =
      side === 'long' ? entryPrice - offset : entryPrice + offset;
    const distancePct = entryPrice > 0 ? (offset / entryPrice) * 100 : 0;
    const fromCurrent = liveBid != null ? liveBid - stopPrice : null;
    const fromCurrentPct =
      liveBid != null && liveBid > 0 ? (fromCurrent! / liveBid) * 100 : null;
    return {
      atr,
      stopPrice: Number(stopPrice.toFixed(2)),
      distancePct,
      fromCurrent,
      fromCurrentPct,
    };
  }, [candles, entryPrice, side, multiplier, period, liveBid]);

  if (!result) return null;
  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-[11px]">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-widest text-amber-300">
            ATR stop suggestion
          </div>
          <div className="font-mono text-white">
            ${result.stopPrice.toFixed(2)}
            <span className="text-gray-500 ml-2">
              ({multiplier}× ATR{period} of ${result.atr.toFixed(2)})
            </span>
          </div>
          <div className="text-[10px] text-gray-400 font-mono mt-0.5">
            {result.distancePct.toFixed(2)}% below entry
            {result.fromCurrentPct != null && (
              <>
                {' '}· {result.fromCurrentPct >= 0 ? '+' : ''}
                {result.fromCurrentPct.toFixed(2)}% from current
              </>
            )}
          </div>
        </div>
        {onApply && (
          <button
            onClick={() => onApply(result.stopPrice)}
            className="text-[10px] uppercase tracking-widest font-mono px-2 py-1 rounded border bg-amber-500/15 border-amber-500/40 text-amber-200 hover:bg-amber-500/25 shrink-0"
          >
            Apply
          </button>
        )}
      </div>
    </div>
  );
}
