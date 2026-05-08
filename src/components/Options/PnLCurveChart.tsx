'use client';

import { useMemo } from 'react';
import { OptionPosition } from '@/types/options';
import { plCurve } from '@/lib/options/risk';

/**
 * SVG P&L-at-expiration curve for an options position. Plots P&L
 * across a ±20% range of the underlying's reference price. Red below
 * zero, green above, dashed line at zero.
 *
 * Pure consumer of the position object — does not fetch live data.
 */
export default function PnLCurveChart({
  position,
  underlyingPrice,
  width = 320,
  height = 100,
}: {
  position: OptionPosition;
  underlyingPrice: number;
  width?: number;
  height?: number;
}) {
  const curve = useMemo(
    () => plCurve(position, underlyingPrice, 0.20, 60),
    [position, underlyingPrice]
  );

  if (curve.length === 0) return null;

  const xs = curve.map((p) => p.price);
  const ys = curve.map((p) => p.pl);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const yPad = (yMax - yMin) * 0.1 || Math.abs(yMax) * 0.1 || 1;
  const plotMinY = yMin - yPad;
  const plotMaxY = yMax + yPad;

  const xMap = (x: number) => ((x - xMin) / (xMax - xMin)) * (width - 32) + 24;
  const yMap = (y: number) =>
    height - 12 - ((y - plotMinY) / (plotMaxY - plotMinY)) * (height - 24);

  // Build segments: separate green (profit) and red (loss) line segments
  const greenPath: string[] = [];
  const redPath: string[] = [];
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i];
    const b = curve[i + 1];
    const segPath = `M ${xMap(a.price)} ${yMap(a.pl)} L ${xMap(b.price)} ${yMap(b.pl)}`;
    if (a.pl >= 0 && b.pl >= 0) greenPath.push(segPath);
    else if (a.pl <= 0 && b.pl <= 0) redPath.push(segPath);
    else {
      // Crosses zero — split: find crossing point linearly
      const t = -a.pl / (b.pl - a.pl);
      const xCross = a.price + t * (b.price - a.price);
      if (a.pl >= 0) {
        greenPath.push(`M ${xMap(a.price)} ${yMap(a.pl)} L ${xMap(xCross)} ${yMap(0)}`);
        redPath.push(`M ${xMap(xCross)} ${yMap(0)} L ${xMap(b.price)} ${yMap(b.pl)}`);
      } else {
        redPath.push(`M ${xMap(a.price)} ${yMap(a.pl)} L ${xMap(xCross)} ${yMap(0)}`);
        greenPath.push(`M ${xMap(xCross)} ${yMap(0)} L ${xMap(b.price)} ${yMap(b.pl)}`);
      }
    }
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: height }}>
      {/* Zero line */}
      <line
        x1={0}
        x2={width}
        y1={yMap(0)}
        y2={yMap(0)}
        stroke="#4b5563"
        strokeDasharray="2 3"
        strokeWidth={0.6}
      />
      {/* Spot marker */}
      <line
        x1={xMap(underlyingPrice)}
        x2={xMap(underlyingPrice)}
        y1={12}
        y2={height - 12}
        stroke="#a78bfa"
        strokeOpacity={0.5}
        strokeDasharray="2 3"
        strokeWidth={0.6}
      />
      {greenPath.map((d, i) => (
        <path key={`g${i}`} d={d} stroke="#22c55e" strokeWidth={1.4} fill="none" />
      ))}
      {redPath.map((d, i) => (
        <path key={`r${i}`} d={d} stroke="#ef4444" strokeWidth={1.4} fill="none" />
      ))}
      {/* Breakevens */}
      {position.breakevens.map((b, i) => (
        <line
          key={`be${i}`}
          x1={xMap(b)}
          x2={xMap(b)}
          y1={yMap(0) - 3}
          y2={yMap(0) + 3}
          stroke="#fbbf24"
          strokeWidth={1.4}
        />
      ))}
      {/* Range labels */}
      <text x={2} y={11} fontSize={8} fill="#6b7280">
        ${plotMaxY >= 0 ? '+' : ''}
        {plotMaxY.toFixed(0)}
      </text>
      <text x={2} y={height - 14} fontSize={8} fill="#6b7280">
        ${plotMinY.toFixed(0)}
      </text>
      <text x={24} y={height - 1} fontSize={8} fill="#6b7280">
        ${xMin.toFixed(0)}
      </text>
      <text x={width - 24} y={height - 1} fontSize={8} fill="#6b7280" textAnchor="end">
        ${xMax.toFixed(0)}
      </text>
    </svg>
  );
}
