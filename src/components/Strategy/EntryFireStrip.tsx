'use client';

import { useMemo, useState } from 'react';
import { ConditionTree } from '@/types/strategy';
import { RSIConfig } from '@/types';
import { replayCondition, ReplayBar } from '@/lib/strategy/replay';
import { usePriceStore } from '@/store';
import { format } from 'date-fns';

/**
 * Compact horizontal strip showing the last N bars of a ticker, with
 * markers above bars where the entry condition would have fired. Used
 * inside StrategyDetail to give immediate visual feedback on a strategy:
 * "where in the recent past would this rule have triggered?"
 *
 * Renders as inline SVG — no chart library. Each bar is a thin candlestick
 * (green up / red down) drawn relative to the visible window's price range.
 * Fires render as small green dots above the bar with a glow.
 */
export default function EntryFireStrip({
  condition,
  ticker,
  rsiConfig,
  bars: barLimit = 90,
  height = 56,
}: {
  condition: ConditionTree;
  ticker: string;
  rsiConfig?: RSIConfig;
  bars?: number;
  height?: number;
}) {
  const candlesByTicker = usePriceStore((s) => s.candles);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const replay = useMemo(() => {
    const candles = candlesByTicker[ticker] ?? [];
    return replayCondition({
      condition,
      candles,
      rsiConfig,
      ticker,
      lastN: barLimit,
    });
  }, [candlesByTicker, ticker, condition, rsiConfig, barLimit]);

  const bars = replay.bars;
  const fireCount = bars.filter((b) => b.fired).length;

  if (bars.length === 0) {
    return (
      <div
        className="w-full flex items-center justify-center text-[10px] text-gray-600 italic border border-dashed border-white/5 rounded"
        style={{ height }}
      >
        No price data for {ticker} yet
      </div>
    );
  }
  if (!replay.ready) {
    return (
      <div
        className="w-full flex items-center justify-center text-[10px] text-gray-600 italic border border-dashed border-white/5 rounded"
        style={{ height }}
      >
        Warming up indicators…
      </div>
    );
  }

  // Visible price range
  const lows = bars.map((b) => b.low);
  const highs = bars.map((b) => b.high);
  const minP = Math.min(...lows);
  const maxP = Math.max(...highs);
  const range = Math.max(0.0001, maxP - minP);

  // Layout: leave a top band (~25%) for fire markers; bars fill the rest
  const TOP_BAND = Math.round(height * 0.28);
  const BAR_AREA = height - TOP_BAND;
  const padTop = TOP_BAND;
  const barAreaHeight = BAR_AREA;

  const N = bars.length;
  // SVG width is responsive — we use a fixed viewBox so it scales.
  // Each bar gets viewBox width 10 (8 body + 2 gap).
  const SLOT = 10;
  const BODY = 6;
  const totalW = N * SLOT;

  const yAt = (price: number) => {
    const norm = (price - minP) / range;
    return padTop + (1 - norm) * barAreaHeight;
  };

  const hoverBar = hoverIdx !== null ? bars[hoverIdx] : null;

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <svg
          viewBox={`0 0 ${totalW} ${height}`}
          preserveAspectRatio="none"
          className="w-full block"
          style={{ height }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Bars */}
          {bars.map((b, i) => {
            const x = i * SLOT + (SLOT - BODY) / 2;
            const yHigh = yAt(b.high);
            const yLow = yAt(b.low);
            const yOpen = yAt(b.open);
            const yClose = yAt(b.close);
            const up = b.close >= b.open;
            const color = up ? '#22c55e' : '#ef4444'; // tailwind green-500 / red-500
            const bodyTop = Math.min(yOpen, yClose);
            const bodyH = Math.max(0.5, Math.abs(yClose - yOpen));
            const isHovered = hoverIdx === i;
            return (
              <g key={b.time}>
                {/* Hover hit area (full slot, transparent) */}
                <rect
                  x={i * SLOT}
                  y={0}
                  width={SLOT}
                  height={height}
                  fill="transparent"
                  onMouseEnter={() => setHoverIdx(i)}
                  style={{ cursor: 'crosshair' }}
                />
                {/* Wick */}
                <line
                  x1={x + BODY / 2}
                  x2={x + BODY / 2}
                  y1={yHigh}
                  y2={yLow}
                  stroke={color}
                  strokeWidth={1}
                  opacity={isHovered ? 1 : 0.7}
                />
                {/* Body */}
                <rect
                  x={x}
                  y={bodyTop}
                  width={BODY}
                  height={bodyH}
                  fill={color}
                  opacity={isHovered ? 1 : 0.75}
                />
                {/* Fire marker (above bar) */}
                {b.fired && (
                  <>
                    <circle
                      cx={x + BODY / 2}
                      cy={padTop * 0.55}
                      r={2.4}
                      fill="#22c55e"
                      style={{
                        filter: 'drop-shadow(0 0 4px rgba(34,197,94,0.85))',
                      }}
                    />
                    {/* Vertical guide line down to the bar */}
                    <line
                      x1={x + BODY / 2}
                      x2={x + BODY / 2}
                      y1={padTop * 0.55 + 2.4}
                      y2={yHigh}
                      stroke="#22c55e"
                      strokeOpacity={0.25}
                      strokeWidth={0.6}
                      strokeDasharray="1 1.5"
                    />
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex items-center justify-between text-[9px] uppercase tracking-widest text-gray-500">
        <span>
          Last {bars.length} bars · {fireCount} fire{fireCount === 1 ? '' : 's'}
        </span>
        {hoverBar ? (
          <span className="font-mono text-gray-400 normal-case tracking-normal">
            {format(new Date(hoverBar.time * 1000), 'HH:mm')} ·{' '}
            <span className={hoverBar.close >= hoverBar.open ? 'text-profit' : 'text-loss'}>
              ${hoverBar.close.toFixed(2)}
            </span>
            {hoverBar.rsi !== null && (
              <span className="text-gray-500 ml-2">RSI {hoverBar.rsi.toFixed(1)}</span>
            )}
            {hoverBar.fired && <span className="text-profit ml-2 font-bold">★ FIRED</span>}
          </span>
        ) : (
          <span className="font-mono text-gray-600 normal-case tracking-normal">
            hover for values
          </span>
        )}
      </div>
    </div>
  );
}
