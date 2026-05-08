'use client';

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

interface NewsItem {
  id: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
  datetime: number;
}

/**
 * Compact per-ticker news headlines strip. Fetches from /api/news?symbol=...
 * which proxies Finnhub. Degrades gracefully when FINNHUB_API_KEY is absent
 * (renders a small "Configure FINNHUB_API_KEY to enable news" hint instead
 * of an error).
 *
 * Caches at the API level (5 min revalidate). No client polling — refetches
 * only when ticker changes.
 */
export default function NewsStrip({ ticker }: { ticker: string }) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/news?symbol=${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setItems(data.items ?? []);
        setConfigured(data.configured ?? true);
        if (data.error) setError(data.error);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (!configured) {
    return (
      <div className="text-[10px] text-gray-600 italic">
        Set <code className="text-gray-500">FINNHUB_API_KEY</code> in .env to enable news
      </div>
    );
  }

  if (loading && items.length === 0) {
    return <div className="text-[10px] text-gray-600 italic">Loading news…</div>;
  }

  if (items.length === 0) {
    return <div className="text-[10px] text-gray-600 italic">No recent news for {ticker}</div>;
  }

  const visible = expanded ? items : items.slice(0, 3);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <h4 className="text-[9px] uppercase tracking-widest text-gray-500">
          News · {ticker}
        </h4>
        {items.length > 3 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-[10px] text-gray-500 hover:text-white"
          >
            {expanded ? 'Show less' : `Show all ${items.length}`}
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        {visible.map((n) => (
          <a
            key={n.id}
            href={n.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-2 rounded border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10 transition group"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-xs text-white group-hover:text-accent-light leading-snug">
                  {n.headline}
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-2">
                  <span className="font-medium">{n.source}</span>
                  <span>·</span>
                  <span>{formatDistanceToNow(new Date(n.datetime * 1000), { addSuffix: true })}</span>
                </div>
              </div>
              <svg
                className="w-3 h-3 text-gray-600 group-hover:text-accent-light shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </div>
          </a>
        ))}
      </div>
      {error && <div className="text-[10px] text-loss">⚠ {error}</div>}
    </div>
  );
}
