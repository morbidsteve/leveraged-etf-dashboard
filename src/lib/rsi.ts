import { Candle, RSIConfig, RSIData, RSIStatus } from '@/types';

// Default RSI configuration for TQQQ scalping strategy
export const DEFAULT_RSI_CONFIG: RSIConfig = {
  period: 250,
  overbought: 55,
  oversold: 50,
};

/**
 * Calculate RSI (Relative Strength Index) from candle data
 * Uses Wilder's smoothing method (exponential moving average)
 */
export function calculateRSI(
  candles: Candle[],
  period: number = DEFAULT_RSI_CONFIG.period
): number[] {
  if (candles.length < period + 1) {
    return [];
  }

  const rsiValues: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  // Calculate price changes
  for (let i = 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }

  // Calculate initial average gain and loss (SMA for first period)
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // Calculate first RSI
  if (avgLoss === 0) {
    rsiValues.push(100);
  } else {
    const rs = avgGain / avgLoss;
    rsiValues.push(100 - 100 / (1 + rs));
  }

  // Calculate subsequent RSI values using Wilder's smoothing
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;

    if (avgLoss === 0) {
      rsiValues.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsiValues.push(100 - 100 / (1 + rs));
    }
  }

  return rsiValues;
}

/**
 * Get the current RSI value from the most recent candle data
 */
export function getCurrentRSI(
  candles: Candle[],
  config: RSIConfig = DEFAULT_RSI_CONFIG
): number | null {
  const rsiValues = calculateRSI(candles, config.period);
  return rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : null;
}

/**
 * Determine RSI status based on value and thresholds
 */
export function getRSIStatus(rsi: number, config: RSIConfig = DEFAULT_RSI_CONFIG): RSIStatus {
  if (rsi < config.oversold) {
    return 'buy';
  } else if (rsi > config.overbought) {
    return 'sell';
  }
  return 'neutral';
}

/**
 * Get full RSI data including value and status
 */
export function getRSIData(
  candles: Candle[],
  config: RSIConfig = DEFAULT_RSI_CONFIG
): RSIData | null {
  const rsi = getCurrentRSI(candles, config);
  if (rsi === null) return null;

  return {
    value: rsi,
    status: getRSIStatus(rsi, config),
    timestamp: new Date(candles[candles.length - 1].time * 1000),
  };
}

/**
 * Calculate RSI with timestamps for charting
 */
export function calculateRSIWithTimestamps(
  candles: Candle[],
  period: number = DEFAULT_RSI_CONFIG.period
): { time: number; value: number }[] {
  if (candles.length < period + 1) {
    return [];
  }

  const rsiValues = calculateRSI(candles, period);

  // RSI values start from candle index (period)
  // because we need 'period' candles to calculate the first RSI
  // rsiValues[0] corresponds to candles[period]
  // rsiValues[n] corresponds to candles[period + n]
  return rsiValues.map((value, index) => ({
    time: candles[index + period].time,
    value,
  }));
}

/**
 * Get color for RSI status
 */
export function getRSIColor(status: RSIStatus): string {
  switch (status) {
    case 'buy':
      return '#22c55e'; // green
    case 'sell':
      return '#ef4444'; // red
    case 'neutral':
      return '#eab308'; // yellow
  }
}

/**
 * Get background color for RSI status (lighter variants)
 */
export function getRSIBgColor(status: RSIStatus): string {
  switch (status) {
    case 'buy':
      return 'rgba(34, 197, 94, 0.1)';
    case 'sell':
      return 'rgba(239, 68, 68, 0.1)';
    case 'neutral':
      return 'rgba(234, 179, 8, 0.1)';
  }
}

/**
 * Format RSI value for display
 */
export function formatRSI(rsi: number): string {
  return rsi.toFixed(2);
}

/**
 * Check if RSI crossed a threshold (for alerts)
 */
export function checkRSICrossover(
  previousRSI: number,
  currentRSI: number,
  threshold: number,
  direction: 'above' | 'below'
): boolean {
  if (direction === 'below') {
    return previousRSI >= threshold && currentRSI < threshold;
  }
  return previousRSI <= threshold && currentRSI > threshold;
}
