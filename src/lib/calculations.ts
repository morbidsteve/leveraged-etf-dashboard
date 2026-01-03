import { Trade, TradeEntry, DCACalculation, OpenPosition, PortfolioSummary } from '@/types';
import { differenceInHours, differenceInMinutes } from 'date-fns';

/**
 * Calculate average cost basis from trade entries
 */
export function calculateAvgCost(entries: TradeEntry[]): number {
  if (entries.length === 0) return 0;

  const totalCost = entries.reduce((sum, entry) => sum + entry.price * entry.shares, 0);
  const totalShares = entries.reduce((sum, entry) => sum + entry.shares, 0);

  return totalShares > 0 ? totalCost / totalShares : 0;
}

/**
 * Calculate total shares from entries minus exits
 */
export function calculateTotalShares(trade: Trade): number {
  const totalBought = trade.entries.reduce((sum, e) => sum + e.shares, 0);
  const totalSold = trade.exits.reduce((sum, e) => sum + e.shares, 0);
  return totalBought - totalSold;
}

/**
 * Calculate realized P&L from closed portions
 */
export function calculateRealizedPnL(trade: Trade): number {
  if (trade.exits.length === 0) return 0;

  // Use FIFO method for calculating realized P&L
  const entries = [...trade.entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const exits = [...trade.exits].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let realizedPnL = 0;
  let entryIndex = 0;
  let entrySharesRemaining = entries[0]?.shares || 0;

  for (const exit of exits) {
    let exitSharesRemaining = exit.shares;

    while (exitSharesRemaining > 0 && entryIndex < entries.length) {
      const sharesToMatch = Math.min(exitSharesRemaining, entrySharesRemaining);
      const pnl = (exit.price - entries[entryIndex].price) * sharesToMatch;
      realizedPnL += pnl;

      exitSharesRemaining -= sharesToMatch;
      entrySharesRemaining -= sharesToMatch;

      if (entrySharesRemaining === 0) {
        entryIndex++;
        entrySharesRemaining = entries[entryIndex]?.shares || 0;
      }
    }
  }

  return realizedPnL;
}

/**
 * Calculate unrealized P&L from open portions
 */
export function calculateUnrealizedPnL(trade: Trade, currentPrice: number): number {
  const openShares = calculateTotalShares(trade);
  if (openShares <= 0) return 0;

  return (currentPrice - trade.avgCost) * openShares;
}

/**
 * Calculate profit targets (1.5% and 2%)
 */
export function calculateProfitTargets(avgCost: number): { target15: number; target20: number } {
  return {
    target15: avgCost * 1.015,
    target20: avgCost * 1.02,
  };
}

/**
 * Calculate DCA result
 */
export function calculateDCA(input: Omit<DCACalculation, 'resultShares' | 'resultAvgCost' | 'resultTarget15' | 'resultTarget20' | 'totalInvested'>): DCACalculation {
  const resultShares = input.currentShares + input.newShares;
  const currentInvested = input.currentShares * input.currentAvgCost;
  const newInvested = input.newShares * input.newPrice;
  const totalInvested = currentInvested + newInvested;
  const resultAvgCost = resultShares > 0 ? totalInvested / resultShares : 0;

  const targets = calculateProfitTargets(resultAvgCost);

  return {
    ...input,
    resultShares,
    resultAvgCost,
    resultTarget15: targets.target15,
    resultTarget20: targets.target20,
    totalInvested,
  };
}

/**
 * Get open position details with current price
 */
export function getOpenPosition(trade: Trade, currentPrice: number): OpenPosition {
  const unrealizedPnL = calculateUnrealizedPnL(trade, currentPrice);
  const unrealizedPnLPercent = trade.avgCost > 0
    ? ((currentPrice - trade.avgCost) / trade.avgCost) * 100
    : 0;

  const targets = calculateProfitTargets(trade.avgCost);

  return {
    trade,
    currentPrice,
    unrealizedPnL,
    unrealizedPnLPercent,
    target15: targets.target15,
    target20: targets.target20,
    distanceToTarget15: targets.target15 - currentPrice,
    distanceToTarget20: targets.target20 - currentPrice,
    distanceToTarget15Percent: ((targets.target15 - currentPrice) / currentPrice) * 100,
    distanceToTarget20Percent: ((targets.target20 - currentPrice) / currentPrice) * 100,
  };
}

/**
 * Calculate hold time in hours
 */
export function calculateHoldTime(trade: Trade): number {
  const startDate = trade.entries.length > 0
    ? new Date(Math.min(...trade.entries.map(e => new Date(e.date).getTime())))
    : new Date(trade.createdAt);

  const endDate = trade.status === 'closed' && trade.closedAt
    ? new Date(trade.closedAt)
    : new Date();

  return differenceInHours(endDate, startDate);
}

/**
 * Calculate hold time in minutes (for short-term trades)
 */
export function calculateHoldTimeMinutes(trade: Trade): number {
  const startDate = trade.entries.length > 0
    ? new Date(Math.min(...trade.entries.map(e => new Date(e.date).getTime())))
    : new Date(trade.createdAt);

  const endDate = trade.status === 'closed' && trade.closedAt
    ? new Date(trade.closedAt)
    : new Date();

  return differenceInMinutes(endDate, startDate);
}

/**
 * Format hold time for display
 */
export function formatHoldTime(hours: number): string {
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes}m`;
  }
  if (hours < 24) {
    return `${hours.toFixed(1)}h`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d ${remainingHours.toFixed(0)}h`;
}

