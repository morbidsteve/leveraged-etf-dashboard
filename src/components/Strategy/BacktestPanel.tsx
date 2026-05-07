'use client';

import { useState, useMemo } from 'react';
import { useStrategyStore } from '@/store';
import { BacktestResult, BacktestTrade } from '@/lib/strategy/backtest';
import { describeCondition } from '@/lib/strategy/conditions';
import { formatCurrency, formatPercent, formatPrice } from '@/lib/calculations';
import { format } from 'date-fns';

interface IntervalRangeOption {
  interval: string;
  range: string;
  label: string;
  hint?: string;
  warn?: string;
}

const PRESETS: IntervalRangeOption[] = [
  {
    interval: '1m',
    range: '5d',
    label: '1m × 5 days',
    hint: 'Closest to your live setup. Yahoo limits 1m bars to last 7 days.',
  },
  {
    interval: '5m',
    range: '1mo',
    label: '5m × 1 month',
    hint: 'Reasonable balance — ~6 weeks of intraday signals.',
  },
  {
    interval: '5m',
    range: '3mo',
    label: '5m × 3 months',
    hint: '60-day Yahoo cap on 5m may truncate; expect ~60 days of bars.',
  },
  {
    interval: '15m',
    range: '3mo',
    label: '15m × 3 months',
    hint: 'Less granular but full 60-day window.',
  },
  {
    interval: '1h',
    range: '1y',
    label: '1h × 1 year',
    hint: 'Coarse, but captures full-year regime changes.',
    warn: 'RSI(250) on 1h ≈ 250 hours = ~36 trading days. Different from your 1m setup.',
  },
  {
    interval: '1d',
    range: '5y',
    label: '1d × 5 years',
    hint: 'Long-horizon view. RSI(250) on daily ≈ 1 year — very different signal.',
  },
];

