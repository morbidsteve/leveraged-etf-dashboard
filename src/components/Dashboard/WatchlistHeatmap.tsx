'use client';

import { useMemo } from 'react';
import { usePriceStore, useSettingsStore } from '@/store';
import { useStoreHydration } from '@/hooks/useHydration';

/**
 * Tile-grid heatmap of the active watchlist. Each cell:
 *   - size proportional to volume (or square for now — volume-weighted
 *     treemap layout is its own scope)
 *   - color from intraday % change (red→green)
 *   - text shows ticker + % change + RSI status pill
 *
 * Click a cell to switch the dashboard's selected ticker. Replaces a
 * "scan watchlist" mental task with a single-glance scan.
 */
export default function WatchlistHeatmap({
  onSelectTicker,
}: {
  onSelectTicker?: (t: string) => void;
}) {
  const hydrated = useStoreHydration();
  const settings = useSettingsStore((s) => s.settings);
  const prices = usePriceStore((s) => s.prices);
  const rsiData = usePriceStore((s) => s.rsiData);

  const tickers = useMemo(() => {
    if (!hydrated) return [];
    const wl = settings.watchlist ?? [];
    return wl.length > 0 ? wl : ['SOXL', 'TQQQ', 'SOXS', 'SQQQ', 'UPRO', 'TNA'];
  }, [hydrated, settings.watchlist]);

  if (tickers.length === 0) return null;

  // Find max abs % change for color scaling
  const maxAbs = tickers.reduce((m, t) => {
    const c = prices[t]?.changePercent;
    if (c == null) return m;
    return Math.max(m, Math.abs(c));
  }, 0.5);

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="text-sm font-semibold text-white">Watchlist heatmap</h3>
        <p className="text-[10px] text-gray-500 mt-0.5">
          Color from intraday % change. Click to focus.
        </p>
      </div>
      <div className="card-body">
        <div
          className="grid gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${Math.min(
              tickers.length,
              4
            )}, minmax(0, 1fr))`,
          }}
        >
          {tickers.map((t) => {
            const p = prices[t];
            const r = rsiData[t];
            const change = p?.changePercent ?? 0;
            const intensity = Math.min(1, Math.abs(change) / Math.max(0.5, maxAbs));
            const isUp = change >= 0;
            const bg = isUp
              ? `rgba(34, 197, 94, ${0.08 + intensity * 0.4})`
              : `rgba(239, 68, 68, ${0.08 + intensity * 0.4})`;
            const border = isUp
              ? `rgba(34, 197, 94, ${0.3 + intensity * 0.5})`
              : `rgba(239, 68, 68, ${0.3 + intensity * 0.5})`;
            const status = r?.status ?? 'neutral';

            return (
              <button
                key={t}
                onClick={() => onSelectTicker?.(t)}
                className="rounded-lg border p-2 text-left active:scale-[0.97] transition-transform min-h-[78px] flex flex-col justify-between"
                style={{ background: bg, borderColor: border }}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-bold text-white">{t}</span>
                  {status !== 'neutral' && (
                    <span
                      className={`text-[9px] uppercase tracking-widest font-mono px-1 py-0.5 rounded ${
                        status === 'buy'
                          ? 'bg-profit/30 text-white'
                          : 'bg-loss/30 text-white'
                      }`}
                    >
                      {status}
                    </span>
                  )}
                </div>
                {p ? (
                  <>
                    <div className="font-mono text-xs text-white">
                      ${p.price.toFixed(2)}
                    </div>
                    <div
                      className={`text-[11px] font-mono font-bold ${
                        isUp ? 'text-white' : 'text-white'
                      }`}
                    >
                      {isUp ? '+' : ''}
                      {change.toFixed(2)}%
                    </div>
                  </>
                ) : (
                  <div className="text-[10px] text-gray-400 animate-pulse">…</div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
