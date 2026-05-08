'use client';

import { useEffect, useState } from 'react';

interface VixSnapshot {
  price: number | null;
  changePct: number | null;
  /** 1y rolling percentile rank, 0–100. Higher = more elevated than usual. */
  percentile: number | null;
  ts: number;
}

/**
 * VIX + per-ticker volatility regime card. The leveraged-ETF strategy
 * edge is sensitive to vol regime — RSI mean-reversion behaves
 * differently in VIX < 15 chop vs VIX > 25 panic. Surfacing the regime
 * keeps that context visible.
 *
 * Pulls ^VIX from /api/quote (Yahoo) plus its 1y daily history from
 * /api/candles to compute a rolling percentile rank.
 */
export default function VolatilityCard() {
  const [vix, setVix] = useState<VixSnapshot | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [quoteR, candleR] = await Promise.all([
          fetch('/api/quote?symbol=^VIX').then((r) => r.json()),
          fetch('/api/candles?symbol=^VIX&interval=1d&range=1y').then((r) => r.json()),
        ]);
        if (!alive) return;
        const last: number | null =
          quoteR?.price ?? quoteR?.regularMarketPrice ?? null;
        const changePct: number | null =
          quoteR?.changePercent ?? quoteR?.regularMarketChangePercent ?? null;
        const closes: number[] = (candleR?.candles ?? [])
          .map((c: { close?: number }) => c.close)
          .filter((v: unknown): v is number => typeof v === 'number');
        let percentile: number | null = null;
        if (last != null && closes.length > 30) {
          const below = closes.filter((c) => c < last).length;
          percentile = (below / closes.length) * 100;
        }
        setVix({ price: last, changePct, percentile, ts: Date.now() });
      } catch {
        // ignore — no VIX state will render
      }
    };
    load();
    const id = window.setInterval(load, 60_000); // refresh every minute
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  if (!vix || vix.price == null) return null;

  // Volatility regime label
  let regime: 'calm' | 'normal' | 'elevated' | 'panic';
  let regimeColor: string;
  let regimeNote: string;
  if (vix.price < 14) {
    regime = 'calm';
    regimeColor = 'text-profit';
    regimeNote =
      'Low vol — mean-reversion strategies tend to work; small wins, occasional whipsaw.';
  } else if (vix.price < 20) {
    regime = 'normal';
    regimeColor = 'text-amber-300';
    regimeNote = 'Normal range. Strategy edge should hold near historical baseline.';
  } else if (vix.price < 30) {
    regime = 'elevated';
    regimeColor = 'text-amber-400';
    regimeNote = 'Elevated vol — wider stops, faster moves. Consider half-Kelly sizing.';
  } else {
    regime = 'panic';
    regimeColor = 'text-loss';
    regimeNote =
      'Crisis-level vol. RSI thresholds get whippy; consider sitting out or paper-only.';
  }

  const pct = vix.percentile;
  const pctTone =
    pct == null
      ? 'text-gray-400'
      : pct >= 80
      ? 'text-loss'
      : pct >= 60
      ? 'text-amber-300'
      : pct >= 40
      ? 'text-amber-200'
      : 'text-profit';

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">Volatility regime</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">VIX · 1y rolling rank</p>
        </div>
        <span
          className={`text-[10px] uppercase tracking-widest font-mono px-2 py-1 rounded border ${
            regime === 'calm'
              ? 'bg-profit/10 border-profit/40 text-profit'
              : regime === 'normal'
              ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
              : regime === 'elevated'
              ? 'bg-amber-500/15 border-amber-500/50 text-amber-400'
              : 'bg-loss/10 border-loss/40 text-loss'
          }`}
        >
          {regime}
        </span>
      </div>
      <div className="card-body space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <Metric
            label="VIX"
            value={vix.price.toFixed(2)}
            tone={regimeColor}
          />
          {vix.changePct != null && (
            <Metric
              label="Day"
              value={`${vix.changePct >= 0 ? '+' : ''}${vix.changePct.toFixed(1)}%`}
              tone={vix.changePct < 0 ? 'text-profit' : 'text-loss'}
            />
          )}
          <Metric
            label="1y rank"
            value={pct == null ? '—' : `${pct.toFixed(0)}%`}
            tone={pctTone}
          />
        </div>
        <div className="text-[11px] text-gray-300 italic">{regimeNote}</div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-lg bg-white/[0.02] border border-white/5 p-2">
      <div className="text-[9px] uppercase tracking-widest text-gray-500">{label}</div>
      <div className={`text-sm font-mono font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
