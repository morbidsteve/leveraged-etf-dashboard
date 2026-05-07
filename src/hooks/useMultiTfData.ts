'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Candle, RSIConfig } from '@/types';
import { Timeframe, TimeframeIndicators } from '@/types/strategy';
import { calculateRSIWithTimestamps } from '@/lib/rsi';
import { calculateEMA, calculateSMA, calculateVWAP } from '@/lib/indicators';

/**
 * Multi-timeframe candle fetcher + indicator computer for the strategy
 * engine. Given a list of (ticker, tf) requirements, maintains per-key
 * candle caches with timeframe-appropriate refresh cadences and exposes
 * the most recent indicators per key.
 *
 * Designed for cheap usage from useStrategyEngine — refreshes are slower
 * than the main 1s loop because higher-tf bars don't change every second.
 */

export interface TfRequirement {
  ticker: string;
  tf: Timeframe;
}

const TF_REFRESH_MS: Record<Timeframe, number> = {
  '1m': 5_000,
  '5m': 15_000,
  '15m': 30_000,
  '1h': 120_000,
  '1d': 300_000,
};

// Yahoo range that gives plenty of bars for RSI(250) at each interval
const TF_RANGE: Record<Timeframe, string> = {
  '1m': '5d',     // ~1950 bars
  '5m': '1mo',    // ~1700 bars
  '15m': '3mo',   // ~1700 bars (clamped to 60d realistically)
  '1h': '1y',     // ~1750 bars
  '1d': '5y',     // ~1250 bars
};

export type MultiTfMap = Record<string, Partial<Record<Timeframe, TimeframeIndicators>>>;

export function useMultiTfData(
  requirements: TfRequirement[],
  rsiConfig: RSIConfig
): MultiTfMap {
  const cacheRef = useRef<Map<string, TimeframeIndicators>>(new Map());
  const [, force] = useState(0);

  // Stable signature so we don't tear down timers when requirements is the same set
  const signature = useMemo(
    () =>
      requirements
        .map((r) => `${r.ticker}:${r.tf}`)
        .sort()
        .join(','),
    [requirements]
  );

  useEffect(() => {
    if (requirements.length === 0) return;

    const timers: ReturnType<typeof setInterval>[] = [];
    const aborts: AbortController[] = [];

    for (const req of requirements) {
      const key = `${req.ticker}:${req.tf}`;

      const fetchOnce = async () => {
        const ac = new AbortController();
        aborts.push(ac);
        try {
          const url = `/api/candles?symbol=${encodeURIComponent(req.ticker)}&interval=${req.tf}&range=${TF_RANGE[req.tf]}`;
          const r = await fetch(url, { signal: ac.signal, cache: 'no-store' });
          if (!r.ok) return;
          const data = await r.json();
          const candles: Candle[] = data.candles ?? [];
          if (candles.length === 0) return;

          const last = candles[candles.length - 1];
          const rsiSeries = calculateRSIWithTimestamps(candles, rsiConfig.period);
          const lastRsi =
            rsiSeries.length > 0 ? rsiSeries[rsiSeries.length - 1].value : Number.NaN;
          const ema20 = calculateEMA(candles, 20);
          const ema50 = calculateEMA(candles, 50);
          const sma20 = calculateSMA(candles, 20);
          const vwap = calculateVWAP(candles);

          cacheRef.current.set(key, {
            price: last.close,
            rsi: { [rsiConfig.period]: lastRsi },
            ema: {
              20: ema20.length ? ema20[ema20.length - 1].value : Number.NaN,
              50: ema50.length ? ema50[ema50.length - 1].value : Number.NaN,
            },
            sma: {
              20: sma20.length ? sma20[sma20.length - 1].value : Number.NaN,
            },
            vwap: vwap.length ? vwap[vwap.length - 1].value : null,
            volume: last.volume ?? 0,
          });
          force((n) => n + 1);
        } catch {
          // silent — retry on next interval
        }
      };

      // Initial fetch
      fetchOnce();
      // Periodic refresh at TF-appropriate cadence
      const t = setInterval(fetchOnce, TF_REFRESH_MS[req.tf]);
      timers.push(t);
    }

    return () => {
      timers.forEach((t) => clearInterval(t));
      aborts.forEach((a) => {
        try {
          a.abort();
        } catch {
          // best effort
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, rsiConfig.period]);

  // Build return shape
  const out: MultiTfMap = {};
  cacheRef.current.forEach((indicators, key) => {
    const [ticker, tf] = key.split(':');
    if (!out[ticker]) out[ticker] = {};
    out[ticker][tf as Timeframe] = indicators;
  });
  return out;
}
