'use client';

import { useEffect, useRef, useState } from 'react';
import { useStreamerQuotes } from '@/hooks';
import { usePriceStore } from '@/store';
import { format } from 'date-fns';

interface Print {
  ts: number;
  price: number;
  size: number;
  /** True if last price ticked up vs prior, false if down, null if equal. */
  upTick: boolean | null;
}

/**
 * Live "time and sales" tape for the selected ticker.
 *
 * When Schwab streamer is connected: uses the real-time quote stream.
 * Otherwise: derives synthetic prints from the price store's 1-second
 * polled deltas (cruder, but shows trade direction at the same
 * timescale the rest of the dashboard runs on).
 *
 * Aggressor side guess: a print at the ask is buyer-aggressive (green),
 * at the bid is seller-aggressive (red), in between is neutral.
 */
export default function TimeAndSales({
  ticker,
  maxRows = 60,
}: {
  ticker: string;
  maxRows?: number;
}) {
  const { status, quotes } = useStreamerQuotes([ticker]);
  const polledPrice = usePriceStore((s) => s.prices[ticker]);

  const [tape, setTape] = useState<Print[]>([]);
  const lastPriceRef = useRef<number | null>(null);
  const lastBidRef = useRef<number | null>(null);
  const lastAskRef = useRef<number | null>(null);

  // Stream-driven path: every quote update with a 'last' field becomes
  // a synthetic print. We treat each non-equal price change as a tick.
  useEffect(() => {
    if (status !== 'authed') return;
    const q = quotes[ticker];
    if (!q || q.last == null) return;
    if (q.bid != null) lastBidRef.current = q.bid;
    if (q.ask != null) lastAskRef.current = q.ask;
    const prev = lastPriceRef.current;
    if (prev != null && q.last === prev) return;
    const upTick = prev == null ? null : q.last > prev ? true : q.last < prev ? false : null;
    lastPriceRef.current = q.last;
    setTape((cur) =>
      [
        {
          ts: q.ts ?? Date.now(),
          price: q.last!,
          size: 0, // streamer L1 doesn't include trade size
          upTick,
        },
        ...cur,
      ].slice(0, maxRows)
    );
  }, [status, quotes, ticker, maxRows]);

  // Polling fallback: when streamer isn't authed, drive the tape from
  // the existing price store so the user still sees something useful.
  useEffect(() => {
    if (status === 'authed') return;
    if (!polledPrice) return;
    const prev = lastPriceRef.current;
    if (prev != null && polledPrice.price === prev) return;
    const upTick = prev == null ? null : polledPrice.price > prev ? true : polledPrice.price < prev ? false : null;
    lastPriceRef.current = polledPrice.price;
    setTape((cur) =>
      [
        {
          ts: typeof polledPrice.timestamp === 'number'
            ? polledPrice.timestamp
            : new Date(polledPrice.timestamp).getTime(),
          price: polledPrice.price,
          size: 0,
          upTick,
        },
        ...cur,
      ].slice(0, maxRows)
    );
  }, [status, polledPrice, ticker, maxRows]);

  // Reset when ticker changes
  useEffect(() => {
    setTape([]);
    lastPriceRef.current = null;
  }, [ticker]);

  const sourceLabel =
    status === 'authed' ? 'Schwab streamer' : 'Polled (1s)';

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">Time &amp; sales</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {ticker} · last {tape.length} ticks · {sourceLabel}
          </p>
        </div>
        <span
          className={`text-[10px] uppercase tracking-widest font-mono px-1.5 py-0.5 rounded border ${
            status === 'authed'
              ? 'bg-profit/15 border-profit/40 text-profit'
              : status === 'connecting'
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              : 'bg-gray-700/30 border-gray-600/30 text-gray-500'
          }`}
        >
          {status}
        </span>
      </div>
      <div className="card-body p-0">
        {tape.length === 0 ? (
          <div className="text-xs text-gray-500 italic p-3">
            Waiting for ticks…
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-[11px] font-mono">
              <thead className="sticky top-0 bg-ink/95 backdrop-blur-sm">
                <tr className="text-[9px] uppercase tracking-widest text-gray-500">
                  <th className="text-left px-2 py-1">Time</th>
                  <th className="text-right px-2 py-1">Price</th>
                  <th className="text-center px-2 py-1">Δ</th>
                </tr>
              </thead>
              <tbody>
                {tape.map((p, i) => {
                  const tone =
                    p.upTick === true
                      ? 'text-profit'
                      : p.upTick === false
                      ? 'text-loss'
                      : 'text-gray-300';
                  const arrow = p.upTick === true ? '▲' : p.upTick === false ? '▼' : '·';
                  return (
                    <tr key={i} className="border-t border-white/[0.03]">
                      <td className="text-gray-500 px-2 py-0.5">
                        {format(new Date(p.ts), 'HH:mm:ss')}
                      </td>
                      <td className={`text-right px-2 py-0.5 ${tone}`}>
                        ${p.price.toFixed(2)}
                      </td>
                      <td className={`text-center px-2 py-0.5 ${tone}`}>{arrow}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
