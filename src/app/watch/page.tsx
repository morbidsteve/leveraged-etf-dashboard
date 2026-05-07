'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePriceData, useHydration, useStoreHydration, useAlertEngine } from '@/hooks';
import { useSettingsStore, usePriceStore } from '@/store';
import { DEFAULT_RSI_CONFIG, getRSIColor } from '@/lib/rsi';
import { formatPrice, formatPercent } from '@/lib/calculations';
import { NotificationPermissionBadge } from '@/components/Alerts';

/**
 * Mobile-first /watch view. Full-screen BUY/HOLD/SELL verdict with the
 * minimum chrome needed for active monitoring. Browser notifications +
 * vibration on signal change. PWA-installable so it adds to your home
 * screen.
 */
export default function WatchPage() {
  const hydrated = useHydration();
  const storeHydrated = useStoreHydration();
  const settings = useSettingsStore((s) => s.settings);
  const rsiConfig = storeHydrated ? settings.rsiConfig : DEFAULT_RSI_CONFIG;
  const watchlist = useMemo(
    () =>
      (storeHydrated && settings.watchlist?.length
        ? settings.watchlist
        : ['SOXL', 'TQQQ', 'SOXS', 'SQQQ', 'UPRO', 'TNA']),
    [storeHydrated, settings.watchlist]
  );
  const [selected, setSelected] = useState<string>(watchlist[0] ?? 'SOXL');

  // Make sure selected stays in watchlist
  useEffect(() => {
    if (!watchlist.includes(selected)) setSelected(watchlist[0] ?? 'SOXL');
  }, [watchlist, selected]);

  // Drive each watchlist ticker so notifications fire across the whole list
  // (caps at 6 — beyond that mobile rendering gets cluttered)
  const tickers = watchlist.slice(0, 6);
  // hooks must be called unconditionally
  const t1 = usePriceData({ ticker: tickers[0] ?? 'SOXL', interval: '1m', range: '1d', refreshInterval: 1000, enabled: hydrated && Boolean(tickers[0]), rsiConfig });
  const t2 = usePriceData({ ticker: tickers[1] ?? 'TQQQ', interval: '1m', range: '1d', refreshInterval: 1000, enabled: hydrated && Boolean(tickers[1]), rsiConfig });
  const t3 = usePriceData({ ticker: tickers[2] ?? 'SOXS', interval: '1m', range: '1d', refreshInterval: 1000, enabled: hydrated && Boolean(tickers[2]), rsiConfig });
  const t4 = usePriceData({ ticker: tickers[3] ?? 'SQQQ', interval: '1m', range: '1d', refreshInterval: 1000, enabled: hydrated && Boolean(tickers[3]), rsiConfig });
  const t5 = usePriceData({ ticker: tickers[4] ?? 'UPRO', interval: '1m', range: '1d', refreshInterval: 1000, enabled: hydrated && Boolean(tickers[4]), rsiConfig });
  const t6 = usePriceData({ ticker: tickers[5] ?? 'TNA', interval: '1m', range: '1d', refreshInterval: 1000, enabled: hydrated && Boolean(tickers[5]), rsiConfig });

  // Mount alert engine — fires notifications + sound on RSI threshold cross
  useAlertEngine();

  const prices = usePriceStore((s) => s.prices);
  const rsiData = usePriceStore((s) => s.rsiData);

  const live = prices[selected];
  const rsi = rsiData[selected];
  const status = rsi?.status ?? 'neutral';

  // Vibrate when status flips
  const prevStatus = useRef<string | null>(null);
  useEffect(() => {
    if (prevStatus.current !== null && prevStatus.current !== status) {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([120, 60, 120]);
        } catch {
          // safari etc.
        }
      }
    }
    if (rsi) prevStatus.current = status;
  }, [status, rsi]);

  if (!hydrated || !storeHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink text-gray-500 animate-pulse">
        Loading watch…
      </div>
    );
  }

  const bgClass =
    status === 'buy'
      ? 'bg-profit/15'
      : status === 'sell'
      ? 'bg-loss/15'
      : 'bg-ink';
  const verdictColor =
    status === 'buy' ? '#22c55e' : status === 'sell' ? '#ef4444' : '#eab308';

  const change = live?.changePercent ?? 0;
  const isUp = change >= 0;

  return (
    <div className={`min-h-screen ${bgClass} transition-colors duration-700 flex flex-col`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-ink/80 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="live-dot" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            Watch
          </span>
        </div>
        <div className="flex items-center gap-2">
          <NotificationPermissionBadge />
          <a
            href="/"
            className="text-[10px] uppercase tracking-widest text-gray-400 hover:text-white"
          >
            Full dashboard →
          </a>
        </div>
      </div>

      {/* Big verdict */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center space-y-4">
        <div className="text-sm font-semibold uppercase tracking-widest text-gray-400">
          {selected}
        </div>
        <div
          className="text-[22vw] sm:text-9xl font-black tracking-tighter leading-none"
          style={{ color: verdictColor }}
        >
          {status === 'buy' ? 'BUY' : status === 'sell' ? 'SELL' : 'HOLD'}
        </div>
        <div className="space-y-1">
          {live ? (
            <>
              <div className="text-4xl sm:text-5xl font-mono font-bold text-white">
                ${formatPrice(live.price)}
              </div>
              <div
                className={`text-lg font-mono font-semibold ${
                  isUp ? 'text-profit' : 'text-loss'
                }`}
              >
                {isUp ? '+' : ''}
                {formatPercent(change)}
              </div>
            </>
          ) : (
            <div className="text-2xl font-mono text-gray-500 animate-pulse">—</div>
          )}
        </div>
        {rsi && (
          <div className="mt-2 inline-flex items-center gap-3 text-base font-mono">
            <span className="text-gray-500 uppercase tracking-widest text-xs">
              RSI({rsiConfig.period})
            </span>
            <span
              className="font-bold text-2xl"
              style={{ color: getRSIColor(status) }}
            >
              {rsi.value.toFixed(1)}
            </span>
            <span className="text-xs text-gray-500">
              {rsiConfig.oversold} / {rsiConfig.overbought}
            </span>
          </div>
        )}
      </div>

      {/* Ticker chips */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar px-4 py-3 border-t border-white/5 bg-ink/80 backdrop-blur-md">
        {watchlist.map((t) => {
          const r = rsiData[t];
          const p = prices[t];
          const isSel = t === selected;
          const tStatus = r?.status ?? 'neutral';
          const tColor =
            tStatus === 'buy' ? '#22c55e' : tStatus === 'sell' ? '#ef4444' : '#9ba3b4';
          return (
            <button
              key={t}
              onClick={() => setSelected(t)}
              className={`shrink-0 min-w-[88px] rounded-lg border p-2 text-left transition ${
                isSel
                  ? 'border-accent/60 bg-accent/10'
                  : 'border-white/5 bg-white/[0.02]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">{t}</span>
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: tColor }}
                />
              </div>
              {p ? (
                <div className="text-[10px] font-mono text-gray-300">
                  ${formatPrice(p.price)}
                </div>
              ) : (
                <div className="text-[10px] text-gray-600">—</div>
              )}
              {r && (
                <div className="text-[10px] font-mono" style={{ color: tColor }}>
                  {r.value.toFixed(0)}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* hidden price hooks driven via the t1..t6 vars above (suppress unused warnings) */}
      <div className="hidden">{[t1, t2, t3, t4, t5, t6].map((_, i) => i).join('')}</div>
    </div>
  );
}
