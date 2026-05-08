import { PaperTrade } from '@/store/paperStore';
import { Strategy } from '@/types/strategy';

/**
 * Heuristic ML-style signal scoring. Given a strategy's historical paper
 * trades, computes a 0-100 confidence score reflecting how that strategy
 * has performed historically. Pure function; no actual ML training needed.
 *
 * Components (weighted average):
 *   - Win rate × 0.4
 *   - Profit factor (capped at 3) × 0.3
 *   - Sharpe-like consistency (avg / stdev of trade P&L) × 0.2
 *   - Recency boost (recent 30-day perf) × 0.1
 *
 * Returns a single score plus a breakdown for explainability. Once you
 * have a real ML model with sufficient training data, this can be
 * upgraded — interface stays the same.
 */

export interface SignalScore {
  score: number;          // 0-100
  components: {
    winRate: number;
    profitFactor: number;
    consistency: number;
    recency: number;
  };
  trades: number;
  recentTrades: number;
  reliable: boolean;       // true when ≥30 trades; false otherwise (low confidence)
  description: string;
}

export function scoreStrategy(strategy: Strategy, paperHistory: PaperTrade[]): SignalScore {
  const myTrades = paperHistory.filter((t) => t.strategyId === strategy.id);
  if (myTrades.length === 0) {
    return {
      score: 50,
      components: { winRate: 0, profitFactor: 0, consistency: 0, recency: 0 },
      trades: 0,
      recentTrades: 0,
      reliable: false,
      description: 'No history — score defaults to neutral 50',
    };
  }

  const wins = myTrades.filter((t) => t.realizedPnL > 0);
  const losses = myTrades.filter((t) => t.realizedPnL <= 0);
  const winRate = (wins.length / myTrades.length) * 100;

  const grossProfit = wins.reduce((s, t) => s + t.realizedPnL, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.realizedPnL, 0));
  const profitFactor = grossLoss > 0 ? Math.min(3, grossProfit / grossLoss) : grossProfit > 0 ? 3 : 0;

  const pnls = myTrades.map((t) => t.realizedPnL);
  const mean = pnls.reduce((s, x) => s + x, 0) / pnls.length;
  const variance = pnls.reduce((s, x) => s + (x - mean) ** 2, 0) / pnls.length;
  const stdev = Math.sqrt(variance);
  const consistency = stdev > 0 ? Math.max(0, Math.min(2, mean / stdev)) : 0;

  // Recency: weighted toward last 30 days
  const cutoff = new Date(Date.now() - 30 * 86400_000);
  const recentTrades = myTrades.filter((t) => new Date(t.exitAt) >= cutoff);
  const recentPnL = recentTrades.reduce((s, t) => s + t.realizedPnL, 0);
  const recencyScore = recentTrades.length > 0
    ? Math.max(0, Math.min(1, recentPnL / Math.max(1, Math.abs(grossProfit + grossLoss) / 2)))
    : 0;

  // Normalize each component to 0-1
  const winRateNorm = winRate / 100;
  const profitFactorNorm = profitFactor / 3;
  const consistencyNorm = consistency / 2;
  const recencyNorm = recencyScore;

  const score = (
    winRateNorm * 40 +
    profitFactorNorm * 30 +
    consistencyNorm * 20 +
    recencyNorm * 10
  );

  const reliable = myTrades.length >= 30;

  let description: string;
  if (score >= 75) description = `High-confidence signal — ${winRate.toFixed(0)}% win rate over ${myTrades.length} trades`;
  else if (score >= 60) description = `Moderate confidence — ${winRate.toFixed(0)}% win rate, watch for decay`;
  else if (score >= 40) description = `Marginal — historical edge unclear from ${myTrades.length} trades`;
  else description = `Low confidence — ${winRate.toFixed(0)}% win rate suggests this strategy is not working`;
  if (!reliable) description += `. <30 trades — early-stage data, score is unstable.`;

  return {
    score: Math.max(0, Math.min(100, score)),
    components: {
      winRate: winRateNorm,
      profitFactor: profitFactorNorm,
      consistency: consistencyNorm,
      recency: recencyNorm,
    },
    trades: myTrades.length,
    recentTrades: recentTrades.length,
    reliable,
    description,
  };
}
