'use client';

import { useEffect, useState } from 'react';
import { OptionContract } from '@/types/options';

/**
 * Polls /api/options/quote for a set of OCC contract symbols at the
 * given interval. Acts as a "streamer foundation" — when Schwab
 * Streamer integration lands later, this hook's external interface
 * stays the same (Record<symbol, OptionContract>) but the internal
 * fetch is replaced with a WebSocket subscription.
 *
 * Intentionally separate from the chain-fetcher so the price store,
 * GreeksDashboard, and PositionList can subscribe to per-contract
 * marks without each pulling whole chains.
 */
export function useOptionsQuotes(
  contractSymbols: string[],
  intervalMs = 30_000
): Record<string, OptionContract> {
  const [quotes, setQuotes] = useState<Record<string, OptionContract>>({});

  useEffect(() => {
    if (contractSymbols.length === 0) return;
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const r = await fetch(
          `/api/options/quote?symbols=${encodeURIComponent(contractSymbols.join(','))}`
        );
        const data = await r.json();
        if (cancelled) return;
        if (data.quotes) setQuotes(data.quotes);
      } catch {
        // ignore; next tick will retry
      }
    };
    fetchOnce();
    const i = setInterval(fetchOnce, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(i);
    };
  }, [contractSymbols.join(','), intervalMs]);

  return quotes;
}
