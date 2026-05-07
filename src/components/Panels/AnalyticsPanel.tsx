'use client';

import { useMemo } from 'react';
import { QuickStats } from '@/components/Dashboard';
import { useTradeStore, usePriceStore } from '@/store';
import { useStoreHydration } from '@/hooks';
import {
  calculatePortfolioSummary,
  formatCurrency,
  formatPercent,
  formatHoldTime,
  calculateHoldTime,
  isWinningTrade,
  calculateUnrealizedPnL,
} from '@/lib/calculations';
import { Trade } from '@/types';
import { format, getDay, getHours, subDays, isAfter } from 'date-fns';

export default function AnalyticsPanel() {
  const storeHydrated = useStoreHydration();
  const trades = useTradeStore((state) => state.trades);
  const prices = usePriceStore((state) => state.prices);

  const openTrades = useMemo(() => trades.filter((t) => t.status === 'open'), [trades]);
  const closedTrades = useMemo(() => trades.filter((t) => t.status === 'closed'), [trades]);
  const portfolioSummary = useMemo(() => calculatePortfolioSummary(trades), [trades]);

  const openPositionStats = useMemo(() => {
    let totalUnrealizedPnL = 0;
    let totalInvested = 0;
    openTrades.forEach((trade) => {
      const currentPrice = prices[trade.ticker]?.price || trade.avgCost;
      totalUnrealizedPnL += calculateUnrealizedPnL(trade, currentPrice);
      totalInvested += trade.avgCost * trade.totalShares;
    });
    return {
      totalUnrealizedPnL,
      totalInvested,
      unrealizedPnLPercent:
        totalInvested > 0 ? (totalUnrealizedPnL / totalInvested) * 100 : 0,
    };
  }, [openTrades, prices]);

  const performanceByDay = useMemo(() => {
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const data = labels.map((shortDay) => ({ shortDay, trades: 0, wins: 0, pnl: 0 }));
    closedTrades.forEach((trade) => {
      const dow = getDay(new Date(trade.closedAt || trade.createdAt));
      data[dow].trades++;
      data[dow].pnl += trade.realizedPnL;
      if (isWinningTrade(trade)) data[dow].wins++;
    });
    return data;
  }, [closedTrades]);

  const performanceByHour = useMemo(() => {
    const data: { hour: number; trades: number; wins: number; pnl: number }[] = [];
    for (let i = 9; i <= 16; i++) data.push({ hour: i, trades: 0, wins: 0, pnl: 0 });
    closedTrades.forEach((trade) => {
      const hour = getHours(new Date(trade.createdAt));
      const bucket = data.find((h) => h.hour === hour);
      if (bucket) {
        bucket.trades++;
        bucket.pnl += trade.realizedPnL;
        if (isWinningTrade(trade)) bucket.wins++;
      }
    });
    return data;
  }, [closedTrades]);

  const winnerLoserComparison = useMemo(() => {
    const winners = closedTrades.filter(isWinningTrade);
    const losers = closedTrades.filter((t) => !isWinningTrade(t));
    const getStats = (ts: Trade[]) => {
      if (ts.length === 0)
        return { count: 0, avgHoldTime: 0, avgReturn: 0, totalPnL: 0, avgPnL: 0 };
      const totalPnL = ts.reduce((s, t) => s + t.realizedPnL, 0);
      const avgHoldTime = ts.reduce((s, t) => s + calculateHoldTime(t), 0) / ts.length;
      const avgReturn =
        ts.reduce((s, t) => {
          const cost = t.entries.reduce((x, e) => x + e.price * e.shares, 0);
          return s + (cost > 0 ? (t.realizedPnL / cost) * 100 : 0);
        }, 0) / ts.length;
      return { count: ts.length, avgHoldTime, avgReturn, totalPnL, avgPnL: totalPnL / ts.length };
    };
    return { winners: getStats(winners), losers: getStats(losers) };
  }, [closedTrades]);

  const equityCurve = useMemo(() => {
    const sorted = [...closedTrades].sort(
      (a, b) =>
        new Date(a.closedAt || a.createdAt).getTime() -
        new Date(b.closedAt || b.createdAt).getTime()
    );
    let cumulative = 0;
    return sorted.map((t) => {
      cumulative += t.realizedPnL;
      return {
        date: new Date(t.closedAt || t.createdAt),
        pnl: t.realizedPnL,
        cumulative,
      };
    });
  }, [closedTrades]);

  const recentPerformance = useMemo(() => {
    const now = new Date();
    const last7 = closedTrades.filter((t) =>
      isAfter(new Date(t.closedAt || t.createdAt), subDays(now, 7))
    );
    const last30 = closedTrades.filter((t) =>
      isAfter(new Date(t.closedAt || t.createdAt), subDays(now, 30))
    );
    const calc = (ts: Trade[]) => ({
      trades: ts.length,
      wins: ts.filter(isWinningTrade).length,
      winRate:
        ts.length > 0 ? (ts.filter(isWinningTrade).length / ts.length) * 100 : 0,
      pnl: ts.reduce((s, t) => s + t.realizedPnL, 0),
    });
    return { last7: calc(last7), last30: calc(last30) };
  }, [closedTrades]);

  const riskMetrics = useMemo(() => {
    if (closedTrades.length === 0) return null;
    const returns = closedTrades.map((t) => {
      const cost = t.entries.reduce((s, e) => s + e.price * e.shares, 0);
      return cost > 0 ? (t.realizedPnL / cost) * 100 : 0;
    });
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    let peak = 0;
    let maxDrawdown = 0;
    let cumulative = 0;
    for (const t of [...closedTrades].sort(
      (a, b) =>
        new Date(a.closedAt || a.createdAt).getTime() -
        new Date(b.closedAt || b.createdAt).getTime()
    )) {
      cumulative += t.realizedPnL;
      if (cumulative > peak) peak = cumulative;
      const dd = peak - cumulative;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    const grossProfit = closedTrades
      .filter(isWinningTrade)
      .reduce((s, t) => s + t.realizedPnL, 0);
    const grossLoss = Math.abs(
      closedTrades.filter((t) => !isWinningTrade(t)).reduce((s, t) => s + t.realizedPnL, 0)
    );
    const profitFactor =
      grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    const expectancy =
      portfolioSummary.winRate > 0
        ? (portfolioSummary.winRate / 100) * winnerLoserComparison.winners.avgPnL +
          ((100 - portfolioSummary.winRate) / 100) * winnerLoserComparison.losers.avgPnL
        : 0;

    return {
      avgReturn,
      stdDev,
      sharpeRatio: stdDev > 0 ? avgReturn / stdDev : 0,
      maxDrawdown,
      profitFactor,
      expectancy,
    };
  }, [closedTrades, portfolioSummary.winRate, winnerLoserComparison]);

  const tickerPerformance = useMemo(() => {
    const byTicker: Record<string, { trades: number; wins: number; pnl: number }> = {};
    closedTrades.forEach((t) => {
      if (!byTicker[t.ticker]) byTicker[t.ticker] = { trades: 0, wins: 0, pnl: 0 };
      byTicker[t.ticker].trades++;
      byTicker[t.ticker].pnl += t.realizedPnL;
      if (isWinningTrade(t)) byTicker[t.ticker].wins++;
    });
    return Object.entries(byTicker)
      .map(([ticker, stats]) => ({
        ticker,
        ...stats,
        winRate: stats.trades > 0 ? (stats.wins / stats.trades) * 100 : 0,
      }))
      .sort((a, b) => b.pnl - a.pnl);
  }, [closedTrades]);

  if (!storeHydrated) {
    return (
      <div className="flex items-center justify-center h-[300px] text-gray-500">
        <span className="animate-pulse">Loading analytics...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <QuickStats summary={portfolioSummary} />

      {openTrades.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="font-medium text-white">
              Open Positions ({openTrades.length})
            </h2>
          </div>
          <div className="card-body grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              label="Total Invested"
              value={formatCurrency(openPositionStats.totalInvested)}
            />
            <Stat
              label="Unrealized P&L"
              value={formatCurrency(openPositionStats.totalUnrealizedPnL)}
              color={openPositionStats.totalUnrealizedPnL >= 0 ? 'profit' : 'loss'}
            />
            <Stat
              label="Unrealized %"
              value={formatPercent(openPositionStats.unrealizedPnLPercent)}
              color={openPositionStats.unrealizedPnLPercent >= 0 ? 'profit' : 'loss'}
            />
            <Stat label="Positions" value={openTrades.length.toString()} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <div className="card-header">
            <h2 className="font-medium text-white">Last 7 Days</h2>
          </div>
          <div className="card-body grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] text-gray-500 uppercase">Trades</div>
              <div className="text-2xl font-bold text-white">{recentPerformance.last7.trades}</div>
            </div>
            <div>
              <div className="text-[10px] text-gray-500 uppercase">Win Rate</div>
              <div
                className={`text-2xl font-bold ${
                  recentPerformance.last7.winRate >= 50 ? 'text-profit' : 'text-loss'
                }`}
              >
                {recentPerformance.last7.winRate.toFixed(0)}%
              </div>
            </div>
            <div className="col-span-2">
              <div className="text-[10px] text-gray-500 uppercase">P&L</div>
              <div
                className={`text-2xl font-bold ${
                  recentPerformance.last7.pnl >= 0 ? 'text-profit' : 'text-loss'
                }`}
              >
                {formatCurrency(recentPerformance.last7.pnl)}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="font-medium text-white">Last 30 Days</h2>
          </div>
          <div className="card-body grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] text-gray-500 uppercase">Trades</div>
              <div className="text-2xl font-bold text-white">{recentPerformance.last30.trades}</div>
            </div>
            <div>
              <div className="text-[10px] text-gray-500 uppercase">Win Rate</div>
              <div
                className={`text-2xl font-bold ${
                  recentPerformance.last30.winRate >= 50 ? 'text-profit' : 'text-loss'
                }`}
              >
                {recentPerformance.last30.winRate.toFixed(0)}%
              </div>
            </div>
            <div className="col-span-2">
              <div className="text-[10px] text-gray-500 uppercase">P&L</div>
              <div
                className={`text-2xl font-bold ${
                  recentPerformance.last30.pnl >= 0 ? 'text-profit' : 'text-loss'
                }`}
              >
                {formatCurrency(recentPerformance.last30.pnl)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {closedTrades.length === 0 ? (
        <div className="card card-body text-center py-12 text-gray-500">
          <p className="mb-1">No closed trades yet</p>
          <p className="text-xs">Complete some trades to see analytics</p>
        </div>
      ) : (
        <>
          {riskMetrics && (
            <div className="card">
              <div className="card-header">
                <h2 className="font-medium text-white">Risk Metrics</h2>
              </div>
              <div className="card-body grid grid-cols-2 lg:grid-cols-6 gap-3">
                <Stat
                  label="Profit Factor"
                  value={
                    riskMetrics.profitFactor === Infinity
                      ? '∞'
                      : riskMetrics.profitFactor.toFixed(2)
                  }
                  color={riskMetrics.profitFactor >= 1 ? 'profit' : 'loss'}
                />
                <Stat
                  label="Expectancy"
                  value={formatCurrency(riskMetrics.expectancy)}
                  color={riskMetrics.expectancy >= 0 ? 'profit' : 'loss'}
                />
                <Stat
                  label="Avg Return"
                  value={formatPercent(riskMetrics.avgReturn)}
                  color={riskMetrics.avgReturn >= 0 ? 'profit' : 'loss'}
                />
                <Stat label="Std Dev" value={`${riskMetrics.stdDev.toFixed(2)}%`} />
                <Stat
                  label="Sharpe"
                  value={riskMetrics.sharpeRatio.toFixed(2)}
                  color={
                    riskMetrics.sharpeRatio >= 1
                      ? 'profit'
                      : riskMetrics.sharpeRatio >= 0
                      ? 'neutral'
                      : 'loss'
                  }
                />
                <Stat
                  label="Max Drawdown"
                  value={formatCurrency(riskMetrics.maxDrawdown)}
                  color="loss"
                />
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-header">
              <h2 className="font-medium text-white">Equity Curve</h2>
            </div>
            <div className="card-body">
              <div className="h-40 flex items-end gap-1">
                {equityCurve.map((p, idx) => {
                  const maxC = Math.max(...equityCurve.map((x) => Math.abs(x.cumulative)));
                  const height = maxC > 0 ? (Math.abs(p.cumulative) / maxC) * 100 : 0;
                  const isPositive = p.cumulative >= 0;
                  return (
                    <div
                      key={idx}
                      className="flex-1 flex flex-col justify-end"
                      title={`${format(p.date, 'MMM dd')}: ${formatCurrency(p.cumulative)}`}
                    >
                      <div
                        className={`w-full rounded-t ${isPositive ? 'bg-profit' : 'bg-loss'}`}
                        style={{
                          height: `${height}%`,
                          minHeight: p.cumulative !== 0 ? '4px' : '0',
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-2 text-xs text-gray-500">
                <span>{equityCurve.length > 0 ? format(equityCurve[0].date, 'MMM dd') : ''}</span>
                <span>
                  Final:{' '}
                  <span
                    className={
                      equityCurve[equityCurve.length - 1]?.cumulative >= 0
                        ? 'text-profit'
                        : 'text-loss'
                    }
                  >
                    {formatCurrency(equityCurve[equityCurve.length - 1]?.cumulative || 0)}
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card">
              <div className="card-header">
                <h2 className="font-medium text-white">Winners vs Losers</h2>
              </div>
              <div className="card-body grid grid-cols-2 gap-3">
                <div className="p-3 bg-profit/10 border border-profit/30 rounded-lg space-y-1.5 text-xs">
                  <div className="text-profit text-sm font-medium mb-1">Winners</div>
                  <Row label="Count" value={winnerLoserComparison.winners.count} />
                  <Row
                    label="Avg Hold"
                    value={formatHoldTime(winnerLoserComparison.winners.avgHoldTime)}
                  />
                  <Row
                    label="Avg Return"
                    value={formatPercent(winnerLoserComparison.winners.avgReturn)}
                  />
                  <Row
                    label="Total P&L"
                    value={formatCurrency(winnerLoserComparison.winners.totalPnL)}
                  />
                </div>
                <div className="p-3 bg-loss/10 border border-loss/30 rounded-lg space-y-1.5 text-xs">
                  <div className="text-loss text-sm font-medium mb-1">Losers</div>
                  <Row label="Count" value={winnerLoserComparison.losers.count} />
                  <Row
                    label="Avg Hold"
                    value={formatHoldTime(winnerLoserComparison.losers.avgHoldTime)}
                  />
                  <Row
                    label="Avg Return"
                    value={formatPercent(winnerLoserComparison.losers.avgReturn)}
                  />
                  <Row
                    label="Total P&L"
                    value={formatCurrency(winnerLoserComparison.losers.totalPnL)}
                  />
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h2 className="font-medium text-white">Performance by Day</h2>
              </div>
              <div className="card-body">
                <div className="grid grid-cols-7 gap-2">
                  {performanceByDay.map((d) => {
                    const maxP = Math.max(...performanceByDay.map((x) => Math.abs(x.pnl)));
                    const h = maxP > 0 ? (Math.abs(d.pnl) / maxP) * 60 : 0;
                    return (
                      <div key={d.shortDay} className="flex flex-col items-center">
                        <div className="h-16 w-full flex items-end justify-center">
                          {d.trades > 0 && (
                            <div
                              className={`w-4 rounded-t ${
                                d.pnl >= 0 ? 'bg-profit' : 'bg-loss'
                              }`}
                              style={{ height: `${h}px`, minHeight: '4px' }}
                              title={`${d.shortDay}: ${formatCurrency(d.pnl)}`}
                            />
                          )}
                        </div>
                        <span className="text-[10px] text-gray-500 mt-1">{d.shortDay}</span>
                        <span className="text-[10px] font-mono text-gray-400">{d.trades}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h2 className="font-medium text-white">Performance by Hour</h2>
              </div>
              <div className="card-body">
                <div className="grid grid-cols-8 gap-2">
                  {performanceByHour.map((h) => {
                    const maxP = Math.max(...performanceByHour.map((x) => Math.abs(x.pnl)));
                    const height = maxP > 0 ? (Math.abs(h.pnl) / maxP) * 60 : 0;
                    return (
                      <div key={h.hour} className="flex flex-col items-center">
                        <div className="h-16 w-full flex items-end justify-center">
                          {h.trades > 0 && (
                            <div
                              className={`w-4 rounded-t ${
                                h.pnl >= 0 ? 'bg-profit' : 'bg-loss'
                              }`}
                              style={{ height: `${height}px`, minHeight: '4px' }}
                              title={`${h.hour}:00: ${formatCurrency(h.pnl)}`}
                            />
                          )}
                        </div>
                        <span className="text-[10px] text-gray-500 mt-1">{h.hour}</span>
                        <span className="text-[10px] font-mono text-gray-400">{h.trades}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h2 className="font-medium text-white">Performance by Ticker</h2>
              </div>
              {tickerPerformance.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Ticker</th>
                        <th>Trades</th>
                        <th>Win Rate</th>
                        <th>Total P&L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tickerPerformance.map((it) => (
                        <tr key={it.ticker}>
                          <td className="font-medium text-white">{it.ticker}</td>
                          <td className="font-mono">{it.trades}</td>
                          <td
                            className={`font-mono ${
                              it.winRate >= 50 ? 'text-profit' : 'text-loss'
                            }`}
                          >
                            {it.winRate.toFixed(0)}%
                          </td>
                          <td
                            className={`font-mono ${it.pnl >= 0 ? 'text-profit' : 'text-loss'}`}
                          >
                            {formatCurrency(it.pnl)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="card-body text-center text-gray-500 py-4">No data</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: 'profit' | 'loss' | 'neutral';
}) {
  const cls =
    color === 'profit'
      ? 'text-profit'
      : color === 'loss'
      ? 'text-loss'
      : color === 'neutral'
      ? 'text-neutral'
      : 'text-white';
  return (
    <div className="p-3 bg-white/[0.03] border border-white/5 rounded-lg">
      <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-bold font-mono mt-0.5 ${cls}`}>{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-400">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
