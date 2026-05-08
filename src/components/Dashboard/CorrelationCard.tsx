'use client';

import { useMemo, useState } from 'react';
import { useTradeStore, usePriceStore } from '@/store';
import {
  correlationMatrix,
  computeConcentration,
} from '@/lib/correlation';
import { formatCurrency } from '@/lib/calculations';

/**
 * Portfolio correlation + concentration card. Pulls candle history from
 * the price store (already populated for watchlist tickers + open
 * positions) and computes a risk score.
 *
 * Hidden when there are <2 open positions — single-position portfolios
 * have nothing to correlate against.
 */
export default function CorrelationCard() {
  const trades = useTradeStore((s) => s.trades);
  const prices = usePriceStore((s) => s.prices);
  const candles = usePriceStore((s) => s.candles);
  const [showMatrix, setShowMatrix] = useState(false);

  const openPositions = useMemo(
    () => trades.filter((t) => t.status === 'open'),
    [trades]
  );

  const { matrix, tickers, pairs, conc } = useMemo(() => {
    const tickersWithCandles: Record<string, typeof candles[string]> = {};
    for (const p of openPositions) {
      const c = candles[p.ticker];
      if (c && c.length >= 30) tickersWithCandles[p.ticker] = c;
    }
    const cm = correlationMatrix(tickersWithCandles);
    const dollarPositions = openPositions
      .map((t) => ({
        ticker: t.ticker,
        dollar: (prices[t.ticker]?.price ?? t.avgCost) * t.totalShares,
      }))
      .filter((p) => cm.tickers.includes(p.ticker));
    const c = computeConcentration(dollarPositions, cm.pairs);
    return { ...cm, conc: c };
  }, [openPositions, candles, prices]);

  if (openPositions.length < 2 || tickers.length < 2) return null;

  const totalDollars = openPositions.reduce(
    (s, t) => s + (prices[t.ticker]?.price ?? t.avgCost) * t.totalShares,
    0
  );

  const riskTone =
    conc.riskLabel === 'low'
      ? 'text-profit border-profit/30 bg-profit/10'
      : conc.riskLabel === 'moderate'
      ? 'text-amber-300 border-amber-500/30 bg-amber-500/10'
      : conc.riskLabel === 'high'
      ? 'text-amber-400 border-amber-500/40 bg-amber-500/15'
      : 'text-loss border-loss/40 bg-loss/15';

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">Portfolio risk</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">
            Correlation + concentration across {openPositions.length} open positions
          </p>
        </div>
        <span
          className={`text-[10px] uppercase tracking-widest font-mono px-2 py-1 rounded border ${riskTone}`}
        >
          {conc.riskLabel}
        </span>
      </div>
      <div className="card-body space-y-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <Metric
            label="Effective N"
            value={conc.effectiveN.toFixed(2)}
            hint={`From HHI ${conc.hhi.toFixed(2)}`}
          />
          <Metric
            label="Largest"
            value={`${(conc.largestShare * 100).toFixed(0)}%`}
            hint="Of portfolio $"
          />
          <Metric
            label="Avg corr"
            value={conc.avgCorr.toFixed(2)}
            hint="Weighted |ρ|"
          />
          <Metric
            label="Total"
            value={formatCurrency(totalDollars)}
            hint="Open exposure"
          />
        </div>

        {conc.topCorr && (
          <div className="text-[11px] text-gray-300 p-2 rounded bg-white/[0.02] border border-white/5">
            Most correlated pair:{' '}
            <span className="font-mono text-white">
              {conc.topCorr.a} ↔ {conc.topCorr.b}
            </span>{' '}
            ={' '}
            <span
              className={`font-mono font-bold ${
                Math.abs(conc.topCorr.corr) > 0.8
                  ? 'text-loss'
                  : Math.abs(conc.topCorr.corr) > 0.5
                  ? 'text-amber-300'
                  : 'text-profit'
              }`}
            >
              {conc.topCorr.corr.toFixed(2)}
            </span>
          </div>
        )}

        <div className="text-[11px] text-gray-400 italic">{conc.riskNote}</div>

        <button
          onClick={() => setShowMatrix((v) => !v)}
          className="text-[10px] uppercase tracking-widest font-mono px-2 py-1 rounded border bg-white/[0.03] border-white/10 text-gray-400 hover:text-white"
        >
          {showMatrix ? 'Hide matrix' : 'Show matrix'}
        </button>

        {showMatrix && tickers.length >= 2 && (
          <div className="overflow-x-auto">
            <table className="text-[10px] font-mono mt-2">
              <thead>
                <tr>
                  <th className="text-left text-gray-500 px-1.5 py-1"></th>
                  {tickers.map((t) => (
                    <th key={t} className="text-center text-gray-400 px-1.5 py-1">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tickers.map((row, i) => (
                  <tr key={row}>
                    <td className="text-gray-400 px-1.5 py-1 font-bold">{row}</td>
                    {tickers.map((col, j) => {
                      const v = matrix[i][j];
                      const intensity = Math.abs(v);
                      const positive = v >= 0;
                      const bg = positive
                        ? `rgba(34, 197, 94, ${intensity * 0.4})`
                        : `rgba(239, 68, 68, ${intensity * 0.4})`;
                      return (
                        <td
                          key={col}
                          className="text-center px-1.5 py-1"
                          style={{ background: i === j ? 'rgba(255,255,255,0.04)' : bg }}
                          title={`${row} ↔ ${col}: ${v.toFixed(3)}`}
                        >
                          {v.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-[10px] text-gray-600">
          ρ from log-returns over the loaded candle history. Drop in dollars
          on a perfectly-correlated portfolio = drop in your largest single
          position, regardless of how many tickers you hold.
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg bg-white/[0.02] border border-white/5 p-2">
      <div className="text-[9px] uppercase tracking-widest text-gray-500">{label}</div>
      <div className="text-sm font-mono font-semibold text-white">{value}</div>
      {hint && <div className="text-[9px] text-gray-600">{hint}</div>}
    </div>
  );
}
