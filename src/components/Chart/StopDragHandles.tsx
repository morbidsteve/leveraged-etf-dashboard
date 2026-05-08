'use client';

import { MutableRefObject, useEffect, useRef, useState } from 'react';
import type { ISeriesApi } from 'lightweight-charts';

/**
 * Renders draggable handles on top of the candlestick chart, one per
 * open stop-loss line. Each handle is a small chip pinned to the right
 * edge of the chart at the stop-line's price coordinate. Drag vertically
 * to move the stop; release to commit the new price via onCommit.
 *
 * Lives outside the chart canvas (regular DOM) so it can capture
 * pointer events directly without conflicting with the chart's own
 * crosshair drag.
 */
interface StopDragHandlesProps {
  stops: Array<{ ticker: string; price: number; tradeId: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  seriesRef: MutableRefObject<ISeriesApi<any> | null>;
  chartHeight: number;
  onCommit: (tradeId: string, newPrice: number) => void;
}

export default function StopDragHandles({
  stops,
  seriesRef,
  chartHeight,
  onCommit,
}: StopDragHandlesProps) {
  const [, force] = useState(0);
  // Local override price during drag, keyed by tradeId
  const [draftPrices, setDraftPrices] = useState<Record<string, number>>({});
  const dragStateRef = useRef<{
    tradeId: string;
    startY: number;
    startPrice: number;
  } | null>(null);

  // Re-render on mount + whenever the chart resizes / data updates so the
  // handle Y-positions stay aligned. We poll because lightweight-charts
  // doesn't fire a public "view changed" event we can hook here cheaply.
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const st = dragStateRef.current;
      if (!st || !seriesRef.current) return;
      const dy = e.clientY - st.startY;
      const startCoord = seriesRef.current.priceToCoordinate(st.startPrice);
      if (startCoord == null) return;
      const newCoord = startCoord + dy;
      const newPrice = seriesRef.current.coordinateToPrice(newCoord);
      if (newPrice == null || isNaN(newPrice as number)) return;
      setDraftPrices((d) => ({ ...d, [st.tradeId]: newPrice as number }));
    }
    function onUp() {
      const st = dragStateRef.current;
      if (st) {
        const final = draftPrices[st.tradeId];
        if (final != null && Math.abs(final - st.startPrice) > 0.01) {
          onCommit(st.tradeId, Number(final.toFixed(2)));
        }
        // clear the override; the parent will re-render with the new stopPrice
        setDraftPrices((d) => {
          const { [st.tradeId]: _omit, ...rest } = d;
          return rest;
        });
      }
      dragStateRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    if (dragStateRef.current) {
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      return () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
    }
  }, [draftPrices, onCommit, seriesRef]);

  return (
    <>
      {stops.map((stop) => {
        const drafted = draftPrices[stop.tradeId];
        const displayPrice = drafted ?? stop.price;
        const y = seriesRef.current?.priceToCoordinate(displayPrice);
        if (y == null) return null;
        return (
          <div
            key={stop.tradeId}
            className="absolute z-30 select-none cursor-ns-resize group"
            style={{
              top: Math.max(0, Math.min(chartHeight - 18, y - 9)),
              right: 60,
            }}
            onPointerDown={(e) => {
              e.preventDefault();
              dragStateRef.current = {
                tradeId: stop.tradeId,
                startY: e.clientY,
                startPrice: displayPrice,
              };
              force((n) => n + 1);
            }}
            title={`Drag to adjust ${stop.ticker} stop`}
          >
            <div
              className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border shadow-md ${
                drafted !== undefined
                  ? 'bg-loss/40 border-loss text-white'
                  : 'bg-loss/20 border-loss/60 text-red-200 group-hover:bg-loss/40'
              }`}
            >
              ⇕ ${displayPrice.toFixed(2)}
            </div>
          </div>
        );
      })}
    </>
  );
}
