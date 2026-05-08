'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStrategyStore, usePaperStore, usePriceStore } from '@/store';
import { Strategy, StrategyMode, ConditionTree } from '@/types/strategy';
import AutoModeConfirmDialog from './AutoModeConfirmDialog';
import {
  userRsiScalpTemplate,
  userRsiScalpRsiExitTemplate,
} from '@/lib/strategy/templates';
import { describeCondition } from '@/lib/strategy/conditions';
import { describeState } from '@/lib/strategy/evaluator';
import { formatCurrency, formatPrice } from '@/lib/calculations';
import { format } from 'date-fns';
import ConditionEditor, { blankCustomStrategy } from './ConditionEditor';
import { buildShareUrl, consumeIncomingStrategy, shareableToAddInput } from '@/lib/strategy/share';
import { EmptyState, showToast } from '@/components/UI';
import { runtimeKey } from '@/types/strategy';
import StrategyWizard from './StrategyWizard';
import ConditionLiveBadge from './ConditionLiveBadge';
import EntryFireStrip from './EntryFireStrip';
import ConditionTreeView from './ConditionTreeView';
import StrategyExplainerCard from './StrategyExplainerCard';
import MLScoreCard from './MLScoreCard';
import { scoreStrategy } from '@/lib/strategy/signalScoring';

const COMMON_TICKERS = ['SOXL', 'TQQQ', 'SOXS', 'SQQQ', 'UPRO', 'TNA', 'LABU', 'TECL'];

