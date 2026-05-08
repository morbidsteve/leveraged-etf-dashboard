'use client';

import { MutableRefObject, useEffect, useRef, useState } from 'react';
import type { IChartApi, Time } from 'lightweight-charts';

/**
 * Paints translucent bands behind the candles so pre-market and
 * after-hours sessions are visually distinct from regular hours.
 *
 *   pre  (4:00–9:30 ET)  → blue/violet tint
 *   open (9:30–16:00 ET) → no overlay (chart background)
 *   post (16:00–20:00 ET)→ amber tint
 *
 * Position is computed via chart.timeScale().timeToCoordinate(). We
 * subscribe to visible-range changes and re-render on every pan/zoom
 * so bands track the candles. Bands clip to the chart's visible width.
 */
interface SessionBandsProps {
  chartRef: MutableRefObject<IChartApi | null>;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  height: number;
  /** When false, render nothing (cheap opt-out). */
  enabled: boolean;
}

interface Band {
  left: number;
  width: number;
  type: 'pre' | 'post';
}

const ET_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

interface EtParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function toEt(d: Date): EtParts {
  const parts = ET_FMT.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour') === '24' ? '00' : get('hour')),
    minute: Number(get('minute')),
  };
}

/** Find the unix timestamp of {h, m} ET on the same day as `dayMs`. */
function etTimeOnSameDay(dayMs: number, h: number, m: number): number {
  // Take the day in ET, then build a Date that *renders* as that
  // ET h:m. We bisect because there's no clean toZoned API in stdlib.
  const target = toEt(new Date(dayMs));
  // Start a guess at UTC noon of that ET date — close enough that a
  // few iterations of correction land us within 1 minute.
  let guess = Date.UTC(target.year, target.month - 1, target.day, 12, 0, 0);
  for (let i = 0; i < 4; i++) {
    const et = toEt(new Date(guess));
    const haveMin = et.hour * 60 + et.minute;
    const wantMin = h * 60 + m;
    guess += (wantMin - haveMin) * 60_000;
  }
  return Math.floor(guess / 1000);
}

export default function SessionBands({
  chartRef,
  containerRef,
  height,
  enabled,
}: SessionBandsProps) {
  const [bands, setBands] = useState<Band[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setBands([]);
      return;
    }
    const chart = chartRef.current;
    const container = containerRef.current;
    if (!chart || !container) return;

    const compute = () => {
      const ts = chart.timeScale();
      const range = ts.getVisibleRange();
      if (!range) {
        setBands([]);
        return;
      }
      const fromSec = Number(range.from);
      const toSec = Number(range.to);
      if (!isFinite(fromSec) || !isFinite(toSec)) {
        setBands([]);
        return;
      }

      const out: Band[] = [];
      // Walk one ET-day at a time across the visible range.
      const fromMs = fromSec * 1000;
      const toMs = toSec * 1000;
      // 1 day in ms — overshoot one extra day on either end so partial
      // bands at the edges still render.
      for (let dayMs = fromMs - 86_400_000; dayMs <= toMs + 86_400_000; dayMs += 86_400_000) {
        const preStart = etTimeOnSameDay(dayMs, 4, 0);
        const preEnd = etTimeOnSameDay(dayMs, 9, 30);
        const postStart = etTimeOnSameDay(dayMs, 16, 0);
        const postEnd = etTimeOnSameDay(dayMs, 20, 0);

        for (const [type, start, end] of [
          ['pre', preStart, preEnd] as const,
          ['post', postStart, postEnd] as const,
        ]) {
          if (end < fromSec || start > toSec) continue;
          const xStart = ts.timeToCoordinate(start as Time);
          const xEnd = ts.timeToCoordinate(end as Time);
          if (xStart == null || xEnd == null) continue;
          const left = Math.max(0, Math.min(xStart, xEnd));
          const width = Math.abs(xEnd - xStart);
          if (width < 1) continue;
          out.push({ left, width, type });
        }
      }
      setBands(out);
    };

    const onChange = () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(compute);
    };

    compute();
    const ts = chart.timeScale();
    ts.subscribeVisibleTimeRangeChange(onChange);
    const ro = new ResizeObserver(onChange);
    ro.observe(container);
    return () => {
      ts.unsubscribeVisibleTimeRangeChange(onChange);
      ro.disconnect();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, chartRef, containerRef]);

  if (!enabled || bands.length === 0) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ height }}
      aria-hidden="true"
    >
      {bands.map((b, i) => (
        <div
          key={i}
          className="absolute top-0 bottom-0"
          style={{
            left: b.left,
            width: b.width,
            background:
              b.type === 'pre'
                ? 'rgba(124, 58, 237, 0.06)'
                : 'rgba(245, 158, 11, 0.06)',
            borderLeft:
              b.type === 'pre'
                ? '1px dashed rgba(124, 58, 237, 0.25)'
                : '1px dashed rgba(245, 158, 11, 0.25)',
            borderRight:
              b.type === 'pre'
                ? '1px dashed rgba(124, 58, 237, 0.25)'
                : '1px dashed rgba(245, 158, 11, 0.25)',
          }}
        />
      ))}
    </div>
  );
}
