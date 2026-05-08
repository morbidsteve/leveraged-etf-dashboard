'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useTradeStore, usePaperStore, useStrategyStore, usePriceStore } from '@/store';
import { useStoreHydration } from '@/hooks/useHydration';
import { formatCurrency } from '@/lib/calculations';
import { trainLogReg, predictProb } from '@/lib/strategy/mlScoring';
import { getMarketSession } from '@/lib/marketHours';
import { format } from 'date-fns';

/**
 * End-of-day summary card. Triggers in two states:
 *   - Markets are 'closed' → renders the recap automatically
 *   - Markets are still open → small "preview" mode
 *
 * The recap covers:
 *   - Day P&L (closed manual + closed paper + open unrealized)
 *   - Trades fired today, wins/losses
 *   - Biggest winner + biggest loser
 *   - Per-strategy ML probabilities for the next session
 *   - A nudge to journal anything unjournaled
 */
export default function DailySummaryCard() {
  const hydrated = useStoreHydration();
  const trades = useTradeStore((s) => s.trades);
  const paperClosed = usePaperStore((s) => s.closed);
  const strategies = useStrategyStore((s) => s.strategies);
  const prices = usePriceStore((s) => s.prices);

  const session = getMarketSession();

  const stats = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const sodMs = startOfDay.getTime();

    const manualClosedToday = trades.filter(
      (t) => t.status === 'closed' && t.closedAt && new Date(t.closedAt).getTime() >= sodMs
    );
    const paperToday = paperClosed.filter(
      (t) => new Date(t.exitAt).getTime() >= sodMs
    );

    const allClosed = [
      ...manualClosedToday.map((t) => ({
        ticker: t.ticker,
        pnl: t.realizedPnL,
        kind: 'manual' as const,
        notes: t.notes ?? '',
        tags: t.tags ?? [],
        id: t.id,
      })),
      ...paperToday.map((t) => ({
        ticker: t.ticker,
        pnl: t.realizedPnL,
        kind: 'paper' as const,
        notes: t.notes ?? '',
        tags: t.tags ?? [],
        id: t.id,
      })),
    ];

    const wins = allClosed.filter((t) => t.pnl > 0);
    const losses = allClosed.filter((t) => t.pnl < 0);
    const realizedClosed = allClosed.reduce((s, t) => s + t.pnl, 0);

    const openTrades = trades.filter((t) => t.status === 'open');
    const openUnrealized = openTrades.reduce((s, t) => {
      const cur = prices[t.ticker]?.price ?? t.avgCost;
      return s + (cur - t.avgCost) * t.totalShares;
    }, 0);

    const dayPnL = realizedClosed + openUnrealized;

    const sortedByMag = [...allClosed].sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
    const biggestWin = [...wins].sort((a, b) => b.pnl - a.pnl)[0] ?? null;
    const biggestLoss = [...losses].sort((a, b) => a.pnl - b.pnl)[0] ?? null;

    const unjournaled = allClosed.filter((t) => !t.notes.trim()).length;

    return {
      tradeCount: allClosed.length,
      wins: wins.length,
      losses: losses.length,
      realizedClosed,
      openUnrealized,
      dayPnL,
      biggestWin,
      biggestLoss,
      unjournaled,
      sample: sortedByMag.slice(0, 3),
    };
  }, [trades, paperClosed, prices]);

  // Per-strategy ML probability for "tomorrow morning at 10:00 ET"
  const stratProbs = useMemo(() => {
    if (!hydrated) return [];
    const rows: Array<{ id: string; name: string; prob: number; trades: number }> = [];
    for (const s of strategies) {
      if (!s.enabled) continue;
      const stratHistory = paperClosed.filter((t) => t.strategyId === s.id);
      if (stratHistory.length < 10) continue;
      const model = trainLogReg(stratHistory);
      if (!model) continue;
      // Probe 10:00 ET tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);
      const synthetic = {
        id: 'probe',
        strategyId: s.id,
        ticker: s.tickers[0] ?? 'SPY',
        shares: s.size.kind === 'shares' ? s.size.n : 100,
        entryPrice: 100,
        exitPrice: 100,
        entryAt: tomorrow,
        exitAt: tomorrow,
        reason: '',
        realizedPnL: 0,
      };
      rows.push({
        id: s.id,
        name: s.name,
        prob: predictProb(model, synthetic),
        trades: stratHistory.length,
      });
    }
    return rows.sort((a, b) => b.prob - a.prob);
  }, [hydrated, strategies, paperClosed]);

  if (!hydrated) return null;
  if (stats.tradeCount === 0 && stats.openUnrealized === 0) return null;

  const todayLabel = format(new Date(), 'EEE, MMM d');
  const winRate =
    stats.tradeCount > 0 ? (stats.wins / stats.tradeCount) * 100 : 0;
  const isClose = session === 'closed' || session === 'post';

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">
            {isClose ? 'Daily summary' : "Today so far"}
          </h3>
          <p className="text-[10px] text-gray-500 mt-0.5">{todayLabel}</p>
        </div>
        <span
          className={`text-base font-mono font-bold ${
            stats.dayPnL >= 0 ? 'text-profit' : 'text-loss'
          }`}
        >
          {formatCurrency(stats.dayPnL)}
        </span>
      </div>
      <div className="card-body space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <Stat label="Trades" value={`${stats.tradeCount}`} />
          <Stat
            label="Win rate"
            value={stats.tradeCount > 0 ? `${winRate.toFixed(0)}%` : '—'}
            tone={winRate >= 50 ? 'profit' : 'loss'}
          />
          <Stat
            label="Realized"
            value={formatCurrency(stats.realizedClosed)}
            tone={stats.realizedClosed >= 0 ? 'profit' : 'loss'}
          />
          <Stat
            label="Open unrealized"
            value={formatCurrency(stats.openUnrealized)}
            tone={stats.openUnrealized >= 0 ? 'profit' : 'loss'}
          />
        </div>

        {(stats.biggestWin || stats.biggestLoss) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            {stats.biggestWin && (
              <div className="rounded-lg border border-profit/20 bg-profit/5 p-2">
                <div className="text-[9px] uppercase tracking-widest text-profit">
                  Biggest win
                </div>
                <div className="font-mono text-white">
                  {stats.biggestWin.ticker}{' '}
                  <span className="text-profit">
                    {formatCurrency(stats.biggestWin.pnl)}
                  </span>
                </div>
              </div>
            )}
            {stats.biggestLoss && (
              <div className="rounded-lg border border-loss/20 bg-loss/5 p-2">
                <div className="text-[9px] uppercase tracking-widest text-loss">
                  Biggest loss
                </div>
                <div className="font-mono text-white">
                  {stats.biggestLoss.ticker}{' '}
                  <span className="text-loss">
                    {formatCurrency(stats.biggestLoss.pnl)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {stratProbs.length > 0 && isClose && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">
              ML — next session
            </div>
            <div className="space-y-1">
              {stratProbs.slice(0, 3).map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between text-[11px] font-mono"
                >
                  <span className="text-gray-300 truncate max-w-[60%]">{row.name}</span>
                  <span
                    className={
                      row.prob >= 0.6
                        ? 'text-profit'
                        : row.prob >= 0.45
                        ? 'text-amber-300'
                        : 'text-loss'
                    }
                  >
                    {(row.prob * 100).toFixed(0)}% · {row.trades}t
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {stats.unjournaled > 0 && (
          <Link
            href="/journal"
            className="block rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] hover:bg-amber-500/10"
          >
            <span className="text-amber-300">📓</span> {stats.unjournaled} unjournaled trade
            {stats.unjournaled !== 1 ? 's' : ''} — write the lesson while it's fresh →
          </Link>
        )}
      </div>
    </div>
  );
}

function Stat({
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
    <div className="rounded-lg bg-white/[0.02] border border-white/5 p-2">
      <div className="text-[9px] uppercase tracking-widest text-gray-500">{label}</div>
      <div className={`text-sm font-mono font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
