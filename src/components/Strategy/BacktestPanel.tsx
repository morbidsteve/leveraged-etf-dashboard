'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  const [walkForward, setWalkForward] = useState<{
    windows: Array<{ index: number; inSample: { metrics: { winRate: number; expectancy: number; trades: number } }; outOfSample: { metrics: { winRate: number; expectancy: number; trades: number } } }>;
    inSampleWinRateAvg: number;
    oosWinRateAvg: number;
    inSampleExpectancyAvg: number;
    oosExpectancyAvg: number;
    winRateDecayPct: number;
    expectancyDecayPct: number;
    warnings: string[];
  } | null>(null);
  const [walkForwardRunning, setWalkForwardRunning] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizerResult, setOptimizerResult] = useState<{
    cells: Array<{ period: number; oversold: number; overbought: number; trades: number; winRate: number; pnl: number; expectancy: number; sharpe: number; score: number }>;
    best: { period: number; oversold: number; overbought: number; trades: number; winRate: number; pnl: number; expectancy: number; sharpe: number; score: number } | null;
    baseline: { period: number; oversold: number; overbought: number; trades: number; winRate: number; pnl: number; expectancy: number; sharpe: number; score: number } | null;
    scoreStd: number;
    scoreMean: number;
    topDecileMean: number;
    robustness: 'robust' | 'modest' | 'fragile' | 'overfit';
    durationMs: number;
  } | null>(null);

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
          ticker: tickerOverride.trim().toUpperCase() || selected.tickers[0],
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
              placeholder={selected?.tickers[0] || 'SOXL'}
              className="input w-full font-mono uppercase text-sm"
            />
            <div className="mt-2 text-[10px] text-gray-500">
              Leave empty to use strategy's first ticker ({selected?.tickers.join(', ') || 'SOXL'}).
              Backtest runs against ONE ticker per run.
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
          <button
            onClick={async () => {
              if (!selected) return;
              setWalkForwardRunning(true);
              setWalkForward(null);
              try {
                const r = await fetch('/api/backtest/walkforward', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    strategy: selected,
                    ticker: tickerOverride.trim().toUpperCase() || selected.tickers[0],
                    interval: preset.interval,
                    range: preset.range,
                    inSampleBars: 500,
                    outOfSampleBars: 100,
                  }),
                });
                const data = await r.json();
                if (data.error) throw new Error(data.error);
                setWalkForward(data);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Walk-forward failed');
              } finally {
                setWalkForwardRunning(false);
              }
            }}
            disabled={walkForwardRunning || !selected}
            className="btn btn-outline text-sm"
            title="Validate strategy out-of-sample using rolling windows"
          >
            {walkForwardRunning ? 'Validating…' : 'Walk-forward'}
          </button>
          <button
            onClick={async () => {
              if (!selected) return;
              setOptimizing(true);
              setOptimizerResult(null);
              try {
                const r = await fetch('/api/optimize', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    strategy: selected,
                    ticker: tickerOverride.trim().toUpperCase() || selected.tickers[0],
                    interval: preset.interval,
                    range: preset.range,
                  }),
                });
                const data = await r.json();
                if (data.error) throw new Error(data.error);
                setOptimizerResult(data);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Optimize failed');
              } finally {
                setOptimizing(false);
              }
            }}
            disabled={optimizing || !selected}
            className="btn btn-outline text-sm"
            title="Grid-search RSI period / oversold / overbought combinations"
          >
            {optimizing ? 'Searching…' : 'Optimize params'}
          </button>
        </div>
      </div>

      {error && (
        <div className="card border-loss/50">
          <div className="card-body text-loss text-sm">{error}</div>
        </div>
      )}

      {result && <BacktestResultView result={result} />}

      {optimizerResult && (
        <div className="card">
          <div className="card-header flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-medium text-white">Parameter optimization</h3>
              <p className="text-[11px] text-gray-500 mt-1">
                Grid-searched {optimizerResult.cells.length} RSI period / oversold / overbought
                combos in {(optimizerResult.durationMs / 1000).toFixed(1)}s. Robustness label
                tells you whether the winning combo is real or curve-fit.
              </p>
            </div>
            <span
              className={`text-[10px] uppercase tracking-widest font-mono px-2 py-1 rounded border ${
                optimizerResult.robustness === 'robust'
                  ? 'bg-profit/10 border-profit/40 text-profit'
                  : optimizerResult.robustness === 'modest'
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                  : optimizerResult.robustness === 'fragile'
                  ? 'bg-amber-500/15 border-amber-500/50 text-amber-400'
                  : 'bg-loss/10 border-loss/40 text-loss'
              }`}
            >
              {optimizerResult.robustness}
            </span>
          </div>
          <div className="card-body space-y-3 text-xs">
            {optimizerResult.best && (
              <div className="rounded-lg border border-profit/30 bg-profit/5 p-2.5 space-y-1">
                <div className="text-[10px] uppercase tracking-widest text-gray-500">
                  Best combo
                </div>
                <div className="font-mono text-white">
                  RSI({optimizerResult.best.period}) · oversold ≤{optimizerResult.best.oversold} · overbought ≥{optimizerResult.best.overbought}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
                  <span className="font-mono text-[11px] text-gray-300">
                    P&amp;L:{' '}
                    <span className={optimizerResult.best.pnl >= 0 ? 'text-profit' : 'text-loss'}>
                      ${optimizerResult.best.pnl.toFixed(2)}
                    </span>
                  </span>
                  <span className="font-mono text-[11px] text-gray-300">
                    Win: {optimizerResult.best.winRate.toFixed(0)}%
                  </span>
                  <span className="font-mono text-[11px] text-gray-300">
                    Trades: {optimizerResult.best.trades}
                  </span>
                  <span className="font-mono text-[11px] text-gray-300">
                    Sharpe: {optimizerResult.best.sharpe.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
            {optimizerResult.baseline && optimizerResult.best && (
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                <div className="text-[10px] uppercase tracking-widest text-gray-500">
                  vs current params
                </div>
                <div className="font-mono text-[11px] text-gray-300 mt-0.5">
                  RSI({optimizerResult.baseline.period}) · {optimizerResult.baseline.oversold}/{optimizerResult.baseline.overbought}: P&amp;L ${optimizerResult.baseline.pnl.toFixed(2)} · Win {optimizerResult.baseline.winRate.toFixed(0)}% · {optimizerResult.baseline.trades} trades
                </div>
                <div className="text-[11px] mt-1">
                  Lift:{' '}
                  <span
                    className={
                      optimizerResult.best.pnl > optimizerResult.baseline.pnl
                        ? 'text-profit font-mono'
                        : 'text-loss font-mono'
                    }
                  >
                    ${(optimizerResult.best.pnl - optimizerResult.baseline.pnl).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Stat label="Mean score" value={optimizerResult.scoreMean.toFixed(2)} />
              <Stat
                label="Top-decile mean"
                value={optimizerResult.topDecileMean.toFixed(2)}
                tone="profit"
              />
              <Stat label="Std dev" value={optimizerResult.scoreStd.toFixed(2)} />
            </div>
            <div className="text-[10px] text-gray-600 italic">
              {optimizerResult.robustness === 'robust' &&
                'Profitable across a wide neighborhood — the winning combo is likely real.'}
              {optimizerResult.robustness === 'modest' &&
                'Modest sensitivity — re-test on out-of-sample data before swapping params.'}
              {optimizerResult.robustness === 'fragile' &&
                'High score variance — winning combo may be curve-fit. Walk-forward first.'}
              {optimizerResult.robustness === 'overfit' &&
                'Top combo wildly outperforms the average. Almost certainly overfit; do not use.'}
            </div>
          </div>
        </div>
      )}

      {walkForward && (
        <div className="card">
          <div className="card-header">
            <h3 className="font-medium text-white">Walk-forward validation</h3>
            <p className="text-[11px] text-gray-500 mt-1">
              Rolling in-sample / out-of-sample windows. Decay = how much
              performance drops out-of-sample. Negative decay is great
              (OOS better than IS); positive &gt;30% suggests overfitting.
            </p>
          </div>
          <div className="card-body space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="rounded bg-white/[0.03] border border-white/5 p-2">
                <div className="text-[9px] uppercase tracking-widest text-gray-500">Win rate IS / OOS</div>
                <div className="font-mono">
                  {walkForward.inSampleWinRateAvg.toFixed(0)}% / <span className={walkForward.oosWinRateAvg < walkForward.inSampleWinRateAvg * 0.7 ? 'text-loss' : 'text-profit'}>{walkForward.oosWinRateAvg.toFixed(0)}%</span>
                </div>
              </div>
              <div className="rounded bg-white/[0.03] border border-white/5 p-2">
                <div className="text-[9px] uppercase tracking-widest text-gray-500">Expectancy IS / OOS</div>
                <div className="font-mono text-[11px]">
                  ${walkForward.inSampleExpectancyAvg.toFixed(2)} / <span className={walkForward.oosExpectancyAvg < 0 ? 'text-loss' : 'text-profit'}>${walkForward.oosExpectancyAvg.toFixed(2)}</span>
                </div>
              </div>
              <div className="rounded bg-white/[0.03] border border-white/5 p-2">
                <div className="text-[9px] uppercase tracking-widest text-gray-500">Win-rate decay</div>
                <div className={`font-mono ${walkForward.winRateDecayPct > 30 ? 'text-loss' : 'text-white'}`}>
                  {walkForward.winRateDecayPct.toFixed(1)}%
                </div>
              </div>
              <div className="rounded bg-white/[0.03] border border-white/5 p-2">
                <div className="text-[9px] uppercase tracking-widest text-gray-500">Windows</div>
                <div className="font-mono">{walkForward.windows.length}</div>
              </div>
            </div>
            {walkForward.warnings.length > 0 && (
              <div className="rounded border border-amber-400/30 bg-amber-500/10 p-2 space-y-1">
                {walkForward.warnings.map((w, i) => (
                  <div key={i} className="text-[11px] text-amber-100">⚠ {w}</div>
                ))}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono">
                <thead>
                  <tr className="text-left text-[9px] uppercase tracking-widest text-gray-500 border-b border-white/10">
                    <th className="px-2 py-1 font-normal">Window</th>
                    <th className="px-2 py-1 font-normal text-right">IS trades</th>
                    <th className="px-2 py-1 font-normal text-right">IS win%</th>
                    <th className="px-2 py-1 font-normal text-right">OOS trades</th>
                    <th className="px-2 py-1 font-normal text-right">OOS win%</th>
                    <th className="px-2 py-1 font-normal text-right">OOS exp.</th>
                  </tr>
                </thead>
                <tbody>
                  {walkForward.windows.map((w) => (
                    <tr key={w.index} className="border-b border-white/5">
                      <td className="px-2 py-1">{w.index + 1}</td>
                      <td className="px-2 py-1 text-right">{w.inSample.metrics.trades}</td>
                      <td className="px-2 py-1 text-right">{w.inSample.metrics.winRate.toFixed(0)}%</td>
                      <td className="px-2 py-1 text-right">{w.outOfSample.metrics.trades}</td>
                      <td className={`px-2 py-1 text-right ${w.outOfSample.metrics.winRate < 50 ? 'text-loss' : 'text-profit'}`}>
                        {w.outOfSample.metrics.winRate.toFixed(0)}%
                      </td>
                      <td className={`px-2 py-1 text-right ${w.outOfSample.metrics.expectancy >= 0 ? 'text-profit' : 'text-loss'}`}>
                        ${w.outOfSample.metrics.expectancy.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
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

      {/* Replay */}
      <ReplayCard result={result} />

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

// ─── Replay ───────────────────────────────────────────────────────────────

const SPEEDS = [
  { label: '0.5×', barsPerTick: 1, intervalMs: 400 },
  { label: '1×', barsPerTick: 1, intervalMs: 200 },
  { label: '2×', barsPerTick: 1, intervalMs: 100 },
  { label: '5×', barsPerTick: 5, intervalMs: 100 },
  { label: '10×', barsPerTick: 10, intervalMs: 100 },
];

function ReplayCard({ result }: { result: BacktestResult }) {
  const { equityCurve, trades } = result;
  const total = equityCurve.length;
  const [bar, setBar] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-advance
  useEffect(() => {
    if (!playing || total === 0) return;
    const speed = SPEEDS[speedIdx];
    intervalRef.current = setInterval(() => {
      setBar((b) => {
        const next = b + speed.barsPerTick;
        if (next >= total - 1) {
          setPlaying(false);
          return total - 1;
        }
        return next;
      });
    }, speed.intervalMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, speedIdx, total]);

  // Keep bar in bounds when result changes
  useEffect(() => {
    if (bar > total - 1) setBar(Math.max(0, total - 1));
  }, [total, bar]);

  if (total === 0) return null;

  const point = equityCurve[bar];
  const upToNow = equityCurve.slice(0, bar + 1);
  const tradesUpToNow = trades.filter((t) => new Date(t.exitAt).getTime() <= point.time * 1000);
  const lastClosed = tradesUpToNow[tradesUpToNow.length - 1];
  const inProgress = trades.find(
    (t) =>
      new Date(t.entryAt).getTime() <= point.time * 1000 &&
      new Date(t.exitAt).getTime() > point.time * 1000
  );

  const winsUpToNow = tradesUpToNow.filter((t) => t.realizedPnL > 0).length;
  const winRate = tradesUpToNow.length > 0 ? (winsUpToNow / tradesUpToNow.length) * 100 : 0;

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-medium text-white text-sm">Replay · scrub bar-by-bar</h3>
        <div className="text-[10px] text-gray-500">
          Bar {bar + 1} of {total} ·{' '}
          <span className="font-mono">{format(new Date(point.time * 1000), 'MMM dd HH:mm')}</span>
        </div>
      </div>
      <div className="card-body space-y-3">
        {/* Per-bar stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <ReplayStat
            label="Cumulative P&L"
            value={formatCurrency(point.cumulativePnL)}
            tone={point.cumulativePnL >= 0 ? 'profit' : 'loss'}
          />
          <ReplayStat label="Closed trades" value={`${tradesUpToNow.length}`} />
          <ReplayStat
            label="Win rate"
            value={`${winRate.toFixed(0)}%`}
            tone={winRate >= 50 ? 'profit' : 'loss'}
          />
          <ReplayStat
            label="Buy & hold"
            value={formatCurrency(point.buyHoldEquity)}
          />
        </div>

        {/* In-progress / last-closed indicator */}
        {inProgress ? (
          <div className="rounded-lg p-2 bg-accent/10 border border-accent/30 text-xs">
            <div className="text-[10px] uppercase tracking-widest text-accent-light mb-0.5">
              In position
            </div>
            <div className="font-mono">
              Entered @ {formatPrice(inProgress.entryPrice)} on{' '}
              {format(new Date(inProgress.entryAt), 'MMM dd HH:mm')} · {inProgress.shares} sh
            </div>
          </div>
        ) : lastClosed ? (
          <div
            className={`rounded-lg p-2 border text-xs ${
              lastClosed.realizedPnL >= 0
                ? 'border-profit/30 bg-profit/5'
                : 'border-loss/30 bg-loss/5'
            }`}
          >
            <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-0.5">
              Last closed trade
            </div>
            <div className="font-mono">
              #{lastClosed.id + 1} · {formatPrice(lastClosed.entryPrice)} →{' '}
              {formatPrice(lastClosed.exitPrice)} ·{' '}
              <span className={lastClosed.realizedPnL >= 0 ? 'text-profit' : 'text-loss'}>
                {formatCurrency(lastClosed.realizedPnL)}
              </span>
            </div>
          </div>
        ) : null}

        {/* Equity curve up to current bar */}
        <PartialEquityCurve full={equityCurve} cursor={bar} />

        {/* Slider + transport */}
        <div className="space-y-2">
          <input
            type="range"
            min={0}
            max={total - 1}
            value={bar}
            onChange={(e) => {
              setPlaying(false);
              setBar(Number(e.target.value));
            }}
            className="w-full accent-accent-light"
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setPlaying(false);
                  setBar(0);
                }}
                className="btn btn-ghost text-xs px-2 py-1"
                title="Rewind"
              >
                ⏮
              </button>
              <button
                onClick={() => setPlaying((p) => !p)}
                className={`btn text-xs px-3 py-1 ${
                  playing ? 'btn-outline' : 'btn-primary'
                }`}
              >
                {playing ? '⏸ Pause' : '▶ Play'}
              </button>
              <button
                onClick={() => {
                  setPlaying(false);
                  setBar(total - 1);
                }}
                className="btn btn-ghost text-xs px-2 py-1"
                title="Skip to end"
              >
                ⏭
              </button>
            </div>
            <div className="chip-group">
              {SPEEDS.map((sp, i) => (
                <button
                  key={sp.label}
                  onClick={() => setSpeedIdx(i)}
                  className={`chip ${speedIdx === i ? 'active-accent' : ''}`}
                >
                  {sp.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReplayStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'profit' | 'loss';
}) {
  const cls = tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-white';
  return (
    <div className="p-2 rounded bg-white/[0.03] border border-white/5">
      <div className="text-[9px] uppercase tracking-widest text-gray-500">{label}</div>
      <div className={`font-mono font-bold text-sm mt-0.5 ${cls}`}>{value}</div>
    </div>
  );
}

function PartialEquityCurve({
  full,
  cursor,
}: {
  full: BacktestResult['equityCurve'];
  cursor: number;
}) {
  if (full.length === 0) return null;
  const w = 800;
  const h = 100;
  const xs = full.map((_, i) => (i / Math.max(1, full.length - 1)) * w);
  const min = Math.min(...full.map((p) => p.cumulativePnL), 0);
  const max = Math.max(...full.map((p) => p.cumulativePnL), 0);
  const range = max - min || 1;
  const ys = full.map((p) => h - ((p.cumulativePnL - min) / range) * h);

  // Past portion (drawn) + future portion (faded)
  const pastPath = xs
    .slice(0, cursor + 1)
    .map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`)
    .join(' ');
  const futurePath = xs
    .slice(cursor)
    .map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i + cursor].toFixed(1)}`)
    .join(' ');
  const cursorX = xs[cursor];
  const zeroY = h - ((0 - min) / range) * h;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-24" role="img">
      <line x1="0" x2={w} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
      <path d={futurePath} fill="none" stroke="rgba(34, 197, 94, 0.18)" strokeWidth="1.5" />
      <path d={pastPath} fill="none" stroke="#22c55e" strokeWidth="2" />
      <line x1={cursorX} x2={cursorX} y1={0} y2={h} stroke="rgba(167, 139, 250, 0.6)" strokeWidth="1" />
      <circle cx={cursorX} cy={ys[cursor]} r="3.5" fill="#a78bfa" />
    </svg>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'profit' | 'loss' | 'neutral';
}) {
  const cls =
    tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-white';
  return (
    <div className="rounded-lg bg-white/[0.02] border border-white/5 p-2">
      <div className="text-[9px] uppercase tracking-widest text-gray-500">{label}</div>
      <div className={`text-sm font-mono font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
