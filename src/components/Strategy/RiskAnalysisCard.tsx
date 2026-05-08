'use client';

import { useMemo } from 'react';
import { Strategy } from '@/types/strategy';
import { usePaperStore } from '@/store';
import { drawdownStats, monteCarloBootstrap } from '@/lib/strategy/drawdown';
import { formatCurrency } from '@/lib/calculations';

/**
 * Drawdown stats + Monte Carlo bootstrap card. Shows the realized
 * worst case from the strategy's actual paper history, plus a
 * forward-looking 500-sim bootstrap of where the equity curve might
 * land if the next N trades came from the same distribution as the
 * past N. Honest about uncertainty.
 */
export default function RiskAnalysisCard({ strategy }: { strategy: Strategy }) {
  const closed = usePaperStore((s) => s.closed);
  const stratTrades = useMemo(
    () =>
      closed
        .filter((t) => t.strategyId === strategy.id)
        .sort(
          (a, b) => new Date(a.exitAt).getTime() - new Date(b.exitAt).getTime()
        ),
    [closed, strategy.id]
  );

  const dd = useMemo(
    () => drawdownStats(stratTrades.map((t) => t.realizedPnL)),
    [stratTrades]
  );

  const mc = useMemo(() => {
    if (stratTrades.length < 10) return null;
    return monteCarloBootstrap(
      stratTrades.map((t) => t.realizedPnL),
      { simulations: 500, horizon: stratTrades.length }
    );
  }, [stratTrades]);

  if (stratTrades.length < 5) {
    return (
      <div className="card">
        <div className="card-header">
          <h3 className="text-sm font-semibold text-white">Risk analysis</h3>
        </div>
        <div className="card-body text-xs text-gray-500">
          Need ≥5 closed trades for drawdown stats; ≥10 for Monte Carlo
          ({stratTrades.length} so far).
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="text-sm font-semibold text-white">Risk analysis</h3>
        <p className="text-[11px] text-gray-500 mt-1">
          Realized drawdown + 500-simulation Monte Carlo bootstrap of next{' '}
          {stratTrades.length} trades.
        </p>
      </div>
      <div className="card-body space-y-3 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
            Realized drawdown
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat
              label="Max DD"
              value={formatCurrency(-dd.maxDrawdown)}
              tone="loss"
            />
            <Stat
              label="Max DD %"
              value={`${dd.maxDrawdownPct.toFixed(1)}%`}
              tone="loss"
            />
            <Stat
              label="Ulcer idx"
              value={dd.ulcerIndex.toFixed(2)}
              hint="RMS of DD % — sustained pain"
            />
            <Stat
              label="Longest DD"
              value={`${dd.longestDrawdownTrades}t`}
              hint={dd.recovered ? 'recovered' : 'still in DD'}
              tone={dd.recovered ? 'neutral' : 'loss'}
            />
          </div>
        </div>

        {mc && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
              Monte Carlo · final equity at horizon
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="P10 (bad)" value={formatCurrency(mc.finalP10)} tone="loss" />
              <Stat label="P50 (typical)" value={formatCurrency(mc.finalP50)} />
              <Stat label="P90 (good)" value={formatCurrency(mc.finalP90)} tone="profit" />
              <Stat
                label="P(20%+ DD)"
                value={`${(mc.probLargeDD * 100).toFixed(0)}%`}
                tone={mc.probLargeDD > 0.3 ? 'loss' : 'neutral'}
              />
            </div>
            {mc.envelope.length > 5 && (
              <MonteCarloChart envelope={mc.envelope} />
            )}
          </div>
        )}

        <div className="text-[10px] text-gray-600 italic">
          Bootstrap resamples your realized trades with replacement —
          assumes the next N trades come from the same distribution as
          past N. Doesn&apos;t account for regime change.
        </div>
      </div>
    </div>
  );
}

function MonteCarloChart({
  envelope,
}: {
  envelope: Array<{ step: number; p10: number; p50: number; p90: number }>;
}) {
  if (envelope.length === 0) return null;
  const w = 480;
  const h = 90;
  const xs = envelope.map((p) => p.step);
  const ys = envelope.flatMap((p) => [p.p10, p.p50, p.p90]);
  const xMin = xs[0];
  const xMax = xs[xs.length - 1];
  const yMin = Math.min(0, ...ys);
  const yMax = Math.max(0, ...ys);
  const xScale = (x: number) =>
    xMax === xMin ? 0 : ((x - xMin) / (xMax - xMin)) * w;
  const yScale = (y: number) =>
    yMax === yMin ? h / 2 : h - ((y - yMin) / (yMax - yMin)) * h;
  const zeroY = yScale(0);

  const upperPath = envelope
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.step)} ${yScale(p.p90)}`)
    .join(' ');
  const lowerPath = envelope
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.step)} ${yScale(p.p10)}`)
    .join(' ');
  const medianPath = envelope
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.step)} ${yScale(p.p50)}`)
    .join(' ');
  const fillPath =
    upperPath +
    ' ' +
    envelope
      .slice()
      .reverse()
      .map((p) => `L ${xScale(p.step)} ${yScale(p.p10)}`)
      .join(' ') +
    ' Z';

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-20 mt-2">
      <line x1="0" x2={w} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
      <path d={fillPath} fill="rgba(167, 139, 250, 0.18)" />
      <path d={upperPath} fill="none" stroke="rgba(34, 197, 94, 0.6)" strokeWidth="1.5" />
      <path d={lowerPath} fill="none" stroke="rgba(239, 68, 68, 0.6)" strokeWidth="1.5" />
      <path d={medianPath} fill="none" stroke="#a78bfa" strokeWidth="2" />
    </svg>
  );
}

function Stat({
  label,
  value,
  tone = 'neutral',
  hint,
}: {
  label: string;
  value: string;
  tone?: 'profit' | 'loss' | 'neutral';
  hint?: string;
}) {
  const cls =
    tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-white';
  return (
    <div className="rounded-lg bg-white/[0.02] border border-white/5 p-2">
      <div className="text-[9px] uppercase tracking-widest text-gray-500">{label}</div>
      <div className={`text-sm font-mono font-semibold ${cls}`}>{value}</div>
      {hint && <div className="text-[9px] text-gray-600 truncate">{hint}</div>}
    </div>
  );
}