export default function StrategiesPanel() {
  const strategies = useStrategyStore((s) => s.strategies);
  const runtimes = useStrategyStore((s) => s.runtimes);
  const events = useStrategyStore((s) => s.events);
  const addStrategy = useStrategyStore((s) => s.addStrategy);
  const updateStrategy = useStrategyStore((s) => s.updateStrategy);
  const deleteStrategy = useStrategyStore((s) => s.deleteStrategy);
  const paperOpen = usePaperStore((s) => s.open);
  const paperClosed = usePaperStore((s) => s.closed);
  const prices = usePriceStore((s) => s.prices);

  const [showNew, setShowNew] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingAutoStrategy, setPendingAutoStrategy] = useState<Strategy | null>(null);
  const [incoming, setIncoming] = useState<ReturnType<typeof consumeIncomingStrategy>>(null);

  // Watch for an incoming shared strategy in the URL hash on mount
  useEffect(() => {
    const inc = consumeIncomingStrategy();
    if (inc) setIncoming(inc);
  }, []);

  // Cmd+K palette can dispatch this to deep-link into a specific strategy
  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<string>;
      if (typeof ev.detail === 'string') setExpandedId(ev.detail);
    };
    window.addEventListener('etf-expand-strategy', handler);
    return () => window.removeEventListener('etf-expand-strategy', handler);
  }, []);

  const handleAcceptIncoming = () => {
    if (!incoming) return;
    addStrategy(shareableToAddInput(incoming));
    setIncoming(null);
  };

  const handleShare = async (s: Strategy) => {
    const url = buildShareUrl(s);
    try {
      await navigator.clipboard.writeText(url);
      showToast('Share link copied to clipboard');
    } catch {
      window.prompt('Copy this share URL:', url);
    }
  };

  const handleClone = (s: Strategy) => {
    const cloned = addStrategy({
      name: `${s.name} (variant)`,
      tickers: [...s.tickers],
      enabled: false,
      mode: 'paper',
      size: s.size,
      rsiConfig: s.rsiConfig,
      entry: { when: structuredClone(s.entry.when) },
      exit: { when: structuredClone(s.exit.when) },
      stopLoss: s.stopLoss ? { ...s.stopLoss } : undefined,
      cooldownMinutes: s.cooldownMinutes,
    });
    setExpandedId(cloned.id);
    showToast(`Cloned "${s.name}" → "${cloned.name}" (paper, disabled)`);
  };

  const totalPaperPnL = useMemo(
    () => paperClosed.reduce((s, t) => s + t.realizedPnL, 0),
    [paperClosed]
  );

  const handleSeed = (variant: 'target' | 'rsi-exit' | 'custom') => {
    if (variant === 'custom') {
      const blanks = blankCustomStrategy();
      addStrategy({
        name: 'Custom strategy',
        tickers: ['SOXL'],
        enabled: false,
        mode: 'paper',
        size: { kind: 'shares', n: 100 },
        rsiConfig: { period: 250, oversold: 50, overbought: 55 },
        entry: { when: blanks.entry },
        exit: { when: blanks.exit },
        stopLoss: { pct: 1 },
        cooldownMinutes: 5,
      });
    } else {
      const tpl =
        variant === 'target'
          ? userRsiScalpTemplate({ ticker: 'SOXL' })
          : userRsiScalpRsiExitTemplate({ ticker: 'SOXL' });
      addStrategy(tpl);
    }
    setShowNew(false);
  };

  return (
    <div className="space-y-4">
      {incoming && (
        <div className="card border-accent/40">
          <div className="card-body space-y-2">
            <div className="text-xs font-semibold uppercase tracking-widest text-accent-light">
              Shared strategy detected
            </div>
            <div className="text-sm text-white">
              Someone shared a strategy with you: <strong>{incoming.name}</strong> ({incoming.tickers?.join(', ') ?? 'no tickers'})
            </div>
            <div className="text-xs text-gray-400">
              Will be imported as <strong>paper mode, disabled</strong>. You can review and edit
              every condition before enabling. Source URL was cleared from your address bar.
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button onClick={handleAcceptIncoming} className="btn btn-primary text-sm">
                Import
              </button>
              <button onClick={() => setIncoming(null)} className="btn btn-ghost text-sm">
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400">
            Strategies watch live data and fire actions when conditions hit. Paper mode
            simulates fills without touching your broker.
          </p>
          {paperClosed.length > 0 && (
            <p className="text-xs mt-1">
              <span className="text-gray-500">Paper P&L (all-time):</span>{' '}
              <span
                className={`font-mono font-semibold ${
                  totalPaperPnL >= 0 ? 'text-profit' : 'text-loss'
                }`}
              >
                {formatCurrency(totalPaperPnL)} · {paperClosed.length} closed
              </span>
            </p>
          )}
        </div>
        <button onClick={() => setShowNew(!showNew)} className="btn btn-primary text-sm">
          {showNew ? 'Cancel' : '+ New Strategy'}
        </button>
      </div>

      {showNew && (
        <>
          <StrategyWizard
            onCreate={(input) => {
              const created = addStrategy(input);
              setShowNew(false);
              showToast(`Created "${created.name}" (paper, disabled)`);
            }}
            onCancel={() => setShowNew(false)}
          />
          <div className="card">
            <div className="card-header">
              <h3 className="font-medium text-white text-sm">Or start from a quick template</h3>
            </div>
            <div className="card-body space-y-2">
              <button
                onClick={() => handleSeed('target')}
                className="w-full text-left p-2.5 rounded-lg border border-white/5 hover:border-accent/40 hover:bg-accent/5 transition"
              >
                <div className="font-medium text-white text-xs">RSI scalp · price target exit</div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  RSI(250) below 50 → buy. Price ≥ entry × 1.015 → sell. 1% stop. 5min cooldown.
                </div>
              </button>
              <button
                onClick={() => handleSeed('rsi-exit')}
                className="w-full text-left p-2.5 rounded-lg border border-white/5 hover:border-accent/40 hover:bg-accent/5 transition"
              >
                <div className="font-medium text-white text-xs">RSI scalp · RSI exit</div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  Same buy. Sell on RSI crossing above 55 instead of price target.
                </div>
              </button>
              <button
                onClick={() => handleSeed('custom')}
                className="w-full text-left p-2.5 rounded-lg border border-white/5 hover:border-accent/40 hover:bg-accent/5 transition"
              >
                <div className="font-medium text-white text-xs">Build from scratch (skip wizard)</div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  Seeds the default RSI setup; edit every condition inline in the form-based editor.
                </div>
              </button>
            </div>
          </div>
        </>
      )}

      {strategies.length === 0 ? (
        <EmptyState
          icon="strategies"
          title="No strategies yet"
          description={
            <>
              Strategies turn the dashboard into an autopilot. Start with a template — the
              defaults match the user's RSI(250) / 50 / 55 setup. Always start in <strong className="text-white">paper mode</strong> to validate before trading real money.
            </>
          }
          primaryCta={{ label: '+ New strategy', onClick: () => setShowNew(true) }}
        />
      ) : (
        <div className="space-y-3">
          {strategies.map((s) => {
            // Aggregate across all (strategy, ticker) instances
            const stratRuntimes = s.tickers.map((t) => runtimes[runtimeKey(s.id, t)]).filter(Boolean);
            const opensForStrat = paperOpen.filter((p) => p.strategyId === s.id);
            const closedForStrat = paperClosed.filter((t) => t.strategyId === s.id);
            const stratPnL = closedForStrat.reduce((sum, t) => sum + t.realizedPnL, 0);
            const score = scoreStrategy(s, paperClosed);
            // Live unrealized P&L summed across all open positions
            const liveOpenPnL = opensForStrat.reduce((sum, p) => {
              const live = prices[p.ticker];
              return live ? sum + (live.price - p.entryPrice) * p.shares : sum;
            }, 0);
            // Aggregate state across instances — show "in_position" if any are
            const inPositionCount = stratRuntimes.filter((r) => r.state === 'in_position').length;
            const armedCount = stratRuntimes.filter((r) => r.state === 'armed').length;
            const cooldownCount = stratRuntimes.filter((r) => r.state === 'cooldown').length;
            const isExp = expandedId === s.id;

            return (
              <div key={s.id} className="card">
                <div className="card-body space-y-2">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <Toggle
                        on={s.enabled}
                        onChange={(v) => {
                          updateStrategy(s.id, { enabled: v });
                          showToast(`${v ? 'Enabled' : 'Disabled'} "${s.name}"`, v ? 'success' : 'info');
                        }}
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-white tracking-tight">{s.name}</div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5 truncate">
                          {s.tickers.join(', ')} ·{' '}
                          {s.size.kind === 'shares' ? `${s.size.n} shares` : `risk ${s.size.pct}%`}{' '}
                          · {s.mode}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatePill
                        inPosition={inPositionCount}
                        armed={armedCount}
                        cooldown={cooldownCount}
                        total={s.tickers.length}
                        enabled={s.enabled}
                      />
                      <button
                        onClick={() => handleClone(s)}
                        className="text-[10px] uppercase tracking-wide text-gray-500 hover:text-accent-light"
                        title="Clone this strategy in paper mode for A/B testing"
                      >
                        Clone
                      </button>
                      <button
                        onClick={() => handleShare(s)}
                        className="text-[10px] uppercase tracking-wide text-gray-500 hover:text-accent-light"
                        title="Copy a share URL to clipboard"
                      >
                        Share
                      </button>
                      {score.trades > 0 && (
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                            score.score >= 60
                              ? 'bg-profit/10 border-profit/30 text-profit'
                              : score.score >= 40
                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                              : 'bg-loss/10 border-loss/30 text-loss'
                          }`}
                          title={score.description}
                        >
                          {score.score.toFixed(0)}
                          {!score.reliable && '*'}
                        </span>
                      )}
                      <button
                        onClick={() => setExpandedId(isExp ? null : s.id)}
                        className="text-[10px] uppercase tracking-wide text-gray-400 hover:text-white"
                      >
                        {isExp ? 'Hide' : 'Details'}
                      </button>
                    </div>
                  </div>

                  {/* Live status row */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5 text-xs">
                    <div>
                      <div className="text-[9px] uppercase tracking-widest text-gray-500">
                        Open positions
                      </div>
                      {opensForStrat.length > 0 ? (
                        <div className="font-mono space-y-1">
                          <div>
                            {opensForStrat.length} on {opensForStrat.map((p) => p.ticker).join(', ')}
                            <span className={liveOpenPnL >= 0 ? 'text-profit ml-2' : 'text-loss ml-2'}>
                              {liveOpenPnL >= 0 ? '+' : ''}
                              {formatCurrency(liveOpenPnL)}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {opensForStrat.map((p) => (
                              <button
                                key={p.id}
                                onClick={() =>
                                  window.dispatchEvent(
                                    new CustomEvent('etf-open-position-modal', {
                                      detail: {
                                        kind: 'paper',
                                        strategyId: p.strategyId,
                                        ticker: p.ticker,
                                      },
                                    })
                                  )
                                }
                                className="text-[9px] uppercase tracking-widest text-gray-500 hover:text-white px-1.5 py-0.5 rounded border border-white/10 hover:border-accent/40 transition"
                                title={`Close paper ${p.ticker}`}
                              >
                                Close {p.ticker}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-gray-600">—</div>
                      )}
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-widest text-gray-500">
                        Paper P&L (closed)
                      </div>
                      <div
                        className={`font-mono ${
                          stratPnL >= 0 ? 'text-profit' : 'text-loss'
                        }`}
                      >
                        {formatCurrency(stratPnL)} · {closedForStrat.length}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-widest text-gray-500">
                        Tickers
                      </div>
                      <div className="font-mono text-gray-300 truncate" title={s.tickers.join(', ')}>
                        {s.tickers.length}
                      </div>
                    </div>
                  </div>

                  {isExp && (
                    <StrategyDetail
                      strategy={s}
                      onUpdate={(patch) => {
                        // Gate switching to auto with a confirmation dialog
                        if (patch.mode === 'auto' && s.mode !== 'auto') {
                          setPendingAutoStrategy({ ...s, ...patch });
                          return;
                        }
                        updateStrategy(s.id, patch);
                      }}
                      onDelete={() => {
                        if (confirm(`Delete strategy "${s.name}"?`)) deleteStrategy(s.id);
                      }}
                      events={events.filter((e) => e.strategyId === s.id)}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pendingAutoStrategy && (
        <AutoModeConfirmDialog
          strategy={pendingAutoStrategy}
          onConfirm={() => {
            updateStrategy(pendingAutoStrategy.id, { mode: 'auto' });
            setPendingAutoStrategy(null);
          }}
          onCancel={() => setPendingAutoStrategy(null)}
        />
      )}
    </div>
  );
}

function StrategyDetail({
  strategy,
  onUpdate,
  onDelete,
  events,
}: {
  strategy: Strategy;
  onUpdate: (patch: Partial<Strategy>) => void;
  onDelete: () => void;
  events: ReturnType<typeof useStrategyStore.getState>['events'];
}) {
  const [showTreeView, setShowTreeView] = useState(false);
  return (
    <div className="pt-3 border-t border-white/5 space-y-3 text-xs">
      <StrategyExplainerCard strategy={strategy} />
      <MLScoreCard strategy={strategy} />

      <Field label={`Tickers (${strategy.tickers.length})`}>
        <TickersPicker
          value={strategy.tickers}
          onChange={(tickers) => onUpdate({ tickers })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mode">
          <select
            value={strategy.mode}
            onChange={(e) => onUpdate({ mode: e.target.value as StrategyMode })}
            className="input w-full text-xs py-1.5"
          >
            <option value="paper">Paper (virtual fills)</option>
            <option value="manual_confirm">Manual confirm (clipboard ticket)</option>
            <option value="auto">Auto (live Schwab orders) — confirms first</option>
          </select>
        </Field>
        <Field label="Shares">
          <input
            type="number"
            value={strategy.size.kind === 'shares' ? strategy.size.n : 0}
            onChange={(e) =>
              onUpdate({ size: { kind: 'shares', n: Number(e.target.value) } })
            }
            className="input w-full text-xs py-1.5 font-mono"
            min={1}
          />
        </Field>
        <Field label="Cooldown (min)">
          <input
            type="number"
            value={strategy.cooldownMinutes}
            onChange={(e) =>
              onUpdate({ cooldownMinutes: Number(e.target.value) })
            }
            className="input w-full text-xs py-1.5 font-mono"
            min={0}
          />
        </Field>
      </div>

      <Field label="Sessions">
        <div className="flex items-center gap-3 flex-wrap">
          {(['pre', 'open', 'post'] as const).map((s) => {
            const enabled = (strategy.sessions ?? ['open']).includes(s);
            const label = s === 'pre' ? 'Pre-market' : s === 'open' ? 'Regular' : 'After-hours';
            return (
              <label key={s} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => {
                    const cur = strategy.sessions ?? ['open'];
                    const next = e.target.checked
                      ? Array.from(new Set([...cur, s]))
                      : cur.filter((x) => x !== s);
                    onUpdate({ sessions: next.length ? (next as ('pre' | 'open' | 'post')[]) : ['open'] });
                  }}
                  className="w-3.5 h-3.5"
                />
                <span className={enabled ? 'text-white' : 'text-gray-500'}>{label}</span>
              </label>
            );
          })}
          <span className="text-[9px] text-gray-600 uppercase tracking-widest ml-auto">
            Engine + Schwab session both gate on this
          </span>
        </div>
      </Field>

      <Field label="Execution channel">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input
              type="radio"
              checked={(strategy.executionChannel ?? 'browser') === 'browser'}
              onChange={() => onUpdate({ executionChannel: 'browser' })}
            />
            <span className="text-white">Browser tab</span>
          </label>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input
              type="radio"
              checked={strategy.executionChannel === 'server'}
              onChange={() => onUpdate({ executionChannel: 'server' })}
            />
            <span className="text-white">Server worker</span>
          </label>
          <span className="text-[9px] text-gray-600 uppercase tracking-widest ml-auto">
            {strategy.executionChannel === 'server'
              ? 'Runs even when laptop is closed (requires SERVER_WORKER_ENABLED=1)'
              : 'Stops when this tab closes'}
          </span>
        </div>
      </Field>

      <div className="flex items-center justify-end -mb-1">
        <button
          onClick={() => setShowTreeView((v) => !v)}
          className={`text-[9px] uppercase tracking-widest font-mono px-2 py-0.5 rounded border transition ${
            showTreeView
              ? 'bg-accent/15 border-accent/40 text-accent-light'
              : 'bg-white/[0.03] border-white/10 text-gray-500 hover:text-white hover:border-white/20'
          }`}
          title="Toggle a hierarchical visualization of the AND/OR/NOT structure"
        >
          {showTreeView ? '✓ Tree view' : 'Tree view'}
        </button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <div className="text-[9px] uppercase tracking-widest text-gray-500">
            Entry condition
          </div>
          <div className="flex items-center gap-3">
            {strategy.tickers.map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <span className="text-[9px] font-mono text-gray-500">{t}</span>
                <ConditionLiveBadge condition={strategy.entry.when} ticker={t} />
              </span>
            ))}
          </div>
        </div>
        {showTreeView && (
          <div className="mb-2 p-3 rounded-lg border border-white/5 bg-white/[0.02]">
            <ConditionTreeView tree={strategy.entry.when} />
          </div>
        )}
        <ConditionEditor
          value={strategy.entry.when}
          onChange={(when: ConditionTree) => onUpdate({ entry: { when } })}
          context="entry"
        />
        <div className="mt-2 space-y-2">
          <div className="text-[9px] uppercase tracking-widest text-gray-500">
            Recent fire history (replay)
          </div>
          {strategy.tickers.map((t) => (
            <div key={t} className="space-y-1">
              <div className="text-[9px] font-mono text-gray-500">{t}</div>
              <EntryFireStrip
                condition={strategy.entry.when}
                ticker={t}
                rsiConfig={strategy.rsiConfig}
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <div className="text-[9px] uppercase tracking-widest text-gray-500">
            Exit condition
          </div>
          <div className="text-[9px] text-gray-600 font-mono italic truncate ml-2 max-w-[60%]">
            evaluates with entry_price set when in_position
          </div>
        </div>
        {showTreeView && (
          <div className="mb-2 p-3 rounded-lg border border-white/5 bg-white/[0.02]">
            <ConditionTreeView tree={strategy.exit.when} />
          </div>
        )}
        <ConditionEditor
          value={strategy.exit.when}
          onChange={(when: ConditionTree) => onUpdate({ exit: { when } })}
          context="exit"
        />
      </div>

      <div>
        <div className="text-[9px] uppercase tracking-widest text-gray-500 mb-1">
          Safety stop (% below entry)
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="0.1"
            min={0}
            max={50}
            value={strategy.stopLoss?.pct ?? 0}
            onChange={(e) => {
              const pct = Number(e.target.value);
              if (pct <= 0) {
                onUpdate({ stopLoss: undefined });
              } else {
                onUpdate({ stopLoss: { pct } });
              }
            }}
            className="input w-20 text-xs py-1 font-mono"
          />
          <span className="text-[10px] text-gray-500">
            {strategy.stopLoss?.pct
              ? `Hard stop at entry × ${(1 - strategy.stopLoss.pct / 100).toFixed(4)} (set 0 to disable)`
              : 'Disabled — set above 0 to enable a broker-side safety stop'}
          </span>
        </div>
      </div>

      <div>
        <div className="text-[9px] uppercase tracking-widest text-gray-500 mb-1">
          Recent events ({events.length})
        </div>
        <div className="max-h-40 overflow-y-auto space-y-1 font-mono text-[11px]">
          {events.length === 0 ? (
            <div className="text-gray-600 italic">No events yet</div>
          ) : (
            events
              .slice(-50)
              .reverse()
              .map((e) => (
                <div key={e.id} className="flex gap-2 text-gray-400">
                  <span className="text-gray-600 shrink-0">
                    {format(new Date(e.timestamp), 'HH:mm:ss')}
                  </span>
                  <span className="text-gray-500 shrink-0">{e.type}</span>
                  <span className="text-gray-300 truncate">{e.detail}</span>
                </div>
              ))
          )}
        </div>
      </div>

      <div className="pt-2 border-t border-white/5 flex justify-end">
        <button
          onClick={onDelete}
          className="text-[10px] uppercase tracking-widest text-loss hover:text-loss-light"
        >
          Delete strategy
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[9px] uppercase tracking-widest text-gray-500 block mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`mt-1 relative w-9 h-5 rounded-full transition-colors shrink-0 ${
        on ? 'bg-profit' : 'bg-white/10'
      }`}
      type="button"
    >
      <div
        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
          on ? 'left-4' : 'left-0.5'
        }`}
      />
    </button>
  );
}

function TickersPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [input, setInput] = useState('');
  const valueSet = new Set(value.map((t) => t.toUpperCase()));

  const addTicker = (t: string) => {
    const upper = t.trim().toUpperCase();
    if (!upper || valueSet.has(upper)) return;
    onChange([...value, upper]);
  };

  const removeTicker = (t: string) => {
    onChange(value.filter((x) => x !== t));
  };

  const togglePreset = (t: string) => {
    if (valueSet.has(t)) removeTicker(t);
    else addTicker(t);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg bg-white/[0.03] border border-white/5 min-h-[40px]">
        {value.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/20 border border-accent/30 text-accent-light text-xs font-mono"
          >
            {t}
            <button
              onClick={() => removeTicker(t)}
              className="hover:text-white"
              aria-label={`Remove ${t}`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
              e.preventDefault();
              addTicker(input);
              setInput('');
            } else if (e.key === 'Backspace' && input === '' && value.length > 0) {
              removeTicker(value[value.length - 1]);
            }
          }}
          placeholder={value.length === 0 ? 'Type ticker + Enter' : ''}
          className="flex-1 min-w-[80px] bg-transparent border-0 text-xs font-mono text-white focus:outline-none px-1"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        <span className="text-[9px] uppercase tracking-widest text-gray-500 mr-1 mt-1">Quick add:</span>
        {COMMON_TICKERS.map((t) => {
          const active = valueSet.has(t);
          return (
            <button
              key={t}
              onClick={() => togglePreset(t)}
              className={`text-[10px] font-mono px-2 py-0.5 rounded border transition ${
                active
                  ? 'bg-accent/20 border-accent/40 text-accent-light'
                  : 'bg-white/[0.03] border-white/5 text-gray-400 hover:text-white hover:border-white/20'
              }`}
            >
              {active ? '−' : '+'} {t}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-gray-500 leading-relaxed">
        The strategy runs <strong>independently per ticker</strong> — each ticker gets its own
        runtime state, paper position, and event log. Adding a ticker creates a fresh armed
        instance; removing one cancels its runtime (open paper positions for that ticker stay
        in the journal).
      </p>
    </div>
  );
}

function StatePill({
  inPosition,
  armed,
  cooldown,
  total,
  enabled,
}: {
  inPosition: number;
  armed: number;
  cooldown: number;
  total: number;
  enabled: boolean;
}) {
  if (!enabled) return <span className="badge badge-neutral">disabled</span>;
  // Aggregate badge: prioritize in_position > armed > cooldown
  if (inPosition > 0) {
    return (
      <span className="badge badge-profit">
        {inPosition === total ? 'In position' : `${inPosition}/${total} in position`}
      </span>
    );
  }
  if (armed > 0) {
    return (
      <span className="badge badge-accent">
        {armed === total ? 'Armed' : `${armed}/${total} armed`}
      </span>
    );
  }
  if (cooldown > 0) {
    return (
      <span className="badge badge-neutral">
        {cooldown === total ? 'Cooldown' : `${cooldown}/${total} cooldown`}
      </span>
    );
  }
  return <span className="badge badge-neutral">idle</span>;
}
