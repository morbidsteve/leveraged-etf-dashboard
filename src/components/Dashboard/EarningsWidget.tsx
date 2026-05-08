'use client';

import { useEffect, useState } from 'react';
import { differenceInCalendarDays, format } from 'date-fns';

interface EarningsItem {
  symbol: string;
  date: string;
  hour?: string;
  epsEstimate?: number;
  revenueEstimate?: number;
}

/**
 * Upcoming-earnings widget for the active watchlist tickers. Shows any
 * earnings within the next 14 days, color-coded by proximity (≤2d red,
 * ≤7d amber, ≤14d gray).
 *
 * Hidden entirely when nothing's coming up — no clutter on quiet weeks.
 */
export default function EarningsWidget({ tickers }: { tickers: string[] }) {
  const [items, setItems] = useState<EarningsItem[]>([]);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    if (tickers.length === 0) return;
    let cancelled = false;
    fetch(`/api/earnings?symbols=${tickers.join(',')}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setItems(data.items ?? []);
        setConfigured(data.configured ?? true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tickers.join(',')]);

  if (!configured && items.length === 0) {
    return null;
  }
  if (items.length === 0) return null;

  const now = new Date();

  return (
    <div className="space-y-1.5">
      <h4 className="text-[9px] uppercase tracking-widest text-gray-500">
        Upcoming earnings
      </h4>
      <div className="space-y-1">
        {items.map((e) => {
          const days = differenceInCalendarDays(new Date(e.date), now);
          const color =
            days <= 2 ? 'text-loss bg-loss/10 border-loss/30'
            : days <= 7 ? 'text-amber-300 bg-amber-500/10 border-amber-400/30'
            : 'text-gray-400 bg-white/[0.02] border-white/10';
          const hourLabel = e.hour === 'bmo' ? 'before open' : e.hour === 'amc' ? 'after close' : '';
          return (
            <div
              key={`${e.symbol}-${e.date}`}
              className={`flex items-center justify-between px-2 py-1.5 rounded border text-[11px] font-mono ${color}`}
            >
              <div className="flex items-center gap-2">
                <span className="font-bold">{e.symbol}</span>
                <span className="text-[10px]">
                  {format(new Date(e.date), 'MMM d')}
                  {hourLabel && ` · ${hourLabel}`}
                </span>
              </div>
              <div className="text-[10px]">
                {days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days}d`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