export default function BacktestPanel() {
  const strategies = useStrategyStore((s) => s.strategies);
  const [selectedId, setSelectedId] = useState<string | null>(
    strategies[0]?.id ?? null
  );
  const [presetIdx, setPresetIdx] = useState(1);
  const [tickerOverride, setTickerOverride] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => strategies.find((s) => s.id === selectedId) ?? null,
    [strategies, selectedId]
  );
  const preset = PRESETS[presetIdx];

  const handleRun = async () => {
    if (!selected) return;
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: selected,
          ticker: tickerOverride.trim().toUpperCase() || selected.ticker,
          interval: preset.interval,
          range: preset.range,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      const data: BacktestResult = await res.json();
      // Convert ISO date strings back to Dates for display
      data.trades.forEach((t) => {
        t.entryAt = new Date(t.entryAt);
        t.exitAt = new Date(t.exitAt);
      });
      if (data.startDate) data.startDate = new Date(data.startDate);
      if (data.endDate) data.endDate = new Date(data.endDate);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  if (strategies.length === 0) {
    return (
      <div className="card card-body text-center py-12 text-gray-500">
        <p className="mb-2">No strategies yet</p>
        <p className="text-xs">Create a strategy in the Strategies panel first, then come back to backtest it.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        Run any strategy against historical price data and see exactly what it would have done.
        Same evaluator, same conditions, just driven by candles instead of live ticks.
      </p>

      <div className="card">
        <div className="card-body grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="label">Strategy</label>
            <select
              value={selectedId ?? ''}
              onChange={(e) => setSelectedId(e.target.value)}
              className="input w-full text-sm"
            >
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {selected && (
              <div className="mt-2 text-[10px] text-gray-500 space-y-0.5">
                <div>
                  <span className="text-gray-600">Entry:</span> {describeCondition(selected.entry.when)}
                </div>
                <div>
                  <span className="text-gray-600">Exit:</span> {describeCondition(selected.exit.when)}
                </div>
                {selected.stopLoss?.pct !== undefined && (
                  <div>
                    <span className="text-gray-600">Stop:</span> -{selected.stopLoss.pct}% from entry
                  </div>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="label">Ticker (override)</label>
            <input
              type="text"
              value={tickerOverride}
              onChange={(e) => setTickerOverride(e.target.value.toUpperCase())}
              placeholder={selected?.ticker || 'SOXL'}
              className="input w-full font-mono uppercase text-sm"
            />
            <div className="mt-2 text-[10px] text-gray-500">
              Leave empty to use strategy's default ({selected?.ticker}).
            </div>
          </div>
          <div>
            <label className="label">Interval × Range</label>
            <select
              value={presetIdx}
              onChange={(e) => setPresetIdx(Number(e.target.value))}
              className="input w-full text-sm"
            >
              {PRESETS.map((p, i) => (
                <option key={i} value={i}>
                  {p.label}
                </option>
              ))}
            </select>
            <div className="mt-2 text-[10px] text-gray-500">{preset.hint}</div>
            {preset.warn && (
              <div className="mt-1 text-[10px] text-neutral">⚠ {preset.warn}</div>
            )}
          </div>
        </div>
        <div className="card-header flex items-center justify-end gap-2 border-t border-white/5">
          <button
            onClick={handleRun}
            disabled={running || !selected}
            className="btn btn-primary text-sm"
          >
            {running ? 'Running...' : 'Run Backtest'}
          </button>
        </div>
      </div>

      {error && (
        <div className="card border-loss/50">
          <div className="card-body text-loss text-sm">{error}</div>
        </div>
      )}

      {result && <BacktestResultView result={result} />}
    </div>
  );
}

function BacktestResultView({ result }: { result: BacktestResult }) {
  const { metrics, trades, equityCurve, warnings, ticker, interval, range, startDate, endDate } = result;
  const positiveTotal = metrics.totalPnL >= 0;
  const beatBuyHold = metrics.totalReturnPct > metrics.buyHoldReturnPct;

  return (
    <div className="space-y-4">
      {/* Header summary */}
      <div className="card">
        <div className="card-header flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-widest">
              Backtest result
            </div>
            <div className="text-base font-semibold text-white">
              {result.strategyName} · {ticker} · {interval} × {range}
            </div>
            {startDate && endDate && (
              <div className="text-[10px] text-gray-500 mt-0.5">
                {format(startDate, 'MMM dd, yyyy')} → {format(endDate, 'MMM dd, yyyy')} · {equityCurve.length} bars
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-[10px] text-gray-500 uppercase tracking-widest">
              Total P&L
            </div>
            <div
              className={`font-mono font-bold text-2xl ${
                positiveTotal ? 'text-profit' : 'text-loss'
              }`}
            >
              {positiveTotal ? '+' : ''}
              {formatCurrency(metrics.totalPnL)}
            </div>
            <div
              className={`text-xs font-mono ${
                positiveTotal ? 'text-profit' : 'text-loss'
              }`}
            >
              {formatPercent(metrics.totalReturnPct)} return
            </div>
          </div>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="card border-neutral/40">
          <div className="card-body text-xs text-neutral space-y-1">
            {warnings.map((w, i) => (
              <div key={i}>⚠ {w}</div>
            ))}
          </div>
        </div>
      )}

      {/* Key metrics grid */}
      <div className="card">
        <div className="card-header">
          <h3 className="font-medium text-white text-sm">Performance metrics</h3>
        </div>
        <div className="card-body grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Metric label="Trades" value={metrics.trades.toString()} />
          <Metric
            label="Win rate"
            value={`${metrics.winRate.toFixed(1)}%`}
            tone={metrics.winRate >= 50 ? 'profit' : 'loss'}
          />
          <Metric
            label="Profit factor"
            value={
              metrics.profitFactor === Infinity
                ? '∞'
                : metrics.profitFactor.toFixed(2)
            }
            tone={metrics.profitFactor >= 1 ? 'profit' : 'loss'}
          />
          <Metric
            label="Expectancy"
            value={formatCurrency(metrics.expectancy)}
            tone={metrics.expectancy >= 0 ? 'profit' : 'loss'}
          />
          <Metric
            label="Avg win"
            value={formatCurrency(metrics.avgWin)}
            tone="profit"
          />
          <Metric
            label="Avg loss"
            value={formatCurrency(metrics.avgLoss)}
            tone="loss"
          />
          <Metric
            label="Max drawdown"
            value={formatCurrency(-metrics.maxDrawdown)}
            tone="loss"
          />
          <Metric
            label="Max DD %"
            value={`${metrics.maxDrawdownPct.toFixed(2)}%`}
            tone="loss"
          />
          <Metric
            label="Avg hold"
            value={formatHold(metrics.avgHoldMinutes)}
          />
          <Metric
            label="Largest win"
            value={formatCurrency(metrics.longestWin)}
            tone="profit"
          />
          <Metric
            label="Largest loss"
            value={formatCurrency(metrics.longestLoss)}
            tone="loss"
          />
          <Metric
            label="Buy & hold"
            value={`${metrics.buyHoldReturnPct.toFixed(2)}%`}
            tone={beatBuyHold ? 'profit' : 'loss'}
            sublabel={beatBuyHold ? 'beat baseline' : 'underperformed'}
          />
        </div>
      </div>

      {/* Equity curve */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h3 className="font-medium text-white text-sm">Equity curve</h3>
          <div className="text-[10px] text-gray-500 flex gap-4">
            <span><span className="inline-block w-2 h-2 rounded-full bg-profit mr-1" />Strategy</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-gray-500 mr-1" />Buy & hold</span>
          </div>
        </div>
        <div className="card-body">
          <EquityCurve curve={equityCurve} />
        </div>
      </div>

      {/* Trade list */}
      <div className="card">
        <div className="card-header">
          <h3 className="font-medium text-white text-sm">
            Trades ({trades.length})
          </h3>
        </div>
        {trades.length === 0 ? (
          <div className="card-body text-center text-gray-500 text-sm py-8">
            No signals fired in this window. Try a longer range, a faster
            interval, or relaxed RSI thresholds.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[420px]">
            <table className="table">
              <thead className="sticky top-0 bg-ink-surface">
                <tr>
                  <th>#</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>Hold</th>
                  <th>Entry $</th>
                  <th>Exit $</th>
                  <th>P&L</th>
                  <th>%</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <TradeRow key={t.id} trade={t} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  sublabel,
}: {
  label: string;
  value: string;
  tone?: 'profit' | 'loss';
  sublabel?: string;
}) {
  const cls =
    tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-white';
  return (
    <div className="p-3 bg-white/[0.03] border border-white/5 rounded-lg">
      <div className="text-[9px] text-gray-500 uppercase tracking-widest">
        {label}
      </div>
      <div className={`text-lg font-bold font-mono mt-0.5 ${cls}`}>{value}</div>
      {sublabel && (
        <div className="text-[9px] text-gray-500 mt-0.5">{sublabel}</div>
      )}
    </div>
  );
}

function TradeRow({ trade }: { trade: BacktestTrade }) {
  const isWin = trade.realizedPnL > 0;
  return (
    <tr>
      <td className="font-mono text-xs text-gray-500">{trade.id + 1}</td>
      <td className="font-mono text-xs">
        {format(trade.entryAt, 'MMM dd HH:mm')}
      </td>
      <td className="font-mono text-xs">{format(trade.exitAt, 'MMM dd HH:mm')}</td>
      <td className="font-mono text-xs text-gray-400">
        {formatHold(trade.holdMinutes)}
      </td>
      <td className="font-mono text-xs">{formatPrice(trade.entryPrice)}</td>
      <td className="font-mono text-xs">{formatPrice(trade.exitPrice)}</td>
      <td className={`font-mono ${isWin ? 'text-profit' : 'text-loss'}`}>
        {formatCurrency(trade.realizedPnL)}
      </td>
      <td className={`font-mono text-xs ${isWin ? 'text-profit' : 'text-loss'}`}>
        {trade.realizedPnLPct >= 0 ? '+' : ''}
        {trade.realizedPnLPct.toFixed(2)}%
      </td>
      <td className="text-xs text-gray-500 truncate max-w-[200px]">
        {trade.exitReason}
      </td>
    </tr>
  );
}

function formatHold(mins: number): string {
  if (mins < 60) return `${Math.round(mins)}m`;
  if (mins < 60 * 6.5) return `${(mins / 60).toFixed(1)}h`;
  return `${(mins / (60 * 6.5)).toFixed(1)}d`;
}

function EquityCurve({ curve }: { curve: BacktestResult['equityCurve'] }) {
  if (curve.length === 0) {
    return <div className="text-xs text-gray-500 text-center py-8">No data</div>;
  }

  const w = 800;
  const h = 180;
  const xs = curve.map((_, i) => (i / Math.max(1, curve.length - 1)) * w);
  const minStrat = Math.min(...curve.map((p) => p.cumulativePnL), 0);
  const maxStrat = Math.max(...curve.map((p) => p.cumulativePnL), 0);
  const minBh = Math.min(...curve.map((p) => p.buyHoldEquity), 0);
  const maxBh = Math.max(...curve.map((p) => p.buyHoldEquity), 0);
  const min = Math.min(minStrat, minBh);
  const max = Math.max(maxStrat, maxBh);
  const range = max - min || 1;

  const yStrat = curve.map(
    (p) => h - ((p.cumulativePnL - min) / range) * h
  );
  const yBh = curve.map(
    (p) => h - ((p.buyHoldEquity - min) / range) * h
  );

  const stratPath = xs
    .map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${yStrat[i].toFixed(1)}`)
    .join(' ');
  const bhPath = xs
    .map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${yBh[i].toFixed(1)}`)
    .join(' ');
  const zeroY = h - ((0 - min) / range) * h;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="w-full h-44"
      role="img"
      aria-label="Equity curve"
    >
      <line x1="0" x2={w} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
      <path d={bhPath} fill="none" stroke="rgba(155,163,180,0.5)" strokeWidth="1.5" />
      <path d={stratPath} fill="none" stroke="#22c55e" strokeWidth="2" />
    </svg>
  );
}
