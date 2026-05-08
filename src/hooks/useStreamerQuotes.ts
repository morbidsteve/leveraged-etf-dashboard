'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createStreamerConnection,
  type StreamerConnection,
  type StreamerStatus,
  type QuoteUpdate,
} from '@/lib/schwab/streamer';

/**
 * Subscribe to real-time Schwab equity quotes for a list of symbols.
 *
 * Returns:
 *   status : streamer connection status
 *   quotes : map symbol -> latest QuoteUpdate (sticky; survives momentary
 *            field-only updates that don't include all fields)
 *
 * Falls back silently to status='error' or 'idle' when Schwab isn't
 * connected — caller can keep using its existing 1s polling.
 */
export function useStreamerQuotes(symbols: string[]): {
  status: StreamerStatus;
  quotes: Record<string, QuoteUpdate>;
} {
  const [status, setStatus] = useState<StreamerStatus>('idle');
  const [quotes, setQuotes] = useState<Record<string, QuoteUpdate>>({});
  const connRef = useRef<StreamerConnection | null>(null);
  const subscribedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let detach: (() => void) | null = null;

    (async () => {
      const conn = await createStreamerConnection();
      if (cancelled) {
        await conn.close();
        return;
      }
      connRef.current = conn;
      setStatus(conn.status);
      detach = conn.onQuote((q) => {
        if (!q.symbol) return;
        setQuotes((prev) => ({ ...prev, [q.symbol]: { ...prev[q.symbol], ...q } }));
      });
    })();

    return () => {
      cancelled = true;
      detach?.();
      connRef.current?.close();
      connRef.current = null;
      subscribedRef.current.clear();
    };
  }, []);

  // Maintain SUBS membership when symbol list changes
  useEffect(() => {
    const conn = connRef.current;
    if (!conn || conn.status !== 'authed') return;
    const want = new Set(symbols);
    const have = subscribedRef.current;
    const toAdd = symbols.filter((s) => !have.has(s));
    const toRemove = Array.from(have).filter((s) => !want.has(s));
    if (toAdd.length > 0) {
      conn.subscribe('LEVELONE_EQUITIES', toAdd);
      toAdd.forEach((s) => have.add(s));
    }
    if (toRemove.length > 0) {
      conn.unsubscribe('LEVELONE_EQUITIES', toRemove);
      toRemove.forEach((s) => have.delete(s));
    }
  }, [symbols, status]);

  return { status, quotes };
}
