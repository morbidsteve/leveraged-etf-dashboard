'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePriceData, useStoreHydration } from '@/hooks';
import { useSettingsStore } from '@/store';
import { DEFAULT_RSI_CONFIG, getRSIColor } from '@/lib/rsi';
import { formatPrice, formatPercent } from '@/lib/calculations';

const CandlestickChart = dynamic(() => import('@/components/Chart/CandlestickChart'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-gray-500 text-xs">
      Loading…
    </div>
  ),
});

const PRESETS: { label: string; tickers: string[] }[] = [
  { label: 'SOXL / SOXS', tickers: ['SOXL', 'SOXS'] },
  { label: 'TQQQ / SQQQ', tickers: ['TQQQ', 'SQQQ'] },
  { label: 'UPRO / SPXU', tickers: ['UPRO', 'SPXU'] },
  { label: 'TNA / TZA', tickers: ['TNA', 'TZA'] },
  { label: 'Major leveraged longs', tickers: ['SOXL', 'TQQQ', 'UPRO', 'TNA'] },
  { label: 'Major leveraged inverses', tickers: ['SOXS', 'SQQQ', 'SPXU', 'TZA'] },
];

/**
 * Multi-chart compare view. Up to 4 tickers in a 2x2 grid.
 *
 * The leveraged-ETF-pair plays (SOXL/SOXS, TQQQ/SQQQ) live or die on
 * inverse confirmation: when the long flashes a buy signal, you want
 * to see the inverse confirm with a clean sell. This is the surface
 * for spotting that.
 */
export default function ComparePage() {
  const hydrated = useStoreHydration();
  const settings = useSettingsStore((s) => s.settings);
  const rsiConfig = hydrated ? settings.rsiConfig : DEFAULT_RSI_CONFIG;
  const [tickers, setTickers] = useState<string[]>(['SOXL', 'SOXS']);
  const [interval, setIntervalState] = useState<'1m' | '5m' | '15m' | '1h' | '1d'>('1m');
  const [range, setRange] = useState<'1d' | '5d' | '1mo'>('1d');

  // Pad to 4 slots, padded slots are inert
  const slots = [...tickers, ...new Array(4 - tickers.length).fill('')].slice(0, 4);

  return (
    <div className="min-h-screen p-3 md:p-6 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">Multi-chart compare</h1>
          <p className="text-xs text-gray-500 mt-1">
            Up to 4 tickers side-by-side. Inverse-pair confirmation patterns are gold.
          </p>
        </div>
        <Link
          href="/"
          className="text-[10px] uppercase tracking-widest font-mono px-2 py-1 rounded border bg-white/[0.03] border-white/10 text-gray-400 hover:text-white"
        >
          ← Dashboard
        </Link>
      </div>

      <div className="card">
        <div className="card-body space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-widest text-gray-500">Presets:</span>
            {PRESETS.map((p) => {
              const active =
                p.tickers.length === tickers.length &&
                p.tickers.every((t, i) => t === tickers[i]);
              return (
                <button
                  key={p.label}
                  onClick={() => setTickers(p.tickers)}
                  className={`text-[10px] uppercase tracking-widest font-mono px-2 py-1 rounded border ${
                    active
                      ? 'bg-accent/20 border-accent/40 text-accent-light'
                      : 'bg-white/[0.03] border-white/10 text-gray-400 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {[0, 1, 2, 3].map((i) => (
              <input
                key={i}
                value={tickers[i] ?? ''}
                onChange={(e) => {
                  const next = [...tickers];
                  if (e.target.value) {
                    next[i] = e.target.value.toUpperCase();
                    setTickers(next.filter(Boolean).slice(0, 4));
                  } else {
                    next.splice(i, 1);
                    setTickers(next);
                  }
                }}
                placeholder={`Slot ${i + 1}`}
                className="input text-xs py-1.5 w-24 font-mono"
              />
            ))}
            <span className="w-px h-5 bg-white/10" />
            <select
              value={interval}
              onChange={(e) => setIntervalState(e.target.value as typeof interval)}
              className="input text-xs py-1.5"
            >
              <option value="1m">1m</option>
              <option value="5m">5m</option>
              <option value="15m">15m</option>
              <option value="1h">1h</option>
              <option value="1d">1d</option>
            </select>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as typeof range)}
              className="input text-xs py-1.5"
            >
              <option value="1d">1 day</option>
              <option value="5d">5 days</option>
              <option value="1mo">1 month</option>
            </select>
          </div>
        </div>
      </div>

      <div
        className={`grid gap-3 ${
          tickers.length === 1
            ? 'grid-cols-1'
            : tickers.length === 2
            ? 'grid-cols-1 md:grid-cols-2'
            : 'grid-cols-1 md:grid-cols-2'
        }`}
      >
        {slots.map((t, i) =>
          t ? (
            <ComparePane
              key={`${t}-${i}`}
              ticker={t}
              interval={interval}
              range={range}
              rsiConfig={rsiConfig}
              hydrated={hydrated}
            />
          ) : null
        )}
      </div>
    </div>
  );
}

function ComparePane({
  ticker,
  interval,
  range,
  rsiConfig,
  hydrated,
}: {
  ticker: string;
  interval: '1m' | '5m' | '15m' | '1h' | '1d';
  range: '1d' | '5d' | '1mo';
  rsiConfig: typeof DEFAULT_RSI_CONFIG;
  hydrated: boolean;
}) {
  const { priceData, candles, rsiData, isLoading } = usePriceData({
    ticker,
    interval,
    range,
    refreshInterval: 5000,
    enabled: hydrated,
    rsiConfig,
  });

  const status = rsiData?.status ?? 'neutral';
  const verdictColor =
    status === 'buy' ? '#22c55e' : status === 'sell' ? '#ef4444' : '#9ba3b4';

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base font-bold text-white">{ticker}</span>
          {priceData ? (
            <>
              <span className="font-mono text-sm text-white">${formatPrice(priceData.price)}</span>
              <span
                className={`text-[11px] font-mono ${
                  priceData.change >= 0 ? 'text-profit' : 'text-loss'
                }`}
              >
                {priceData.change >= 0 ? '+' : ''}
                {formatPercent(priceData.changePercent)}
              </span>
            </>
          ) : (
            <span className="text-xs text-gray-500 animate-pulse">…</span>
          )}
        </div>
        {rsiData && (
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded border"
            style={{
              color: getRSIColor(status),
              borderColor: `${verdictColor}55`,
              backgroundColor: `${verdictColor}15`,
            }}
          >
            RSI {rsiData.value.toFixed(1)}
          </span>
        )}
      </div>
      <div className="card-body" style={{ height: 360 }}>
        {candles.length > 30 ? (
          <CandlestickChart
            candles={candles}
            rsiConfig={rsiConfig}
            showRSI={true}
            showVolume={false}
            showTradeMarkers={false}
            showRSICrossings={true}
            height={340}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-gray-500">
            {isLoading ? 'Loading…' : 'Not enough data yet.'}
          </div>
        )}
      </div>
    </div>
  );
}
