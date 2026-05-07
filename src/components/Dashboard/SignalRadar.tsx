'use client';

import { useMemo } from 'react';
import { Candle, PriceData, RSIData } from '@/types';
import { getRSIColor } from '@/lib/rsi';
import { formatPrice } from '@/lib/calculations';

interface RadarItem {
  ticker: string;
  priceData: PriceData | null;
  rsiData: RSIData | null;
  candles: Candle[];
  isLoading: boolean;
}

interface Props {
  items: RadarItem[];
  selectedTicker: string;
  onSelect: (ticker: string) => void;
  oversold: number;
  overbought: number;
}

/**
 * Multi-ticker signal radar — full-width strip showing live BUY/HOLD/SELL
 * state per ticker with a tiny sparkline and the RSI value. Tickers in BUY
 * or SELL state float to the top so firing signals catch your eye fast.
 */
export default function SignalRadar({
  items,
  selectedTicker,
  onSelect,
  oversold,
  overbought,
}: Props) {
  const ranked = useMemo(() => {
    return [...items].sort((a, b) => {
      // Firing signals first
      const aPri = signalPriority(a.rsiData?.status);
      const bPri = signalPriority(b.rsiData?.status);
      if (aPri !== bPri) return aPri - bPri;
      // Within the same status, sort by distance to nearest threshold
      const aDist = thresholdDistance(a.rsiData?.value, oversold, overbought);
      const bDist = thresholdDistance(b.rsiData?.value, oversold, overbought);
      return aDist - bDist;
    });
  }, [items, oversold, overbought]);

  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar">
      {ranked.map((item) => (
        <RadarTile
          key={item.ticker}
          item={item}
          isSelected={item.ticker === selectedTicker}
          onSelect={() => onSelect(item.ticker)}
          oversold={oversold}
          overbought={overbought}
        />
      ))}
    </div>
  );
}

function RadarTile({
  item,
  isSelected,
  onSelect,
  oversold,
  overbought,
}: {
  item: RadarItem;
  isSelected: boolean;
  onSelect: () => void;
  oversold: number;
  overbought: number;
}) {
  const status = item.rsiData?.status ?? 'neutral';
  const isBuy = status === 'buy';
  const isSell = status === 'sell';
  const rsiColor = getRSIColor(status);
  const change = item.priceData?.changePercent ?? 0;
  const isUp = change >= 0;

  const borderCls = isSelected
    ? 'border-accent/60 bg-accent/10'
    : isBuy
    ? 'border-profit/50 bg-profit/8'
    : isSell
    ? 'border-loss/50 bg-loss/8'
    : 'border-white/5 bg-white/[0.02] hover:border-white/15';

  const ringCls = isBuy
    ? 'ring-2 ring-profit/30'
    : isSell
    ? 'ring-2 ring-loss/30'
    : '';

  return (
    <button
      onClick={onSelect}
      className={`shrink-0 w-[160px] rounded-xl border ${borderCls} ${ringCls} transition-all p-3 text-left`}
    >
      {/* Header: ticker + status pill */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-bold text-white text-sm tracking-tight">
          {item.ticker}
        </span>
        <span
          className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
          style={{
            color: rsiColor,
            backgroundColor: `${rsiColor}1f`,
            border: `1px solid ${rsiColor}55`,
          }}
        >
          {status === 'buy' ? 'BUY' : status === 'sell' ? 'SELL' : 'HOLD'}
        </span>
      </div>

      {/* Price + change */}
      {item.priceData && !item.isLoading ? (
        <div className="flex items-baseline justify-between text-xs mb-2">
          <span className="font-mono font-semibold text-white">
            ${formatPrice(item.priceData.price)}
          </span>
          <span
            className={`font-mono font-semibold ${
              isUp ? 'text-profit' : 'text-loss'
            }`}
          >
            {isUp ? '+' : ''}
            {change.toFixed(2)}%
          </span>
        </div>
      ) : (
        <div className="h-4 bg-white/5 rounded animate-pulse mb-2" />
      )}

      {/* Sparkline */}
      <Sparkline candles={item.candles} status={status} />

      {/* RSI line */}
      {item.rsiData ? (
        <div className="flex items-center justify-between text-[10px] mt-1.5">
          <span className="text-gray-500 uppercase tracking-widest">
            RSI {item.rsiData.value.toFixed(1)}
          </span>
          <RSIBar
            value={item.rsiData.value}
            oversold={oversold}
            overbought={overbought}
          />
        </div>
      ) : (
        <div className="text-[10px] text-gray-600 mt-1.5">RSI computing…</div>
      )}
    </button>
  );
}

function Sparkline({ candles, status }: { candles: Candle[]; status: 'buy' | 'sell' | 'neutral' }) {
  const slice = useMemo(() => candles.slice(-60), [candles]);
  if (slice.length < 2) return <div className="h-6 bg-white/[0.02] rounded" />;

  const prices = slice.map((c) => c.close);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const w = 140;
  const h = 24;
  const pts = prices
    .map((p, i) => `${(i / (prices.length - 1)) * w},${h - ((p - min) / range) * h}`)
    .join(' ');
  const stroke =
    status === 'buy' ? '#22c55e' : status === 'sell' ? '#ef4444' : '#9ba3b4';
  const last = prices[prices.length - 1];
  const first = prices[0];
  const fillGradient = last >= first ? '#22c55e1f' : '#ef44441f';
  const fillStroke = last >= first ? '#22c55e' : '#ef4444';

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-6">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
      <polyline
        points={`0,${h} ${pts} ${w},${h}`}
        fill={fillGradient}
        stroke="none"
      />
      <circle
        cx={w}
        cy={h - ((last - min) / range) * h}
        r="1.8"
        fill={fillStroke}
      />
    </svg>
  );
}

function RSIBar({
  value,
  oversold,
  overbought,
}: {
  value: number;
  oversold: number;
  overbought: number;
}) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="relative w-12 h-1 rounded bg-white/10 overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 bg-profit/30"
        style={{ width: `${oversold}%` }}
      />
      <div
        className="absolute inset-y-0 bg-loss/30"
        style={{ left: `${overbought}%`, right: 0 }}
      />
      <div
        className="absolute top-0 h-full w-0.5 bg-white"
        style={{ left: `calc(${pct}% - 1px)` }}
      />
    </div>
  );
}

function signalPriority(status: 'buy' | 'sell' | 'neutral' | undefined): number {
  if (status === 'buy') return 0;
  if (status === 'sell') return 1;
  return 2;
}

function thresholdDistance(
  rsi: number | undefined,
  oversold: number,
  overbought: number
): number {
  if (rsi === undefined || !Number.isFinite(rsi)) return Infinity;
  // Distance to whichever band is closer
  return Math.min(Math.abs(rsi - oversold), Math.abs(rsi - overbought));
}
