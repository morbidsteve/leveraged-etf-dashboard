'use client';

import { useMemo } from 'react';
import { useStrategyStore, usePaperStore, usePriceStore } from '@/store';
import { formatCurrency, formatPercent } from '@/lib/calculations';
import { format } from 'date-fns';

/**
 * Cross-strategy performance rollup. Aggregates closed paper trades per
 * strategy with win-rate, total/avg P&L, average hold, fire frequency,
 * and a buy-and-hold benchmark using current price for the strategy's
 * first ticker as the reference.
 *
 * Lives at the top of the Analytics drawer. Read-only — for drilling into
 * a single strategy, jump to the Strategies drawer.
 */
export default function StrategyRollup() {
  const strategies = useStrategyStore((s) => s.strategies);
  const closedPaper = usePaperStore((s) => s.closed);
  const prices = usePriceStore((s) => s.prices);

  const rows = useMemo(() => {
    return strategies.map((s) => {
      const trades = closedPaper.filter((t) => t.strategyId === s.id);
      const wins = trades.filter((t) => t.realizedPnL > 0);
      const losses = trades.filter((t) => t.realizedPnL <= 0);
      const totalPnL = trades.reduce((sum, t) => sum + t.realizedPnL, 0);
      const avgPnL = trades.length > 0 ? totalPnL / trades.length : 0;
      const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
      const avgHoldMin =
        trades.length > 0
          ? trades.reduce(
              (sum, t) => sum + (t.exitAt.getTime() - t.entryAt.getTime()) / 60_000,
              0
            ) / trades.length
          : 0;

      // Fire frequency: trades per active day (between first and last fire)
      let firesPerDay = 0;
      if (trades.length > 1) {
        const sorted = [...trades].sort(
          (a, b) => new Date(a.entryAt).getTime() - new Date(b.entryAt).getTime()
        );
        const first = new Date(sorted[0].entryAt);
        const last = new Date(sorted[sorted.length - 1].entryAt);
        const days = Math.max(1, (last.getTime() - first.getTime()) / 86400_000);
        firesPerDay = trades.length / days;
      } else if (trades.length === 1) {
        firesPerDay = 1;
      }

      // Buy-and-hold reference for the first ticker (entry shares × ((current-first_entry)))
      const firstTicker = s.tickers[0];
      const livePrice = firstTicker ? prices[firstTicker]?.price : undefined;
      const firstTrade = trades.length > 0 ? trades[0] : null;
      const bhPnL =
        firstTrade && livePrice && s.size.kind === 'shares'
          ? (livePrice - firstTrade.entryPrice) * s.size.n
          : 0;

      return {
        strategy: s,
        trades: trades.length,
        wins: wins.length,
        losses: losses.length,
        winRate,
        totalPnL,
        avgPnL,
        avgHoldMin,
        firesPerDay,
        bhPnL,
        edgeVsBH: totalPnL - bhPnL,
        firstTradeAt: trades[0]?.entryAt,
        lastTradeAt: trades[trades.length - 1]?.entryAt,
      };
    });
  }, [strategies, closedPaper, prices]);

  // Sort by total P&L descending (best first)
  const sorted = useMemo(
    () => [...rows].sort((a, b) => b.totalPnL - a.totalPnL),
    [rows]
  );

  const aggregate = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        trades: acc.trades + r.trades,
        wins: acc.wins + r.wins,
        totalPnL: acc.totalPnL + r.totalPnL,
        bhPnL: acc.bhPnL + r.bhPnL,
      }),
      { trades: 0, wins: 0, totalPnL: 0, bhPnL: 0 }
    );
  }, [rows]);

  if (strategies.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
          Strategy rollup
        </h2>
        <p className="text-[11px] text-gray-500 mt-1">
          Per-strategy paper P&L, ranked best-first. Edge vs B&H is your
          strategy's P&L minus a simple buy-and-hold of the first ticker.
        </p>
      </div>

      {/* Aggregate ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat
          label="Strategies"
          value={strategies.length.toString()}
          hint={`${strategies.filter((s) => s.enabled).length} enabled`}
        />
        <Stat
          label="Closed paper trades"
          value={aggregate.trades.toString()}
          hint={
            aggregate.trades > 0
              ? `${((aggregate.wins / aggregate.trades) * 100).toFixed(0)}% win rate`
              : '—'
          }
        />
        <Stat
          label="Aggregate P&L"
          value={formatCurrency(aggregate.totalPnL)}
          color={aggregate.totalPnL >= 0 ? 'profit' : 'loss'}
        />
        <Stat
          label="Vs buy-and-hold"
          value={formatCurrency(aggregate.totalPnL - aggregate.bhPnL)}
          color={aggregate.totalPnL - aggregate.bhPnL >= 0 ? 'profit' : 'loss'}
          hint={`B&H: ${formatCurrency(aggregate.bhPnL)}`}
        />
      </div>

      {/* Per-strategy table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead className="bg-white/[0.02] sticky top-0">
              <tr className="text-left text-[9px] uppercase tracking-widest text-gray-500">
                <th className="px-3 py-2 font-normal">Strategy</th>
                <th className="px-3 py-2 font-normal text-right">Trades</th>
                <th className="px-3 py-2 font-normal text-right">Win %</th>
                <th className="px-3 py-2 font-normal text-right">Total P&L</th>
                <th className="px-3 py-2 font-normal text-right">Avg P&L</th>
                <th className="px-3 py-2 font-normal text-right">Avg hold</th>
                <th className="px-3 py-2 font-normal text-right">Fires/day</th>
                <th className="px-3 py-2 font-normal text-right">Edge vs B&H</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.strategy.id} className="border-t border-white/5">
                  <td className="px-3 py-2">
                    <div className="text-white text-xs font-sans truncate max-w-[180px]" title={r.strategy.name}>
                      {r.strategy.name}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      {r.strategy.tickers.join(', ')} · {r.strategy.mode}
                      {!r.strategy.enabled && ' · disabled'}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-300">{r.trades}</td>
                  <td className="px-3 py-2 text-right text-gray-300">
                    {r.trades > 0 ? `${r.winRate.toFixed(0)}%` : '—'}
                  </td>
                  <td
                    className={`px-3 py-2 text-right ${
                      r.totalPnL > 0 ? 'text-profit' : r.totalPnL < 0 ? 'text-loss' : 'text-gray-500'
                    }`}
                  >
                    {r.trades > 0 ? formatCurrency(r.totalPnL) : '—'}
                  </td>
                  <td
                    className={`px-3 py-2 text-right ${
                      r.avgPnL > 0 ? 'text-profit' : r.avgPnL < 0 ? 'text-loss' : 'text-gray-500'
                    }`}
                  >
                    {r.trades > 0 ? formatCurrency(r.avgPnL) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-300">
                    {r.trades > 0 ? `${r.avgHoldMin.toFixed(0)}m` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-300">
                    {r.trades > 0 ? r.firesPerDay.toFixed(1) : '—'}
                  </td>
                  <td
                    className={`px-3 py-2 text-right ${
                      r.edgeVsBH > 0
                        ? 'text-profit'
                        : r.edgeVsBH < 0
                        ? 'text-loss'
                        : 'text-gray-500'
                    }`}
                  >
                    {r.bhPnL !== 0 ? formatCurrency(r.edgeVsBH) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-strategy hour heatmap (best-fire times) */}
      <PerStrategyHourHeatmap rows={sorted} />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string;
  hint?: string;
  color?: 'profit' | 'loss';
}) {
  return (
    <div className="card">
      <div className="card-body p-3">
        <div className="text-[9px] uppercase tracking-widest text-gray-500">{label}</div>
        <div
          className={`text-sm font-mono font-semibold mt-1 ${
            color === 'profit' ? 'text-profit' : color === 'loss' ? 'text-loss' : 'text-white'
          }`}
        >
          {value}
        </div>
        {hint && <div className="text-[10px] text-gray-500 mt-0.5">{hint}</div>}
      </div>
    </div>
  );
}

