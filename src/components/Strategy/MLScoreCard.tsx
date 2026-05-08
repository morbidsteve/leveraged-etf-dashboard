'use client';

import { useMemo, useState } from 'react';
import { Strategy } from '@/types/strategy';
import { usePaperStore } from '@/store';
import {
  trainLogReg,
  predictProb,
  featureImportance,
  explainPrediction,
} from '@/lib/strategy/mlScoring';

/**
 * Per-strategy ML signal score. Trains a small logistic regression
 * on the strategy's own paper history, then emits:
 *   - P(win) for a "trade entered now" feature vector
 *   - global feature importance (what the model thinks matters)
 *   - per-prediction contributions (why this score, right now)
 *
 * Below ~10 trades there isn't enough signal — we render the skeleton
 * with a clear "needs N more trades" callout instead of a misleading
 * number.
 */
export default function MLScoreCard({ strategy }: { strategy: Strategy }) {
  const closed = usePaperStore((s) => s.closed);
  const [showImportance, setShowImportance] = useState(false);
  const [showWhy, setShowWhy] = useState(false);

  const stratTrades = useMemo(
    () => closed.filter((t) => t.strategyId === strategy.id),
    [closed, strategy.id]
  );

  const model = useMemo(() => trainLogReg(stratTrades), [stratTrades]);

  const probe = useMemo(() => {
    if (!model) return null;
    // Build a synthetic "now" trade so the model can score current
    // conditions. Price-action features (pct_move, hold) are 0 since
    // we haven't entered yet — only hour-of-day / day-of-week influence.
    const now = new Date();
    const synthetic = {
      id: 'probe',
      strategyId: strategy.id,
      ticker: strategy.tickers[0] ?? 'SPY',
      shares: strategy.size.kind === 'shares' ? strategy.size.n : 100,
      entryPrice: 100,
      exitPrice: 100,
      entryAt: now,
      exitAt: now,
      reason: '',
      realizedPnL: 0,
    };
    const p = predictProb(model, synthetic);
    return { p, explanation: explainPrediction(model, synthetic) };
  }, [model, strategy]);

  const importance = useMemo(
    () => (model ? featureImportance(model).slice(0, 8) : []),
    [model]
  );

  if (stratTrades.length < 10) {
    return (
      <div className="card">
        <div className="card-header">
          <h3 className="text-sm font-semibold text-white">ML score</h3>
          <p className="text-[11px] text-gray-500 mt-1">
            Logistic regression trained on this strategy's own paper history.
          </p>
        </div>
        <div className="card-body text-xs text-gray-500">
          Need ≥10 closed paper trades to train ({stratTrades.length} so far).
        </div>
      </div>
    );
  }

  if (!model || !probe) return null;

  const auc = model.auc;
  const aucLabel =
    auc >= 0.7 ? 'strong' : auc >= 0.6 ? 'modest' : auc >= 0.55 ? 'weak' : 'noisy';
  const aucTone =
    auc >= 0.7 ? 'text-profit' : auc >= 0.6 ? 'text-amber-300' : 'text-gray-500';

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">ML score</h3>
          <p className="text-[11px] text-gray-500 mt-1">
            Logistic regression on {model.n} trades · AUC{' '}
            <span className={`font-mono ${aucTone}`}>{auc.toFixed(2)} ({aucLabel})</span> · trained in {model.trainMs.toFixed(0)}ms
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-gray-500">P(win) now</div>
          <div
            className={`text-2xl font-mono font-bold ${
              probe.p >= 0.6 ? 'text-profit' : probe.p >= 0.45 ? 'text-amber-300' : 'text-loss'
            }`}
          >
            {(probe.p * 100).toFixed(0)}%
          </div>
        </div>
      </div>
      <div className="card-body space-y-2">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowWhy((v) => !v)}
            className={`text-[10px] uppercase tracking-widest font-mono px-2 py-1 rounded border ${
              showWhy
                ? 'bg-accent/20 border-accent/40 text-accent-light'
                : 'bg-white/[0.03] border-white/10 text-gray-400 hover:text-white'
            }`}
          >
            Why this score?
          </button>
          <button
            onClick={() => setShowImportance((v) => !v)}
            className={`text-[10px] uppercase tracking-widest font-mono px-2 py-1 rounded border ${
              showImportance
                ? 'bg-accent/20 border-accent/40 text-accent-light'
                : 'bg-white/[0.03] border-white/10 text-gray-400 hover:text-white'
            }`}
          >
            What does the model think matters?
          </button>
        </div>

        {showWhy && (
          <div className="space-y-1 mt-2">
            <div className="text-[10px] uppercase tracking-widest text-gray-500">
              Per-feature contribution to current score
            </div>
            {probe.explanation.slice(0, 6).map((row) => {
              const positive = row.contribution > 0;
              const mag = Math.abs(row.contribution);
              const widthPct = Math.min(100, mag * 60);
              return (
                <div key={row.feature} className="flex items-center gap-2 text-[11px] font-mono">
                  <span className="text-gray-400 w-32 truncate">{row.feature}</span>
                  <span className="text-gray-500 w-10 text-right">{row.value.toFixed(2)}</span>
                  <div className="flex-1 relative h-3 bg-white/[0.03] rounded">
                    <div
                      className={`absolute top-0 ${positive ? 'left-1/2' : 'right-1/2'} h-full rounded ${
                        positive ? 'bg-profit/40' : 'bg-loss/40'
                      }`}
                      style={{ width: `${widthPct / 2}%` }}
                    />
                    <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
                  </div>
                  <span
                    className={`w-12 text-right ${
                      positive ? 'text-profit' : 'text-loss'
                    }`}
                  >
                    {positive ? '+' : ''}{row.contribution.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {showImportance && (
          <div className="space-y-1 mt-2">
            <div className="text-[10px] uppercase tracking-widest text-gray-500">
              Top features by weight magnitude
            </div>
            {importance.map((row) => {
              const positive = row.weight > 0;
              const widthPct = Math.min(100, row.abs * 50);
              return (
                <div key={row.feature} className="flex items-center gap-2 text-[11px] font-mono">
                  <span className="text-gray-400 w-32 truncate">{row.feature}</span>
                  <div className="flex-1 relative h-3 bg-white/[0.03] rounded">
                    <div
                      className={`absolute top-0 ${positive ? 'left-1/2' : 'right-1/2'} h-full rounded ${
                        positive ? 'bg-profit/40' : 'bg-loss/40'
                      }`}
                      style={{ width: `${widthPct / 2}%` }}
                    />
                    <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
                  </div>
                  <span
                    className={`w-12 text-right ${
                      positive ? 'text-profit' : 'text-loss'
                    }`}
                  >
                    {positive ? '+' : ''}{row.weight.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="text-[10px] text-gray-600 italic pt-1 border-t border-white/5">
          AUC measured in-sample — at this trade count, treat as a directional
          signal not a guarantee. Re-trains automatically as new trades close.
        </div>
      </div>
    </div>
  );
}
