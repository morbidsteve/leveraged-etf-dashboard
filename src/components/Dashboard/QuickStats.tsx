'use client';

import { PortfolioSummary } from '@/types';
import { formatCurrency, formatPercent, formatHoldTime } from '@/lib/calculations';
import StatCard from './StatCard';

interface QuickStatsProps {
  summary: PortfolioSummary;
}

export default function QuickStats({ summary }: QuickStatsProps) {
  // Show different stats based on whether there are trades
  const hasOpenTrades = summary.openTrades > 0;
  const hasClosedTrades = summary.closedTrades > 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Total Trades"
        value={summary.totalTrades}
        subValue={hasClosedTrades
          ? `${summary.winningTrades}W / ${summary.losingTrades}L`
          : hasOpenTrades
            ? `${summary.openTrades} open`
            : undefined}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        }
      />

      <StatCard
        label="Win Rate"
        value={hasClosedTrades ? `${summary.winRate.toFixed(1)}%` : '0.0%'}
        subValue={summary.currentStreak > 0 ? `${summary.currentStreak} streak` : undefined}
        trend={hasClosedTrades ? (summary.winRate >= 60 ? 'up' : summary.winRate < 40 ? 'down' : 'neutral') : 'neutral'}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      />

      <StatCard
        label="Total Profit"
        value={formatCurrency(summary.totalProfit)}
        subValue={hasClosedTrades ? `Avg: ${formatPercent(summary.avgReturnPercent)}` : undefined}
        trend={summary.totalProfit > 0 ? 'up' : summary.totalProfit < 0 ? 'down' : 'neutral'}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      />

      <StatCard
        label="Avg Hold Time"
        value={hasClosedTrades ? formatHoldTime(summary.avgHoldTimeHours) : '0m'}
        subValue={summary.bestTrade ? `Best: ${formatCurrency(summary.bestTrade.realizedPnL)}` : 'Best: N/A'}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      />
    </div>
  );
}
