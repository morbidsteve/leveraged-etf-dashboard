'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Candle } from '@/types';
import { useStrategyStore, useSettingsStore } from '@/store';
import { useStoreHydration } from '@/hooks/useHydration';
import {
  ReplayState,
  ReplayTrade,
  buildIndicatorCache,
  initialReplayState,
  stepReplay,
  unrealizedAt,
} from '@/lib/strategy/replayEngine';
import { formatCurrency } from '@/lib/calculations';
import { format } from 'date-fns';

const CandlestickChart = dynamic(
  () => import('@/components/Chart/CandlestickChart'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[500px] text-gray-500">
        <span className="animate-pulse">Loading chart…</span>
      </div>
    ),
  }
);

type Speed = 1 | 2 | 5 | 10 | 50;
const SPEED_LABELS: Record<Speed, string> = {
  1: '1x',
  2: '2x',
  5: '5x',
  10: '10x',
  50: '50x',
};

/**
 * Replay mode — load a chunk of historical candles, step a strategy
 * through them tick-by-tick. Same evaluator as live; the only thing
 * different is the data source. Useful for "would this strategy have
 * worked yesterday?" without paying for a full backtest sweep.
 */
export default function ReplayPage() {
  const hydrated = useStoreHydration();
  const strategies = useStrategyStore((s) => s.strategies);
  const globalRsiConfig = useSettingsStore((s) => s.settings.rsiConfig);

  // Setup state
  const [strategyId, setStrategyId] = useState<string>('');
  const [ticker, setTicker] = useState<string>('SOXL');
  const [interval, setIntervalState] = useState<'1m' | '5m' | '15m' | '1h' | '1d'>('5m');
  const [range, setRange] = useState<'1d' | '5d' | '1mo' | '3mo'>('5d');
  const [includePrePost, setIncludePrePost] = useState(false);

  // Loaded data
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Replay engine state
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState<Speed>(2);
  const [replayState, setReplayState] = useState<ReplayState | null>(null);

  // Pre-compute indicator cache when candles change
  const indicatorCache = useMemo(() => {
    if (candles.length === 0) return null;
    return buildIndicatorCache(candles, globalRsiConfig);
  }, [candles, globalRsiConfig]);

  const strategy = strategies.find((s) => s.id === strategyId);

  // Reset replay when strategy / candles change
  useEffect(() => {
    if (!strategy || candles.length === 0) {
      setReplayState(null);
      setIndex(0);
      return;
    }
    setReplayState(initialReplayState(strategy, ticker));
    setIndex(0);
  }, [strategy, candles, ticker]);

  // Default-pick first strategy on hydrate
  useEffect(() => {
    if (hydrated && !strategyId && strategies.length > 0) {
      setStrategyId(strategies[0].id);
      const t = strategies[0].tickers?.[0];
      if (t) setTicker(t);
    }
  }, [hydrated, strategyId, strategies]);

  const loadCandles = async () => {
    setLoading(true);
    setError(null);
    setRunning(false);
    try {
      const r = await fetch(
        `/api/candles?symbol=${ticker}&interval=${interval}&range=${range}&includePrePost=${includePrePost}`
      );
      if (!r.ok) throw new Error(`Yahoo ${r.status}`);
      const data = await r.json();
      setCandles(data.candles ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load candles');
    } finally {
      setLoading(false);
    }
  };

  // Auto-step interval. Drives the index forward at `speed` ticks/sec.
  // Each tick advances `speed` candles (so 50x means 50 candles per setInterval call).
  const tickRef = useRef<number | null>(null);
  useEffect(() => {
    if (!running || !strategy || !indicatorCache) return;
    const id = window.setInterval(() => {
      setIndex((cur) => {
        const next = Math.min(candles.length - 1, cur + speed);
        if (next === candles.length - 1) {
          setRunning(false);
        }
        return next;
      });
    }, 200);
    tickRef.current = id;
    return () => window.clearInterval(id);
  }, [running, speed, candles.length, strategy, indicatorCache]);

  // Whenever index moves forward, step the engine for each new candle.
  const lastSteppedRef = useRef<number>(-1);
  useEffect(() => {
    if (!strategy || !indicatorCache || !replayState) return;
    if (index <= lastSteppedRef.current) return;
    let state = replayState;
    for (let i = lastSteppedRef.current + 1; i <= index; i++) {
      state = stepReplay({
        strategy,
        candles,
        index: i,
        ticker,
        rsiConfig: globalRsiConfig,
        cache: indicatorCache,
        prev: state,
      });
    }
    lastSteppedRef.current = index;
    setReplayState(state);
  }, [index, strategy, candles, ticker, globalRsiConfig, indicatorCache, replayState]);

  // Reset stepped pointer when state resets
  useEffect(() => {
    if (replayState && replayState.events.length === 0 && replayState.trades.length === 0) {
      lastSteppedRef.current = -1;
    }
  }, [replayState]);

  // Slice the candle history up to the current replay position so the
  // chart only shows what the engine has "seen" so far.
  const visibleCandles = useMemo(() => candles.slice(0, index + 1), [candles, index]);
  const replayTrades = replayState?.trades ?? [];

  // Build trade markers for the chart
  const tradeMarkers = useMemo(() => {
    return replayTrades.map((t) => ({
      id: `r-${t.entryIndex}`,
      ticker,
      status: 'closed' as const,
      entries: [
        {
          id: `r-${t.entryIndex}-e`,
          date: t.entryAt,
          price: t.entryPrice,
          shares: t.shares,
          fees: 0,
        },
      ],
      exits:
        t.exitAt && t.exitPrice
          ? [
              {
                id: `r-${t.entryIndex}-x`,
                date: t.exitAt,
                price: t.exitPrice,
                shares: t.shares,
                fees: 0,
              },
            ]
          : [],
      avgCost: t.entryPrice,
      totalShares: t.shares,
      realizedPnL: t.realizedPnL ?? 0,
      unrealizedPnL: 0,
      notes: t.reason,
      tags: [],
      createdAt: t.entryAt,
      closedAt: t.exitAt ?? undefined,
    }));
  }, [replayTrades, ticker]);

  const livePrice = visibleCandles[visibleCandles.length - 1]?.close ?? 0;
  const unrealized = unrealizedAt(replayTrades, replayState?.openTradeIdx ?? null, livePrice);
  const realized = replayTrades.reduce((s, t) => s + (t.realizedPnL ?? 0), 0);

  const wins = replayTrades.filter((t) => (t.realizedPnL ?? 0) > 0).length;
  const losses = replayTrades.filter((t) => (t.realizedPnL ?? 0) < 0).length;
  const closed = wins + losses;

  const replayHasData = replayState && candles.length > 0 && strategy;

  return (
    <div className="min-h-screen p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">Strategy replay</h1>
          <p className="text-xs text-gray-500 mt-1">
            Step a strategy through historical candles tick-by-tick. Same evaluator as live.
          </p>
        </div>
        <Link
          href="/"
          className="text-[10px] uppercase tracking-widest font-mono px-2 py-1 rounded border bg-white/[0.03] border-white/10 text-gray-400 hover:text-white"
        >
          ← Dashboard
        </Link>
      </div>

      <div className="card">
        <div className="card-body grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
          <Field label="Strategy">
            <select
              value={strategyId}
              onChange={(e) => setStrategyId(e.target.value)}
              className="input text-xs py-1.5 w-full"
            >
              <option value="">— pick —</option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Ticker">
            <input
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              className="input text-xs py-1.5 w-full font-mono"
            />
          </Field>
          <Field label="Interval">
            <select
              value={interval}
              onChange={(e) => setIntervalState(e.target.value as typeof interval)}
              className="input text-xs py-1.5 w-full"
            >
              <option value="1m">1m</option>
              <option value="5m">5m</option>
              <option value="15m">15m</option>
              <option value="1h">1h</option>
              <option value="1d">1d</option>
            </select>
          </Field>
          <Field label="Range">
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as typeof range)}
              className="input text-xs py-1.5 w-full"
            >
              <option value="1d">1 day</option>
              <option value="5d">5 days</option>
              <option value="1mo">1 month</option>
              <option value="3mo">3 months</option>
            </select>
          </Field>
          <Field label="Pre/Post">
            <label className="flex items-center gap-2 text-xs h-[34px]">
              <input
                type="checkbox"
                checked={includePrePost}
                onChange={(e) => setIncludePrePost(e.target.checked)}
              />
              <span className="text-gray-300">Include extended hours</span>
            </label>
          </Field>
          <button
            onClick={loadCandles}
            disabled={loading || !ticker}
            className="btn-primary text-xs"
          >
            {loading ? 'Loading…' : 'Load candles'}
          </button>
        </div>
        {error && (
          <div className="card-body border-t border-loss/20 bg-loss/5 text-xs text-loss">
            {error}
          </div>
        )}
      </div>

      {replayHasData && (
        <>
          <div className="card">
            <div className="card-body space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setRunning((r) => !r)}
                  disabled={index >= candles.length - 1}
                  className={`text-xs font-mono px-3 py-1.5 rounded border ${
                    running
                      ? 'bg-loss/15 border-loss/40 text-loss'
                      : 'bg-profit/15 border-profit/40 text-profit'
                  }`}
                >
                  {running ? '⏸ Pause' : '▶ Play'}
                </button>
                <button
                  onClick={() => {
                    setRunning(false);
                    setIndex(Math.max(0, index - 1));
                    if (strategy) {
                      setReplayState(initialReplayState(strategy, ticker));
                      lastSteppedRef.current = -1;
                    }
                  }}
                  className="text-xs font-mono px-3 py-1.5 rounded border bg-white/[0.03] border-white/10 text-gray-300 hover:text-white"
                  title="Step back resets the replay to the start and re-runs to one less candle"
                >
                  ⏮ Step back
                </button>
                <button
                  onClick={() => {
                    setRunning(false);
                    setIndex(Math.min(candles.length - 1, index + 1));
                  }}
                  className="text-xs font-mono px-3 py-1.5 rounded border bg-white/[0.03] border-white/10 text-gray-300 hover:text-white"
                >
                  ⏭ Step
                </button>
                <button
                  onClick={() => {
                    setRunning(false);
                    if (strategy) {
                      setReplayState(initialReplayState(strategy, ticker));
                      lastSteppedRef.current = -1;
                      setIndex(0);
                    }
                  }}
                  className="text-xs font-mono px-3 py-1.5 rounded border bg-white/[0.03] border-white/10 text-gray-300 hover:text-white"
                >
                  ↺ Reset
                </button>

                <span className="ml-auto flex items-center gap-1">
                  <span className="text-[10px] uppercase tracking-widest text-gray-500">Speed:</span>
                  {([1, 2, 5, 10, 50] as Speed[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSpeed(s)}
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                        speed === s
                          ? 'bg-accent/20 border-accent/40 text-accent-light'
                          : 'bg-white/[0.03] border-white/10 text-gray-400 hover:text-white'
                      }`}
                    >
                      {SPEED_LABELS[s]}
                    </button>
                  ))}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={candles.length - 1}
                  value={index}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setRunning(false);
                    if (next < lastSteppedRef.current && strategy) {
                      // Scrubbing backwards needs to re-run from start
                      setReplayState(initialReplayState(strategy, ticker));
                      lastSteppedRef.current = -1;
                    }
                    setIndex(next);
                  }}
                  className="flex-1 accent-accent"
                />
                <div className="text-[11px] font-mono text-gray-300 whitespace-nowrap min-w-[140px] text-right">
                  {index + 1} / {candles.length}
                </div>
              </div>

              <div className="text-[11px] font-mono text-gray-400 text-center">
                {visibleCandles.length > 0 &&
                  format(new Date(visibleCandles[visibleCandles.length - 1].time * 1000), 'MMM d, yyyy HH:mm')}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <ReplayStat label="Trades" value={`${replayTrades.length}`} />
            <ReplayStat label="Wins" value={`${wins}`} tone={wins > 0 ? 'profit' : 'neutral'} />
            <ReplayStat label="Losses" value={`${losses}`} tone={losses > 0 ? 'loss' : 'neutral'} />
            <ReplayStat
              label="Win rate"
              value={closed > 0 ? `${((wins / closed) * 100).toFixed(0)}%` : '—'}
            />
            <ReplayStat
              label="P&L"
              value={formatCurrency(realized + unrealized)}
              tone={realized + unrealized >= 0 ? 'profit' : 'loss'}
            />
          </div>

          <div className="card">
            <div className="card-body" style={{ height: 540 }}>
              {visibleCandles.length > 30 ? (
                <CandlestickChart
                  candles={visibleCandles}
                  trades={tradeMarkers}
                  rsiConfig={globalRsiConfig}
                  showRSI={true}
                  showVolume={false}
                  showTradeMarkers={true}
                  showRSICrossings={true}
                  height={500}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-gray-500">
                  Need at least 30 candles for indicators to warm up — keep stepping forward.
                </div>
              )}
            </div>
          </div>

          <ReplayEventsLog
            events={replayState?.events ?? []}
            trades={replayTrades}
          />
        </>
      )}

      {!replayHasData && hydrated && strategies.length === 0 && (
        <div className="card">
          <div className="card-body text-center py-12 text-sm text-gray-500">
            No strategies yet. Create one in the Strategies panel first.
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[9px] uppercase tracking-widest text-gray-500 mb-1">{label}</div>
      {children}
    </label>
  );
}

function ReplayStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'profit' | 'loss' | 'neutral';
}) {
  const cls = tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-white';
  return (
    <div className="card">
      <div className="card-body">
        <div className="text-[10px] uppercase tracking-widest text-gray-500">{label}</div>
        <div className={`text-lg font-mono font-semibold ${cls}`}>{value}</div>
      </div>
    </div>
  );
}

function ReplayEventsLog({
  events,
  trades,
}: {
  events: { candleIndex: number; timestamp: Date; type: string; detail: string }[];
  trades: ReplayTrade[];
}) {
  if (events.length === 0 && trades.length === 0) return null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="card">
        <div className="card-header">
          <h3 className="text-sm font-semibold text-white">Engine events ({events.length})</h3>
        </div>
        <div className="card-body max-h-80 overflow-y-auto space-y-1">
          {events.length === 0 ? (
            <div className="text-xs text-gray-500 italic">No events yet — keep playing.</div>
          ) : (
            [...events]
              .reverse()
              .slice(0, 100)
              .map((e, i) => (
                <div
                  key={`${e.candleIndex}-${i}`}
                  className={`text-[11px] font-mono ${
                    e.type === 'action_emitted' ? 'text-accent-light' : 'text-gray-400'
                  }`}
                >
                  <span className="text-gray-600">
                    [{format(e.timestamp, 'HH:mm')}]
                  </span>{' '}
                  {e.detail}
                </div>
              ))
          )}
        </div>
      </div>
      <div className="card">
        <div className="card-header">
          <h3 className="text-sm font-semibold text-white">Replay trades ({trades.length})</h3>
        </div>
        <div className="card-body max-h-80 overflow-y-auto space-y-1.5">
          {trades.length === 0 ? (
            <div className="text-xs text-gray-500 italic">Strategy hasn't fired yet.</div>
          ) : (
            [...trades].reverse().map((t, i) => {
              const closed = t.exitPrice != null;
              const win = closed && (t.realizedPnL ?? 0) > 0;
              return (
                <div
                  key={i}
                  className={`text-[11px] font-mono p-2 rounded border ${
                    closed
                      ? win
                        ? 'bg-profit/5 border-profit/30'
                        : 'bg-loss/5 border-loss/30'
                      : 'bg-amber-500/5 border-amber-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-white">
                      {t.shares} @ ${t.entryPrice.toFixed(2)}{' '}
                      {closed ? `→ $${t.exitPrice!.toFixed(2)}` : '· OPEN'}
                    </span>
                    <span
                      className={
                        closed
                          ? win
                            ? 'text-profit'
                            : 'text-loss'
                          : 'text-amber-300'
                      }
                    >
                      {closed ? formatCurrency(t.realizedPnL ?? 0) : '—'}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {format(t.entryAt, 'HH:mm')}
                    {closed && t.exitAt && ` → ${format(t.exitAt, 'HH:mm')}`} ·{' '}
                    {t.reason.slice(0, 80)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