// ── Per-strategy hour heatmap ────────────────────────────────────────────

function PerStrategyHourHeatmap({
  rows,
}: {
  rows: { strategy: { id: string; name: string }; trades: number }[];
}) {
  const closedPaper = usePaperStore((s) => s.closed);

  // Skip if no data anywhere
  const totalTrades = rows.reduce((s, r) => s + r.trades, 0);
  if (totalTrades === 0) return null;

  // Hours 9..16 (regular session)
  const hours = Array.from({ length: 8 }, (_, i) => 9 + i);

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="text-xs font-medium text-white">Best fire-hours per strategy</h3>
        <p className="text-[10px] text-gray-500 mt-0.5">
          Cell color: green when that strategy's average P&L is positive that hour, red when negative.
        </p>
      </div>
      <div className="card-body overflow-x-auto p-3">
        <table className="text-[10px] font-mono">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="pr-3 font-normal">Strategy</th>
              {hours.map((h) => (
                <th key={h} className="px-1 text-center font-normal">
                  {h}h
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((r) => r.trades > 0)
              .map((r) => {
                const trades = closedPaper.filter((t) => t.strategyId === r.strategy.id);
                const buckets = hours.map((h) => {
                  const inHour = trades.filter(
                    (t) => new Date(t.entryAt).getHours() === h
                  );
                  const totalPnL = inHour.reduce((sum, t) => sum + t.realizedPnL, 0);
                  const avgPnL = inHour.length > 0 ? totalPnL / inHour.length : 0;
                  return { count: inHour.length, avgPnL, totalPnL };
                });
                return (
                  <tr key={r.strategy.id}>
                    <td className="pr-3 text-gray-300 max-w-[160px] truncate" title={r.strategy.name}>
                      {r.strategy.name}
                    </td>
                    {buckets.map((b, i) => (
                      <td
                        key={i}
                        className="px-1 text-center"
                        title={
                          b.count > 0
                            ? `${b.count} trades · avg ${b.avgPnL.toFixed(2)} · total ${b.totalPnL.toFixed(2)}`
                            : '—'
                        }
                      >
                        {b.count === 0 ? (
                          <span className="text-gray-700">·</span>
                        ) : (
                          <span
                            className={`inline-block w-6 px-1 rounded ${
                              b.avgPnL > 0
                                ? 'bg-profit/30 text-profit'
                                : b.avgPnL < 0
                                ? 'bg-loss/30 text-loss'
                                : 'bg-white/5 text-gray-300'
                            }`}
                          >
                            {b.count}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
