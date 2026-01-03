'use client';

import { useMemo } from 'react';
import { MainLayout } from '@/components/Layout';
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

export default function AnalyticsPage() {
  const storeHydrated = useStoreHydration();
  const trades = useTradeStore((state) => state.trades);
  const prices = usePriceStore((state) => state.prices);

  const openTrades = useMemo(() => trades.filter(t => t.status === 'open'), [trades]);
  const closedTrades = useMemo(() => trades.filter(t => t.status === 'closed'), [trades]);

  const portfolioSummary = useMemo(() => calculatePortfolioSummary(trades), [trades]);

  // Calculate real-time unrealized P&L for open positions
  const openPositionStats = useMemo(() => {
    let totalUnrealizedPnL = 0;
    let totalInvested = 0;

    openTrades.forEach(trade => {
      const currentPrice = prices[trade.ticker]?.price || trade.avgCost;
      const unrealized = calculateUnrealizedPnL(trade, currentPrice);
      totalUnrealizedPnL += unrealized;
      totalInvested += trade.avgCost * trade.totalShares;
    });

    return {
      totalUnrealizedPnL,
      totalInvested,
      unrealizedPnLPercent: totalInvested > 0 ? (totalUnrealizedPnL / totalInvested) * 100 : 0,
    };
  }, [openTrades, prices]);

  // Performance by day of week
  const performanceByDay = useMemo(() => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayData: { day: string; shortDay: string; trades: number; wins: number; pnl: number }[] = days.map((day, i) => ({
      day,
      shortDay: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i],
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

    return dayData;
  }, [closedTrades]);

  // Performance by hour of day (trading hours)
  const performanceByHour = useMemo(() => {
    const hourData: { hour: number; trades: number; wins: number; pnl: number }[] = [];

    // Focus on market hours (9:30 AM - 4:00 PM ET -> 9-16)
    for (let i = 9; i <= 16; i++) {
      hourData.push({ hour: i, trades: 0, wins: 0, pnl: 0 });
    }

    closedTrades.forEach(trade => {
      const hour = getHours(new Date(trade.createdAt));
      const bucket = hourData.find(h => h.hour === hour);
      if (bucket) {
        bucket.trades++;
        bucket.pnl += trade.realizedPnL;
        if (isWinningTrade(trade)) bucket.wins++;
      }
    });

    return hourData;
  }, [closedTrades]);

  // Return distribution
  const returnDistribution = useMemo(() => {
    const ranges = [
      { min: -Infinity, max: -5, label: '< -5%', color: 'bg-red-600' },
      { min: -5, max: -2, label: '-5% to -2%', color: 'bg-red-500' },
      { min: -2, max: 0, label: '-2% to 0%', color: 'bg-red-400' },
      { min: 0, max: 1, label: '0% to 1%', color: 'bg-green-400' },
      { min: 1, max: 1.5, label: '1% to 1.5%', color: 'bg-green-500' },
      { min: 1.5, max: 2, label: '1.5% to 2%', color: 'bg-green-600' },
      { min: 2, max: 5, label: '2% to 5%', color: 'bg-green-700' },
      { min: 5, max: Infinity, label: '> 5%', color: 'bg-green-800' },
    ];

    return ranges.map(range => {
      const count = closedTrades.filter(trade => {
        const totalCost = trade.entries.reduce((sum, e) => sum + e.price * e.shares, 0);
        const returnPct = totalCost > 0 ? (trade.realizedPnL / totalCost) * 100 : 0;
        return returnPct >= range.min && returnPct < range.max;
      }).length;

      return { ...range, count };
    });
  }, [closedTrades]);

  // DCA analysis
  const dcaAnalysis = useMemo(() => {
    const byEntryCount: { entries: number; trades: number; wins: number; avgHoldTime: number; avgReturn: number; totalPnL: number }[] = [];

    closedTrades.forEach(trade => {
      const entryCount = trade.entries.length;
      let bucket = byEntryCount.find(b => b.entries === entryCount);

      if (!bucket) {
        bucket = { entries: entryCount, trades: 0, wins: 0, avgHoldTime: 0, avgReturn: 0, totalPnL: 0 };
        byEntryCount.push(bucket);
      }

      bucket.trades++;
      bucket.totalPnL += trade.realizedPnL;
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

    const getStats = (trades: Trade[]) => {
      if (trades.length === 0) return { count: 0, avgHoldTime: 0, avgReturn: 0, totalPnL: 0, avgPnL: 0 };

      const totalPnL = trades.reduce((sum, t) => sum + t.realizedPnL, 0);
      const avgHoldTime = trades.reduce((sum, t) => sum + calculateHoldTime(t), 0) / trades.length;
      const avgReturn = trades.reduce((sum, t) => {
        const cost = t.entries.reduce((s, e) => s + e.price * e.shares, 0);
        return sum + (cost > 0 ? (t.realizedPnL / cost) * 100 : 0);
      }, 0) / trades.length;

      return { count: trades.length, avgHoldTime, avgReturn, totalPnL, avgPnL: totalPnL / trades.length };
    };

    return { winners: getStats(winners), losers: getStats(losers) };
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

  // Recent performance (last 7 days, 30 days)
  const recentPerformance = useMemo(() => {
    const now = new Date();
    const last7 = closedTrades.filter(t => isAfter(new Date(t.closedAt || t.createdAt), subDays(now, 7)));
    const last30 = closedTrades.filter(t => isAfter(new Date(t.closedAt || t.createdAt), subDays(now, 30)));

    const calcStats = (trades: Trade[]) => ({
      trades: trades.length,
      wins: trades.filter(isWinningTrade).length,
      winRate: trades.length > 0 ? (trades.filter(isWinningTrade).length / trades.length) * 100 : 0,
      pnl: trades.reduce((sum, t) => sum + t.realizedPnL, 0),
    });

    return {
      last7: calcStats(last7),
      last30: calcStats(last30),
    };
  }, [closedTrades]);

  // Risk metrics
  const riskMetrics = useMemo(() => {
    if (closedTrades.length === 0) return null;

    const returns = closedTrades.map(t => {
      const cost = t.entries.reduce((s, e) => s + e.price * e.shares, 0);
      return cost > 0 ? (t.realizedPnL / cost) * 100 : 0;
    });

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // Max drawdown
    let peak = 0;
    let maxDrawdown = 0;
    let cumulative = 0;
    for (const trade of [...closedTrades].sort((a, b) =>
      new Date(a.closedAt || a.createdAt).getTime() - new Date(b.closedAt || b.createdAt).getTime()
    )) {
      cumulative += trade.realizedPnL;
      if (cumulative > peak) peak = cumulative;
      const drawdown = peak - cumulative;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    // Profit factor (gross profit / gross loss)
    const grossProfit = closedTrades.filter(isWinningTrade).reduce((sum, t) => sum + t.realizedPnL, 0);
    const grossLoss = Math.abs(closedTrades.filter(t => !isWinningTrade(t)).reduce((sum, t) => sum + t.realizedPnL, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Expectancy
    const expectancy = portfolioSummary.winRate > 0
      ? (portfolioSummary.winRate / 100 * winnerLoserComparison.winners.avgPnL) +
        ((100 - portfolioSummary.winRate) / 100 * winnerLoserComparison.losers.avgPnL)
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

  // Ticker performance breakdown
  const tickerPerformance = useMemo(() => {
    const byTicker: Record<string, { trades: number; wins: number; pnl: number }> = {};

    closedTrades.forEach(trade => {
      if (!byTicker[trade.ticker]) {
        byTicker[trade.ticker] = { trades: 0, wins: 0, pnl: 0 };
      }
      byTicker[trade.ticker].trades++;
      byTicker[trade.ticker].pnl += trade.realizedPnL;
      if (isWinningTrade(trade)) byTicker[trade.ticker].wins++;
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
      <MainLayout>
        <div className="flex items-center justify-center h-[400px] text-gray-500">
          <span className="animate-pulse">Loading analytics...</span>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <h1 className="text-2xl font-bold text-white mb-6">Analytics</h1>

      {/* Quick Stats */}
      <div className="mb-6">
        <QuickStats summary={portfolioSummary} />
      </div>

      {/* Open Positions Summary */}
      {openTrades.length > 0 && (
        <div className="card mb-6">
          <div className="card-header">
            <h2 className="font-medium text-white">Open Positions ({openTrades.length})</h2>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-dark-bg rounded-lg">
                <div className="text-xs text-gray-500">Total Invested</div>
                <div className="text-xl font-bold font-mono text-white">
                  {formatCurrency(openPositionStats.totalInvested)}
                </div>
              </div>
              <div className="p-4 bg-dark-bg rounded-lg">
                <div className="text-xs text-gray-500">Unrealized P&L</div>
                <div className={`text-xl font-bold font-mono ${openPositionStats.totalUnrealizedPnL >= 0 ? 'text-profit' : 'text-loss'}`}>
                  {formatCurrency(openPositionStats.totalUnrealizedPnL)}
                </div>
              </div>
              <div className="p-4 bg-dark-bg rounded-lg">
                <div className="text-xs text-gray-500">Unrealized Return</div>
                <div className={`text-xl font-bold font-mono ${openPositionStats.unrealizedPnLPercent >= 0 ? 'text-profit' : 'text-loss'}`}>
                  {formatPercent(openPositionStats.unrealizedPnLPercent)}
                </div>
              </div>
              <div className="p-4 bg-dark-bg rounded-lg">
                <div className="text-xs text-gray-500">Positions</div>
                <div className="text-xl font-bold font-mono text-white">
                  {openTrades.length}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <div className="card-header">
            <h2 className="font-medium text-white">Last 7 Days</h2>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500">Trades</div>
                <div className="text-2xl font-bold text-white">{recentPerformance.last7.trades}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Win Rate</div>
                <div className={`text-2xl font-bold ${recentPerformance.last7.winRate >= 50 ? 'text-profit' : 'text-loss'}`}>
                  {recentPerformance.last7.winRate.toFixed(0)}%
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-gray-500">P&L</div>
                <div className={`text-2xl font-bold ${recentPerformance.last7.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                  {formatCurrency(recentPerformance.last7.pnl)}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="font-medium text-white">Last 30 Days</h2>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500">Trades</div>
                <div className="text-2xl font-bold text-white">{recentPerformance.last30.trades}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Win Rate</div>
                <div className={`text-2xl font-bold ${recentPerformance.last30.winRate >= 50 ? 'text-profit' : 'text-loss'}`}>
                  {recentPerformance.last30.winRate.toFixed(0)}%
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-gray-500">P&L</div>
                <div className={`text-2xl font-bold ${recentPerformance.last30.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                  {formatCurrency(recentPerformance.last30.pnl)}
                </div>
              </div>
            </div>
          </div>
        </div>
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
          {/* Risk Metrics */}
          {riskMetrics && (
            <div className="card mb-6">
              <div className="card-header">
                <h2 className="font-medium text-white">Risk Metrics</h2>
              </div>
              <div className="card-body">
                <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
                  <div className="p-3 bg-dark-bg rounded-lg">
                    <div className="text-xs text-gray-500">Profit Factor</div>
                    <div className={`text-lg font-bold font-mono ${riskMetrics.profitFactor >= 1 ? 'text-profit' : 'text-loss'}`}>
                      {riskMetrics.profitFactor === Infinity ? '∞' : riskMetrics.profitFactor.toFixed(2)}
                    </div>
                  </div>
                  <div className="p-3 bg-dark-bg rounded-lg">
                    <div className="text-xs text-gray-500">Expectancy</div>
                    <div className={`text-lg font-bold font-mono ${riskMetrics.expectancy >= 0 ? 'text-profit' : 'text-loss'}`}>
                      {formatCurrency(riskMetrics.expectancy)}
                    </div>
                  </div>
                  <div className="p-3 bg-dark-bg rounded-lg">
                    <div className="text-xs text-gray-500">Avg Return</div>
                    <div className={`text-lg font-bold font-mono ${riskMetrics.avgReturn >= 0 ? 'text-profit' : 'text-loss'}`}>
                      {formatPercent(riskMetrics.avgReturn)}
                    </div>
                  </div>
                  <div className="p-3 bg-dark-bg rounded-lg">
                    <div className="text-xs text-gray-500">Std Dev</div>
                    <div className="text-lg font-bold font-mono text-white">
                      {riskMetrics.stdDev.toFixed(2)}%
                    </div>
                  </div>
                  <div className="p-3 bg-dark-bg rounded-lg">
                    <div className="text-xs text-gray-500">Sharpe Ratio</div>
                    <div className={`text-lg font-bold font-mono ${riskMetrics.sharpeRatio >= 1 ? 'text-profit' : riskMetrics.sharpeRatio >= 0 ? 'text-neutral' : 'text-loss'}`}>
                      {riskMetrics.sharpeRatio.toFixed(2)}
                    </div>
                  </div>
                  <div className="p-3 bg-dark-bg rounded-lg">
                    <div className="text-xs text-gray-500">Max Drawdown</div>
                    <div className="text-lg font-bold font-mono text-loss">
                      {formatCurrency(riskMetrics.maxDrawdown)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

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
                      <div className="flex justify-between">
                        <span className="text-gray-400">Avg P&L</span>
                        <span className="font-mono text-profit">{formatCurrency(winnerLoserComparison.winners.avgPnL)}</span>
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
                      <div className="flex justify-between">
                        <span className="text-gray-400">Avg P&L</span>
                        <span className="font-mono text-loss">{formatCurrency(winnerLoserComparison.losers.avgPnL)}</span>
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
                <div className="space-y-2">
                  {returnDistribution.map((bucket) => {
                    const maxCount = Math.max(...returnDistribution.map(b => b.count));
                    const width = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0;

                    return (
                      <div key={bucket.label} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-24">{bucket.label}</span>
                        <div className="flex-1 h-6 bg-dark-border rounded overflow-hidden">
                          <div
                            className={`h-full ${bucket.color} rounded`}
                            style={{ width: `${width}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono w-8 text-right">{bucket.count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Performance by Day of Week */}
            <div className="card">
              <div className="card-header">
                <h2 className="font-medium text-white">Performance by Day</h2>
              </div>
              <div className="card-body">
                <div className="grid grid-cols-7 gap-2">
                  {performanceByDay.map((day) => {
                    const maxPnL = Math.max(...performanceByDay.map(d => Math.abs(d.pnl)));
                    const height = maxPnL > 0 ? (Math.abs(day.pnl) / maxPnL) * 60 : 0;

                    return (
                      <div key={day.day} className="flex flex-col items-center">
                        <div className="h-16 w-full flex items-end justify-center">
                          {day.trades > 0 && (
                            <div
                              className={`w-4 rounded-t ${day.pnl >= 0 ? 'bg-profit' : 'bg-loss'}`}
                              style={{ height: `${height}px`, minHeight: '4px' }}
                              title={`${day.day}: ${formatCurrency(day.pnl)}`}
                            />
                          )}
                        </div>
                        <span className="text-xs text-gray-500 mt-1">{day.shortDay}</span>
                        <span className="text-xs font-mono text-gray-400">{day.trades}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Performance by Hour */}
            <div className="card">
              <div className="card-header">
                <h2 className="font-medium text-white">Performance by Hour</h2>
              </div>
              <div className="card-body">
                <div className="grid grid-cols-8 gap-2">
                  {performanceByHour.map((hour) => {
                    const maxPnL = Math.max(...performanceByHour.map(h => Math.abs(h.pnl)));
                    const height = maxPnL > 0 ? (Math.abs(hour.pnl) / maxPnL) * 60 : 0;

                    return (
                      <div key={hour.hour} className="flex flex-col items-center">
                        <div className="h-16 w-full flex items-end justify-center">
                          {hour.trades > 0 && (
                            <div
                              className={`w-4 rounded-t ${hour.pnl >= 0 ? 'bg-profit' : 'bg-loss'}`}
                              style={{ height: `${height}px`, minHeight: '4px' }}
                              title={`${hour.hour}:00: ${formatCurrency(hour.pnl)}`}
                            />
                          )}
                        </div>
                        <span className="text-xs text-gray-500 mt-1">{hour.hour}</span>
                        <span className="text-xs font-mono text-gray-400">{hour.trades}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* DCA Analysis */}
            <div className="card">
              <div className="card-header">
                <h2 className="font-medium text-white">DCA Entry Analysis</h2>
              </div>
              {dcaAnalysis.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th># Entries</th>
                        <th>Trades</th>
                        <th>Win Rate</th>
                        <th>Avg Hold</th>
                        <th>Avg Return</th>
                        <th>Total P&L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dcaAnalysis.map((bucket) => (
                        <tr key={bucket.entries}>
                          <td className="font-mono">{bucket.entries}</td>
                          <td className="font-mono">{bucket.trades}</td>
                          <td className={`font-mono ${bucket.trades > 0 && (bucket.wins / bucket.trades) >= 0.5 ? 'text-profit' : 'text-loss'}`}>
                            {bucket.trades > 0 ? `${((bucket.wins / bucket.trades) * 100).toFixed(0)}%` : '--'}
                          </td>
                          <td className="font-mono">{formatHoldTime(bucket.avgHoldTime)}</td>
                          <td className={`font-mono ${bucket.avgReturn >= 0 ? 'text-profit' : 'text-loss'}`}>
                            {formatPercent(bucket.avgReturn)}
                          </td>
                          <td className={`font-mono ${bucket.totalPnL >= 0 ? 'text-profit' : 'text-loss'}`}>
                            {formatCurrency(bucket.totalPnL)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="card-body text-center text-gray-500 py-4">
                  No data available
                </div>
              )}
            </div>

            {/* Ticker Performance */}
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
                      {tickerPerformance.map((item) => (
                        <tr key={item.ticker}>
                          <td className="font-medium text-white">{item.ticker}</td>
                          <td className="font-mono">{item.trades}</td>
                          <td className={`font-mono ${item.winRate >= 50 ? 'text-profit' : 'text-loss'}`}>
                            {item.winRate.toFixed(0)}%
                          </td>
                          <td className={`font-mono ${item.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                            {formatCurrency(item.pnl)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="card-body text-center text-gray-500 py-4">
                  No data available
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </MainLayout>
  );
}
