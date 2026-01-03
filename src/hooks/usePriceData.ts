'use client';

import { useState, useEffect, useCallback } from 'react';
import { PriceData, Candle, RSIData } from '@/types';
import { getRSIData, DEFAULT_RSI_CONFIG } from '@/lib/rsi';
import { usePriceStore } from '@/store';

interface UsePriceDataOptions {
  ticker: string;
  interval?: '1m' | '5m' | '15m' | '1h' | '1d';
  range?: '1d' | '5d' | '1mo' | '3mo';
  refreshInterval?: number;
  enabled?: boolean;
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
  refreshInterval = 5000,
  enabled = true,
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
        fetch(`/api/candles?symbol=${ticker}&interval=${interval}&range=${range}`),
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

        // Calculate RSI
        const rsi = getRSIData(candlesData.candles, DEFAULT_RSI_CONFIG);
        setRSIData(ticker, rsi);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [ticker, interval, range, enabled, setPrice, setCandles, setRSIData]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Set up polling
  useEffect(() => {
    if (!enabled || refreshInterval <= 0) return;

    const intervalId = setInterval(fetchData, refreshInterval);
    return () => clearInterval(intervalId);
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
