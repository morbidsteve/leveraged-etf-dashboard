'use client';

import { useEffect, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { formatCurrency } from '@/lib/calculations';

interface InsiderItem {
  name: string;
  position?: string;
  change: number;
  shares: number;
  direction: 'buy' | 'sell' | 'flat';
  price: number;
  value: number;
  date: string;
  code: string;
}

interface Summary {
  totalBuyShares: number;
  totalSellShares: number;
  totalBuyValue: number;
  totalSellValue: number;
  netShares: number;
  netValue: number;
  windowDays: number;
}

/**
 * Insider transactions card — shows recent Form 4 filings (corporate
 * insider buys/sells) for the active ticker. Pulls from /api/insider
 * which proxies Finnhub.
 *
 * Heuristic: heavy insider buying often signals confidence; heavy
 * insider selling is usually noise (liquidity / diversification) but
 * extreme outflows can signal trouble.
 */
export default function InsiderActivityCard({ ticker }: { ticker: string }) {
  const [items, setItems] = useState<InsiderItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/insider?symbol=${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setItems(data.items ?? []);
        setSummary(data.summary ?? null);
        setConfigured(data.configured ?? true);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (!configured) return null;
  if (loading && items.length === 0) {
    return <div className="text-[10px] text-gray-600 italic">Loading insider data…</div>;
  }
  if (items.length === 0) return null;

  const net = summary?.netValue ?? 0;
  const netSign = net > 0 ? 'profit' : net < 0 ? 'loss' : null;

  const visible = expanded ? items : items.slice(0, 5);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <h4 className="text-[9px] uppercase tracking-widest text-gray-500">
          Insider activity · {ticker} · 90d
        </h4>
        {items.length > 5 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-[10px] text-gray-500 hover:text-white"
          >
            {expanded ? 'Show less' : `Show all ${items.length}`}
          </button>
        )}
      </div>

      {summary && (
        <div className="grid grid-cols-3 gap-1.5 text-[10px]">
          <div className="rounded bg-white/[0.02] border border-white/5 p-1.5">
            <div className="text-gray-500">Buys</div>
            <div className="text-profit font-mono">
              {formatCurrency(summary.totalBuyValue)}
            </div>
          </div>
          <div className="rounded bg-white/[0.02] border border-white/5 p-1.5">
            <div className="text-gray-500">Sells</div>
            <div className="text-loss font-mono">
              {formatCurrency(summary.totalSellValue)}
            </div>
          </div>
          <div className="rounded bg-white/[0.02] border border-white/5 p-1.5">
            <div className="text-gray-500">Net</div>
            <div
              className={`font-mono ${
                netSign === 'profit' ? 'text-profit' : netSign === 'loss' ? 'text-loss' : 'text-white'
              }`}
            >
              {formatCurrency(net)}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {visible.map((tx, i) => (
          <div
            key={i}
            className={`rounded border px-2 py-1 text-[10px] font-mono ${
              tx.direction === 'buy'
                ? 'border-profit/30 bg-profit/5'
                : tx.direction === 'sell'
                ? 'border-loss/30 bg-loss/5'
                : 'border-white/10 bg-white/[0.02]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span
                  className={`font-bold uppercase ${
                    tx.direction === 'buy' ? 'text-profit' : 'text-loss'
                  }`}
                >
                  {tx.direction === 'buy' ? 'BOUGHT' : 'SOLD'}
                </span>
                <span className="text-white ml-1.5 truncate">{tx.name}</span>
                {tx.position && (
                  <span className="text-gray-500 ml-1">({tx.position})</span>
                )}
              </div>
              <span className="text-gray-400 shrink-0 text-[9px]">
                {formatDistanceToNow(new Date(tx.date), { addSuffix: true })}
              </span>
            </div>
            <div className="text-gray-400 mt-0.5">
              {tx.shares.toLocaleString()} shares @ ${tx.price.toFixed(2)} ={' '}
              <span className="text-white">{formatCurrency(tx.value)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
