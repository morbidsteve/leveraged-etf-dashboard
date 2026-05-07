'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { PriceData, Candle, RSIData, RSIConfig } from '@/types';
import { getRSIData, DEFAULT_RSI_CONFIG } from '@/lib/rsi';
import { usePriceStore } from '@/store';
import { getPollIntervalMs } from '@/lib/marketHours';

interface UsePriceDataOptions {
  ticker: string;
  interval?: '1m' | '5m' | '15m' | '1h' | '1d';
  range?: '1d' | '5d' | '1mo' | '3mo';
  refreshInterval?: number;
  enabled?: boolean;
  rsiConfig?: RSIConfig;
  includePrePost?: boolean;
}

interface UsePriceDataReturn {
  priceData: PriceData | null;
  candles: Candle[];
  rsiData: RSIData | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function usePriceData({
  ticker,
  interval = '1m',
  range = '5d',
  refreshInterval = 1000, // 1 second default
  enabled = true,
  rsiConfig = DEFAULT_RSI_CONFIG,
  includePrePost = false,
}: UsePriceDataOptions): UsePriceDataReturn {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    prices,
    candles: storedCandles,
    rsiData,
    setPrice,
    setCandles,
    setRSIData,
  } = usePriceStore();

  const priceData = prices[ticker] || null;
  const candles = storedCandles[ticker] || [];
  const currentRSI = rsiData[ticker] || null;

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    try {
      setError(null);

      // Fetch quote and candles in parallel
      const [quoteRes, candlesRes] = await Promise.all([
        fetch(`/api/quote?symbol=${ticker}`),
        fetch(
          `/api/candles?symbol=${ticker}&interval=${interval}&range=${range}&includePrePost=${includePrePost}`
        ),
      ]);

      if (!quoteRes.ok) throw new Error('Failed to fetch quote');
      if (!candlesRes.ok) throw new Error('Failed to fetch candles');

      const quoteData = await quoteRes.json();
      const candlesData = await candlesRes.json();

      // Update store
      setPrice(ticker, {
        ...quoteData,
        timestamp: new Date(quoteData.timestamp),
      });

      if (candlesData.candles) {
        setCandles(ticker, candlesData.candles);

        // Calculate RSI with provided config
        const rsi = getRSIData(candlesData.candles, rsiConfig);
        setRSIData(ticker, rsi);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [ticker, interval, range, enabled, rsiConfig, includePrePost, setPrice, setCandles, setRSIData]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Smart polling: refreshInterval is the ceiling; we slow down outside
  // regular hours via getPollIntervalMs. Reschedules itself each tick so
  // session transitions take effect within one tick.
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!enabled || refreshInterval <= 0) return;

    let cancelled = false;
    const schedule = () => {
      if (cancelled) return;
      const sessionInterval = getPollIntervalMs();
      // honor the caller's max-frequency floor (refreshInterval is a "no
      // faster than this" hint); cap to session interval otherwise
      const next = Math.max(refreshInterval, sessionInterval);
      pollTimerRef.current = setTimeout(async () => {
        await fetchData();
        schedule();
      }, next);
    };

    schedule();
    return () => {
      cancelled = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [fetchData, refreshInterval, enabled]);

  return {
    priceData,
    candles,
    rsiData: currentRSI,
    isLoading,
    error,
    refresh: fetchData,
  };
}
