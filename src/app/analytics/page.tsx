'use client';

import { useMemo } from 'react';
import { MainLayout } from '@/components/Layout';
import { QuickStats } from '@/components/Dashboard';
import { useTradeStore } from '@/store';
import {
  calculatePortfolioSummary,
  formatCurrency,
  formatPercent,
  formatHoldTime,
  calculateHoldTime,
  isWinningTrade,
} from '@/lib/calculations';
import { Trade } from '@/types';
import { format, getDay, getHours, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';

export default function AnalyticsPage() {
  const trades = useTradeStore((state) => state.trades);
  const closedTrades = useMemo(() => trades.filter(t => t.status === 'closed'), [trades]);

  const portfolioSummary = useMemo(() => calculatePortfolioSummary(trades), [trades]);

  // Performance by day of week
  const performanceByDay = useMemo(() => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayData: { day: string; trades: number; wins: number; pnl: number }[] = days.map(day => ({
      day,
      trades: 0,
      wins: 0,
      pnl: 0,
    }));

    closedTrades.forEach(trade => {
      const dayOfWeek = getDay(new Date(trade.closedAt || trade.createdAt));
      dayData[dayOfWeek].trades++;
      dayData[dayOfWeek].pnl += trade.realizedPnL;
      if (isWinningTrade(trade)) dayData[dayOfWeek].wins++;
    });

    return dayData.filter(d => d.trades > 0);
  }, [closedTrades]);

  // Performance by hour of day
  const performanceByHour = useMemo(() => {
    const hourData: { hour: number; trades: number; wins: number; pnl: number }[] = [];

    for (let i = 0; i < 24; i++) {
      hourData.push({ hour: i, trades: 0, wins: 0, pnl: 0 });
    }

    closedTrades.forEach(trade => {
      const hour = getHours(new Date(trade.createdAt));
      hourData[hour].trades++;
      hourData[hour].pnl += trade.realizedPnL;
      if (isWinningTrade(trade)) hourData[hour].wins++;
    });

    return hourData.filter(d => d.trades > 0);
  }, [closedTrades]);

  // Return distribution
  const returnDistribution = useMemo(() => {
    const ranges = [
      { min: -Infinity, max: -5, label: '< -5%' },
      { min: -5, max: -2, label: '-5% to -2%' },
      { min: -2, max: 0, label: '-2% to 0%' },
      { min: 0, max: 1, label: '0% to 1%' },
      { min: 1, max: 1.5, label: '1% to 1.5%' },
      { min: 1.5, max: 2, label: '1.5% to 2%' },
      { min: 2, max: 5, label: '2% to 5%' },
      { min: 5, max: Infinity, label: '> 5%' },
    ];

    return ranges.map(range => {
      const count = closedTrades.filter(trade => {
        const totalCost = trade.entries.reduce((sum, e) => sum + e.price * e.shares, 0);
        const returnPct = totalCost > 0 ? (trade.realizedPnL / totalCost) * 100 : 0;
        return returnPct >= range.min && returnPct < range.max;
      }).length;

      return { range: range.label, count };
    }).filter(d => d.count > 0);
  }, [closedTrades]);

  // DCA analysis
  const dcaAnalysis = useMemo(() => {
    const byEntryCount: { entries: number; trades: number; wins: number; avgHoldTime: number; avgReturn: number }[] = [];

    closedTrades.forEach(trade => {
      const entryCount = trade.entries.length;
      let bucket = byEntryCount.find(b => b.entries === entryCount);

      if (!bucket) {
        bucket = { entries: entryCount, trades: 0, wins: 0, avgHoldTime: 0, avgReturn: 0 };
        byEntryCount.push(bucket);
      }

      bucket.trades++;
      if (isWinningTrade(trade)) bucket.wins++;

      const holdTime = calculateHoldTime(trade);
      bucket.avgHoldTime = (bucket.avgHoldTime * (bucket.trades - 1) + holdTime) / bucket.trades;

      const totalCost = trade.entries.reduce((sum, e) => sum + e.price * e.shares, 0);
      const returnPct = totalCost > 0 ? (trade.realizedPnL / totalCost) * 100 : 0;
      bucket.avgReturn = (bucket.avgReturn * (bucket.trades - 1) + returnPct) / bucket.trades;
    });

    return byEntryCount.sort((a, b) => a.entries - b.entries);
  }, [closedTrades]);

  // Winners vs Losers comparison
  const winnerLoserComparison = useMemo(() => {
    const winners = closedTrades.filter(isWinningTrade);
    const losers = closedTrades.filter(t => !isWinningTrade(t));

    const avgWinnerHoldTime = winners.length > 0
      ? winners.reduce((sum, t) => sum + calculateHoldTime(t), 0) / winners.length
      : 0;

    const avgLoserHoldTime = losers.length > 0
      ? losers.reduce((sum, t) => sum + calculateHoldTime(t), 0) / losers.length
      : 0;

    const avgWinnerReturn = winners.length > 0
      ? winners.reduce((sum, t) => {
        const cost = t.entries.reduce((s, e) => s + e.price * e.shares, 0);
        return sum + (cost > 0 ? (t.realizedPnL / cost) * 100 : 0);
      }, 0) / winners.length
      : 0;

    const avgLoserReturn = losers.length > 0
      ? losers.reduce((sum, t) => {
        const cost = t.entries.reduce((s, e) => s + e.price * e.shares, 0);
        return sum + (cost > 0 ? (t.realizedPnL / cost) * 100 : 0);
      }, 0) / losers.length
      : 0;

    return {
      winners: {
        count: winners.length,
        avgHoldTime: avgWinnerHoldTime,
        avgReturn: avgWinnerReturn,
        totalPnL: winners.reduce((sum, t) => sum + t.realizedPnL, 0),
      },
      losers: {
        count: losers.length,
        avgHoldTime: avgLoserHoldTime,
        avgReturn: avgLoserReturn,
        totalPnL: losers.reduce((sum, t) => sum + t.realizedPnL, 0),
      },
    };
  }, [closedTrades]);

  // Equity curve data
  const equityCurve = useMemo(() => {
    const sorted = [...closedTrades].sort(
      (a, b) => new Date(a.closedAt || a.createdAt).getTime() - new Date(b.closedAt || b.createdAt).getTime()
    );

    let cumulative = 0;
    return sorted.map(trade => {
      cumulative += trade.realizedPnL;
      return {
        date: new Date(trade.closedAt || trade.createdAt),
        pnl: trade.realizedPnL,
        cumulative,
      };
    });
  }, [closedTrades]);

  return (
    <MainLayout>
      <h1 className="text-2xl font-bold text-white mb-6">Analytics</h1>

      {/* Quick Stats */}
      <div className="mb-6">
        <QuickStats summary={portfolioSummary} />
      </div>

      {closedTrades.length === 0 ? (
        <div className="card">
          <div className="card-body text-center py-12 text-gray-500">
            <p className="mb-2">No closed trades yet</p>
            <p className="text-sm">Complete some trades to see your performance analytics.</p>
          </div>
        </div>
      ) : (
        <>
          {/* Equity Curve */}
          <div className="card mb-6">
            <div className="card-header">
              <h2 className="font-medium text-white">Equity Curve</h2>
            </div>
            <div className="card-body">
              <div className="h-48 flex items-end gap-1">
                {equityCurve.map((point, index) => {
                  const maxCumulative = Math.max(...equityCurve.map(p => Math.abs(p.cumulative)));
                  const height = maxCumulative > 0 ? (Math.abs(point.cumulative) / maxCumulative) * 100 : 0;
                  const isPositive = point.cumulative >= 0;

                  return (
                    <div
                      key={index}
                      className="flex-1 flex flex-col justify-end"
                      title={`${format(point.date, 'MMM dd')}: ${formatCurrency(point.cumulative)}`}
                    >
                      <div
                        className={`w-full rounded-t ${isPositive ? 'bg-profit' : 'bg-loss'}`}
                        style={{ height: `${height}%`, minHeight: point.cumulative !== 0 ? '4px' : '0' }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-2 text-xs text-gray-500">
                <span>{equityCurve.length > 0 ? format(equityCurve[0].date, 'MMM dd') : ''}</span>
                <span>
                  Final: <span className={equityCurve[equityCurve.length - 1]?.cumulative >= 0 ? 'text-profit' : 'text-loss'}>
                    {formatCurrency(equityCurve[equityCurve.length - 1]?.cumulative || 0)}
                  </span>
                </span>
                <span>{equityCurve.length > 0 ? format(equityCurve[equityCurve.length - 1].date, 'MMM dd') : ''}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Winners vs Losers */}
            <div className="card">
              <div className="card-header">
                <h2 className="font-medium text-white">Winners vs Losers</h2>
              </div>
              <div className="card-body">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-profit/10 border border-profit/30 rounded-lg">
                    <h3 className="text-sm text-profit mb-2">Winners</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Count</span>
                        <span className="font-mono">{winnerLoserComparison.winners.count}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Avg Hold</span>
                        <span className="font-mono">{formatHoldTime(winnerLoserComparison.winners.avgHoldTime)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Avg Return</span>
                        <span className="font-mono text-profit">{formatPercent(winnerLoserComparison.winners.avgReturn)}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-profit/30">
                        <span className="text-gray-400">Total P&L</span>
                        <span className="font-mono text-profit">{formatCurrency(winnerLoserComparison.winners.totalPnL)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-loss/10 border border-loss/30 rounded-lg">
                    <h3 className="text-sm text-loss mb-2">Losers</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Count</span>
                        <span className="font-mono">{winnerLoserComparison.losers.count}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Avg Hold</span>
                        <span className="font-mono">{formatHoldTime(winnerLoserComparison.losers.avgHoldTime)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Avg Return</span>
                        <span className="font-mono text-loss">{formatPercent(winnerLoserComparison.losers.avgReturn)}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-loss/30">
                        <span className="text-gray-400">Total P&L</span>
                        <span className="font-mono text-loss">{formatCurrency(winnerLoserComparison.losers.totalPnL)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Return Distribution */}
            <div className="card">
              <div className="card-header">
                <h2 className="font-medium text-white">Return Distribution</h2>
              </div>
              <div className="card-body">
                {returnDistribution.length > 0 ? (
                  <div className="space-y-2">
                    {returnDistribution.map((bucket) => {
                      const maxCount = Math.max(...returnDistribution.map(b => b.count));
                      const width = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0;
                      const isNegative = bucket.range.includes('-');

                      return (
                        <div key={bucket.range} className="flex items-center gap-3">
                          <span className="text-xs text-gray-500 w-24">{bucket.range}</span>
                          <div className="flex-1 h-6 bg-dark-border rounded overflow-hidden">
                            <div
                              className={`h-full ${isNegative ? 'bg-loss' : 'bg-profit'} rounded`}
                              style={{ width: `${width}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono w-8 text-right">{bucket.count}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-center text-gray-500">No data</p>
                )}
              </div>
            </div>

            {/* Performance by Day of Week */}
            <div className="card">
              <div className="card-header">
                <h2 className="font-medium text-white">Performance by Day</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Trades</th>
                      <th>Win Rate</th>
                      <th>P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {performanceByDay.map((day) => (
                      <tr key={day.day}>
                        <td>{day.day}</td>
                        <td className="font-mono">{day.trades}</td>
                        <td className="font-mono">{day.trades > 0 ? `${((day.wins / day.trades) * 100).toFixed(0)}%` : '--'}</td>
                        <td className={`font-mono ${day.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                          {formatCurrency(day.pnl)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Performance by Hour */}
            <div className="card">
              <div className="card-header">
                <h2 className="font-medium text-white">Performance by Hour</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Hour</th>
                      <th>Trades</th>
                      <th>Win Rate</th>
                      <th>P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {performanceByHour.map((hour) => (
                      <tr key={hour.hour}>
                        <td>{`${hour.hour.toString().padStart(2, '0')}:00`}</td>
                        <td className="font-mono">{hour.trades}</td>
                        <td className="font-mono">{hour.trades > 0 ? `${((hour.wins / hour.trades) * 100).toFixed(0)}%` : '--'}</td>
                        <td className={`font-mono ${hour.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                          {formatCurrency(hour.pnl)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* DCA Analysis */}
            <div className="card lg:col-span-2">
              <div className="card-header">
                <h2 className="font-medium text-white">DCA Entry Analysis</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th># of Entries</th>
                      <th>Trades</th>
                      <th>Win Rate</th>
                      <th>Avg Hold Time</th>
                      <th>Avg Return</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dcaAnalysis.map((bucket) => (
                      <tr key={bucket.entries}>
                        <td className="font-mono">{bucket.entries}</td>
                        <td className="font-mono">{bucket.trades}</td>
                        <td className="font-mono">{bucket.trades > 0 ? `${((bucket.wins / bucket.trades) * 100).toFixed(0)}%` : '--'}</td>
                        <td className="font-mono">{formatHoldTime(bucket.avgHoldTime)}</td>
                        <td className={`font-mono ${bucket.avgReturn >= 0 ? 'text-profit' : 'text-loss'}`}>
                          {formatPercent(bucket.avgReturn)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </MainLayout>
  );
}
