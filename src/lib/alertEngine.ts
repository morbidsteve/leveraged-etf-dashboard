import { RSIConfig, AlertType } from '@/types';

export interface Crossing {
  ticker: string;
  type: AlertType;
  prevRSI: number;
  currRSI: number;
  threshold: number;
  message: string;
}

/**
 * Detect RSI threshold crossings between two consecutive RSI readings.
 *
 * A "crossing below" oversold means: prevRSI was at or above the threshold AND
 * currRSI is now below it. Similarly for "crossing above" overbought.
 *
 * Returns 0..2 crossings (you'd only see both if the RSI swung wildly between
 * ticks across both bands, which is essentially impossible in 1-second windows
 * but we handle it for completeness).
 */
export function detectCrossings(
  ticker: string,
  prevRSI: number | null,
  currRSI: number | null,
  config: RSIConfig
): Crossing[] {
  if (prevRSI === null || currRSI === null) return [];
  if (!Number.isFinite(prevRSI) || !Number.isFinite(currRSI)) return [];

  const out: Crossing[] = [];

  // Buy signal: RSI crossing below the oversold threshold
  if (prevRSI >= config.oversold && currRSI < config.oversold) {
    out.push({
      ticker,
      type: 'rsi_oversold',
      prevRSI,
      currRSI,
      threshold: config.oversold,
      message: `${ticker} RSI crossed below ${config.oversold} (now ${currRSI.toFixed(1)}). Possible BUY.`,
    });
  }

  // Sell signal: RSI crossing above the overbought threshold
  if (prevRSI <= config.overbought && currRSI > config.overbought) {
    out.push({
      ticker,
      type: 'rsi_overbought',
      prevRSI,
      currRSI,
      threshold: config.overbought,
      message: `${ticker} RSI crossed above ${config.overbought} (now ${currRSI.toFixed(1)}). Possible SELL.`,
    });
  }

  return out;
}

/**
 * Check whether a crossing should fire given recent alert history.
 * Returns true if no alert of the same (ticker, type) has fired within the cooldown.
 */
export function isWithinCooldown(
  ticker: string,
  type: AlertType,
  cooldownMinutes: number,
  recentAlerts: { ticker: string; type: AlertType; timestamp: Date }[],
  now: Date = new Date()
): boolean {
  if (cooldownMinutes <= 0) return false;
  const cutoff = now.getTime() - cooldownMinutes * 60 * 1000;
  return recentAlerts.some(
    (a) =>
      a.ticker === ticker &&
      a.type === type &&
      new Date(a.timestamp).getTime() >= cutoff
  );
}