/**
 * Determine if trade is a winner
 */
export function isWinningTrade(trade: Trade): boolean {
  return trade.realizedPnL > 0;
}

/**
 * Calculate portfolio summary from trades
 */
export function calculatePortfolioSummary(trades: Trade[]): PortfolioSummary {
  const openTrades = trades.filter(t => t.status === 'open');
  const closedTrades = trades.filter(t => t.status === 'closed');

  // Calculate open position values
  const totalInvested = openTrades.reduce((sum, t) => {
    return sum + t.entries.reduce((s, e) => s + e.price * e.shares, 0);
  }, 0);

  // Note: unrealizedPnL will be calculated with current prices in the component
  const unrealizedPnL = openTrades.reduce((sum, t) => sum + t.unrealizedPnL, 0);

  if (trades.length === 0) {
    return {
      totalTrades: 0,
      openTrades: 0,
      closedTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      avgReturnPercent: 0,
      avgHoldTimeHours: 0,
      totalProfit: 0,
      unrealizedPnL: 0,
      totalInvested: 0,
      bestTrade: null,
      worstTrade: null,
      currentStreak: 0,
      longestWinStreak: 0,
    };
  }

  const winners = closedTrades.filter(isWinningTrade);
  const losers = closedTrades.filter(t => !isWinningTrade(t));

  const totalProfit = closedTrades.reduce((sum, t) => sum + t.realizedPnL, 0);
  const totalHoldTime = closedTrades.length > 0
    ? closedTrades.reduce((sum, t) => sum + calculateHoldTime(t), 0)
    : 0;

  // Calculate average return percentage
  const returns = closedTrades.map(t => {
    const totalCost = t.entries.reduce((sum, e) => sum + e.price * e.shares, 0);
    return totalCost > 0 ? (t.realizedPnL / totalCost) * 100 : 0;
  });
  const avgReturnPercent = returns.length > 0
    ? returns.reduce((a, b) => a + b, 0) / returns.length
    : 0;

  // Find best and worst trades
  const sortedByPnL = [...closedTrades].sort((a, b) => b.realizedPnL - a.realizedPnL);
  const bestTrade = sortedByPnL[0] || null;
  const worstTrade = sortedByPnL[sortedByPnL.length - 1] || null;

  // Calculate streaks
  const sortedByDate = [...closedTrades].sort(
    (a, b) => new Date(a.closedAt || a.createdAt).getTime() - new Date(b.closedAt || b.createdAt).getTime()
  );

  let currentStreak = 0;
  let longestWinStreak = 0;
  let tempStreak = 0;

  for (let i = sortedByDate.length - 1; i >= 0; i--) {
    if (isWinningTrade(sortedByDate[i])) {
      if (i === sortedByDate.length - 1 || isWinningTrade(sortedByDate[i + 1])) {
        currentStreak++;
      }
    } else {
      break;
    }
  }

  for (const trade of sortedByDate) {
    if (isWinningTrade(trade)) {
      tempStreak++;
      longestWinStreak = Math.max(longestWinStreak, tempStreak);
    } else {
      tempStreak = 0;
    }
  }

  return {
    totalTrades: trades.length,
    openTrades: openTrades.length,
    closedTrades: closedTrades.length,
    winningTrades: winners.length,
    losingTrades: losers.length,
    winRate: closedTrades.length > 0 ? (winners.length / closedTrades.length) * 100 : 0,
    avgReturnPercent,
    avgHoldTimeHours: closedTrades.length > 0 ? totalHoldTime / closedTrades.length : 0,
    totalProfit,
    unrealizedPnL,
    totalInvested,
    bestTrade,
    worstTrade,
    currentStreak,
    longestWinStreak,
  };
}

/**
 * Format currency for display
 */
export function formatCurrency(value: number): string {
  const formatted = Math.abs(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return value < 0 ? `-${formatted}` : formatted;
}

/**
 * Format percentage for display
 */
export function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * Format price for display
 */
export function formatPrice(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format shares for display
 */
export function formatShares(shares: number): string {
  return shares.toLocaleString('en-US');
}

/**
 * Generate unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
