'use client';

import { useMemo } from 'react';
import { ConditionTree } from '@/types/strategy';
import { evaluate, describeCondition } from '@/lib/strategy/conditions';
import { usePriceStore, useSettingsStore } from '@/store';
import { calculateRSIWithTimestamps } from '@/lib/rsi';
import { calculateEMA, calculateSMA } from '@/lib/indicators';
import type { DataContext } from '@/types/strategy';

/**
 * Live "evaluates to TRUE/FALSE" badge for a condition tree, evaluated
 * against the most recent data for the given ticker. Renders next to
 * conditions in the strategy detail view so the user can see at a glance
 * whether the rule would currently fire.
 *
 * For 'cross' conditions, "TRUE" means "would have just fired on the most
 * recent bar." For continuous comparisons, it just means "evaluates true now."
 */
export default function ConditionLiveBadge({
  condition,
  ticker,
  inPosition = false,
  entryPrice,
}: {
  condition: ConditionTree;
  ticker: string;
  inPosition?: boolean;
  entryPrice?: number;
}) {
  const candlesByTicker = usePriceStore((s) => s.candles);
  const pricesByTicker = usePriceStore((s) => s.prices);
  const globalRsiConfig = useSettingsStore((s) => s.settings.rsiConfig);

  const result = useMemo(() => {
    const candles = candlesByTicker[ticker] ?? [];
    const live = pricesByTicker[ticker];
    if (!live || candles.length === 0) {
      return { state: 'no-data' as const };
    }

    const rsiSeries = calculateRSIWithTimestamps(candles, globalRsiConfig.period);
    const lastRsi = rsiSeries.length > 0 ? rsiSeries[rsiSeries.length - 1].value : Number.NaN;
    const prevRsi =
      rsiSeries.length > 1 ? rsiSeries[rsiSeries.length - 2].value : Number.NaN;
    const ema20 = calculateEMA(candles, 20);
    const ema50 = calculateEMA(candles, 50);
    const sma20 = calculateSMA(candles, 20);

    const ctx: DataContext = {
      ticker,
      price: live.price,
      rsi: { [globalRsiConfig.period]: lastRsi },
      ema: {
        20: ema20.length ? ema20[ema20.length - 1].value : Number.NaN,
        50: ema50.length ? ema50[ema50.length - 1].value : Number.NaN,
      },
      sma: { 20: sma20.length ? sma20[sma20.length - 1].value : Number.NaN },
      vwap: null,
      volume: live.volume,
      timestamp:
        live.timestamp instanceof Date
          ? live.timestamp
          : new Date(live.timestamp),
      ...(inPosition && entryPrice ? { entryPrice, entryAt: new Date() } : {}),
    };
    const prevCtx: DataContext | null =
      candles.length > 1
        ? {
            ...ctx,
            price: candles[candles.length - 2].close,
            rsi: { [globalRsiConfig.period]: prevRsi },
            timestamp: new Date(candles[candles.length - 2].time * 1000),
          }
        : null;

    try {
      return { state: evaluate(condition, ctx, prevCtx) ? 'true' : 'false' } as const;
    } catch {
      return { state: 'error' as const };
    }
  }, [condition, ticker, candlesByTicker, pricesByTicker, globalRsiConfig, inPosition, entryPrice]);

  const baseDescription = describeCondition(condition);

  if (result.state === 'no-data') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] text-gray-500" title={baseDescription}>
        <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />
        No data
      </span>
    );
  }
  if (result.state === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] text-loss" title={baseDescription}>
        <span className="w-1.5 h-1.5 rounded-full bg-loss" />
        Error
      </span>
    );
  }
  const isTrue = result.state === 'true';
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-mono font-semibold uppercase tracking-widest ${
        isTrue ? 'text-profit' : 'text-gray-500'
      }`}
      title={`${baseDescription} → ${isTrue ? 'TRUE — would fire now' : 'FALSE — not firing'}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          isTrue ? 'bg-profit shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-600'
        }`}
      />
      {isTrue ? 'Firing now' : 'Not firing'}
    </span>
  );
}
