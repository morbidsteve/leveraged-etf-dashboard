'use client';

import { useEffect, useMemo, useState } from 'react';
import { OptionChain, IVSummary } from '@/types/options';
import { computeIVSummary, describeTermStructure } from '@/lib/options/volatility';

/**
 * Volatility / IV summary panel for an underlying. Shows ATM IV (front
 * month), shape of term structure (contango/backwardation), and a small
 * SVG plot of the smile and term curve.
 *
 * Pure consumer of the chain data — no fetching of its own. Pass the
 * chain in once it's loaded.
 */
export default function VolPanel({ chain }: { chain: OptionChain | null }) {
  const [history, setHistory] = useState<number[]>([]);

  // Persist a rolling history of front-month ATM IV in localStorage so
  // we can compute IV percentile over time even without a paid feed.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!chain || !chain.configured || chain.expirations.length === 0) return;

    const summary = computeIVSummary(chain);
    if (summary.atmIv <= 0) return;

    const key = `etf-iv-history-${chain.underlying}`;
    let stored: { ts: number; iv: number }[] = [];
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) stored = JSON.parse(raw);
    } catch {
      // ignore
    }
    // Trim to one entry per UTC day, newest wins
    const today = new Date().toISOString().slice(0, 10);
    stored = stored.filter((e) => new Date(e.ts).toISOString().slice(0, 10) !== today);
    stored.push({ ts: Date.now(), iv: summary.atmIv });
    if (stored.length > 252) stored = stored.slice(-252);
    try {
      window.localStorage.setItem(key, JSON.stringify(stored));
    } catch {
      // ignore quota errors
    }
    setHistory(stored.map((e) => e.iv));
  }, [chain?.underlying, chain?.fetchedAt?.getTime?.()]);

  const summary = useMemo<IVSummary | null>(() => {
    if (!chain || !chain.configured || chain.expirations.length === 0) return null;
    return computeIVSummary(chain, history);
  }, [chain, history]);

  if (!chain || !chain.configured) return null;
  if (!summary || summary.atmIv === 0) {
    return (
      <div className="card card-body text-xs text-gray-500 italic">
        Building IV summary…
      </div>
    );
  }

  const shape = describeTermStructure(summary);

  return (
    <div className="card">
      <div className="card-header flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-white">Volatility · {summary.underlying}</h3>
        <div className="text-[10px] text-gray-500 font-mono">
          {history.length} day{history.length === 1 ? '' : 's'} of history
        </div>
      </div>
      <div className="card-body space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <Stat label="ATM IV (front)" value={`${(summary.atmIv * 100).toFixed(1)}%`} />
          <Stat
            label="IV percentile (252d)"
            value={
              summary.ivPercentile252 != null
                ? `${summary.ivPercentile252.toFixed(0)}%`
                : 'collecting…'
            }
            tone={
              summary.ivPercentile252 != null && summary.ivPercentile252 >= 70
                ? 'profit'
                : summary.ivPercentile252 != null && summary.ivPercentile252 <= 30
                ? 'loss'
                : undefined
            }
          />
          <Stat label="Term shape" value={shape} />
          <Stat label="Expirations" value={summary.termStructure.length.toString()} />
        </div>

        {/* Term-structure curve */}
        <div>
          <h4 className="text-[9px] uppercase tracking-widest text-gray-500 mb-1">
            Term structure
          </h4>
          <TermStructureChart summary={summary} />
        </div>

        {/* Smile */}
        <div>
          <h4 className="text-[9px] uppercase tracking-widest text-gray-500 mb-1">
            Smile (front month)
          </h4>
          <SmileChart summary={summary} />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'profit' | 'loss';
}) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/5 p-2">
      <div className="text-[9px] uppercase tracking-widest text-gray-500">{label}</div>
      <div
        className={`text-sm font-mono font-semibold mt-0.5 ${
          tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-white'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function TermStructureChart({ summary }: { summary: IVSummary }) {
  const W = 320;
  const H = 80;
  const pts = summary.termStructure;
  if (pts.length < 2) {
    return <div className="text-[10px] text-gray-600 italic">Need ≥2 expirations</div>;
  }
  const xMin = pts[0].daysToExpiry;
  const xMax = pts[pts.length - 1].daysToExpiry;
  const ys = pts.map((p) => p.atmIv);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const yRange = Math.max(0.001, yMax - yMin);
  const xMap = (d: number) => ((d - xMin) / (xMax - xMin)) * (W - 24) + 12;
  const yMap = (v: number) => H - 12 - ((v - yMin) / yRange) * (H - 24);

  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xMap(p.daysToExpiry)} ${yMap(p.atmIv)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: H }}>
      <path d={path} fill="none" stroke="#7c3aed" strokeWidth={1.5} />
      {pts.map((p) => (
        <circle
          key={p.expiration}
          cx={xMap(p.daysToExpiry)}
          cy={yMap(p.atmIv)}
          r={2}
          fill="#a78bfa"
        />
      ))}
      {/* X-axis labels */}
      <text x={12} y={H - 1} fontSize={8} fill="#6b7280">
        {pts[0].daysToExpiry}d
      </text>
      <text x={W - 24} y={H - 1} fontSize={8} fill="#6b7280" textAnchor="end">
        {pts[pts.length - 1].daysToExpiry}d
      </text>
      {/* Y-axis labels */}
      <text x={2} y={11} fontSize={8} fill="#6b7280">
        {(yMax * 100).toFixed(0)}%
      </text>
      <text x={2} y={H - 14} fontSize={8} fill="#6b7280">
        {(yMin * 100).toFixed(0)}%
      </text>
    </svg>
  );
}

function SmileChart({ summary }: { summary: IVSummary }) {
  const W = 320;
  const H = 80;
  if (summary.smile.length < 3) {
    return <div className="text-[10px] text-gray-600 italic">Not enough strikes for a smile</div>;
  }
  const xs = summary.smile.map((s) => s.strike);
  const ys = summary.smile.map((s) => s.iv);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const yRange = Math.max(0.001, yMax - yMin);
  const xMap = (s: number) => ((s - xMin) / Math.max(0.001, xMax - xMin)) * (W - 24) + 12;
  const yMap = (v: number) => H - 12 - ((v - yMin) / yRange) * (H - 24);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: H }}>
      {summary.smile.map((p, i) => {
        const next = summary.smile[i + 1];
        if (!next) return null;
        return (
          <line
            key={`l-${i}`}
            x1={xMap(p.strike)}
            y1={yMap(p.iv)}
            x2={xMap(next.strike)}
            y2={yMap(next.iv)}
            stroke="#7c3aed"
            strokeWidth={1.2}
          />
        );
      })}
      {summary.smile.map((p) => (
        <circle
          key={`p-${p.strike}-${p.type}`}
          cx={xMap(p.strike)}
          cy={yMap(p.iv)}
          r={2}
          fill={p.type === 'call' ? '#22c55e' : '#ef4444'}
        />
      ))}
      <text x={12} y={H - 1} fontSize={8} fill="#6b7280">
        ${xMin.toFixed(0)}
      </text>
      <text x={W - 24} y={H - 1} fontSize={8} fill="#6b7280" textAnchor="end">
        ${xMax.toFixed(0)}
      </text>
    </svg>
  );
}
