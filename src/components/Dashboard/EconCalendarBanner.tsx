'use client';

import { useEffect, useState } from 'react';

interface EconEvent {
  date: string;
  time: string;
  country: string;
  event: string;
  impact: string;
  forecast: number | string | null;
  previous: number | string | null;
  actual: number | string | null;
  unit: string | null;
}

/**
 * Banner that warns when a high-impact macro event (FOMC, CPI, NFP,
 * etc.) is within 24 hours. Leveraged ETFs gap on these — getting
 * blindsided is a reliable way to lose more than you intend.
 *
 * Silent when no event is imminent or no FINNHUB_API_KEY is configured.
 */
export default function EconCalendarBanner() {
  const [events, setEvents] = useState<EconEvent[]>([]);
  const [hidden, setHidden] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/economic-calendar?days=14')
      .then((r) => r.json())
      .then((d) => {
        if (alive) setEvents(d.events ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (events.length === 0 || hidden) return null;

  const now = Date.now();
  const within24h = events.filter((e) => {
    const t = parseEt(e.date, e.time);
    if (!t) return false;
    return t > now && t <= now + 24 * 3600_000;
  });
  const within7d = events.filter((e) => {
    const t = parseEt(e.date, e.time);
    if (!t) return false;
    return t > now && t <= now + 7 * 86400_000;
  });

  // Banner mode if there's an imminent event; expandable list otherwise
  if (within24h.length > 0) {
    return (
      <div className="card border-amber-500/40 bg-amber-500/10">
        <div className="card-body py-2.5 px-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-amber-400 text-lg shrink-0">⚠</span>
            <div className="min-w-0">
              <div className="text-xs font-bold text-amber-300 uppercase tracking-widest">
                Macro event within 24h
              </div>
              <div className="text-[12px] text-amber-200 truncate">
                {within24h.map((e) => `${e.event} (${e.time.slice(0, 5)} ET, ${describeWhen(e, now)})`).join(' · ')}
              </div>
            </div>
          </div>
          <button
            onClick={() => setHidden(true)}
            className="text-[10px] uppercase tracking-widest font-mono px-2 py-1 rounded border border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  if (within7d.length === 0) return null;

  return (
    <div className="card">
      <div className="card-body py-2 px-3">
        <button
          onClick={() => setShowAll((v) => !v)}
          className="w-full flex items-center justify-between gap-2"
        >
          <div className="text-[10px] uppercase tracking-widest text-gray-500">
            Upcoming macro ({within7d.length})
          </div>
          <div className="text-[11px] text-gray-400 truncate">
            Next: {within7d[0].event} · {describeWhen(within7d[0], now)}
          </div>
          <span className="text-gray-500 text-[10px]">{showAll ? '▴' : '▾'}</span>
        </button>
        {showAll && (
          <div className="mt-2 space-y-1">
            {within7d.map((e, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 text-[11px] font-mono"
              >
                <span className="text-gray-300 truncate">{e.event}</span>
                <span className="text-gray-500 shrink-0">
                  {e.date.slice(5)} {e.time.slice(0, 5)} ET
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Parse Finnhub's "YYYY-MM-DD HH:MM:SS" as US Eastern Time → ms epoch. */
function parseEt(date: string, time: string): number | null {
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number);
  const [hh = 0, mm = 0, ss = 0] = time.split(':').map(Number);
  if (!y) return null;
  // Finnhub timestamps are typically UTC. Treating them as ET introduces
  // a 4–5 hour error; instead trust the raw clock and let the consumer
  // describe in absolute terms.
  const utc = Date.UTC(y, (m || 1) - 1, d || 1, hh, mm, ss);
  return utc;
}

function describeWhen(e: EconEvent, now: number): string {
  const t = parseEt(e.date, e.time);
  if (!t) return e.date;
  const deltaMs = t - now;
  const hours = Math.round(deltaMs / 3600_000);
  if (hours < 1) return 'within the hour';
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(deltaMs / 86400_000);
  if (days <= 7) return `in ${days}d`;
  return e.date;
}
