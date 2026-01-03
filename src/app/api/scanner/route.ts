import { NextRequest, NextResponse } from 'next/server';
import { Candle, RSIConfig } from '@/types';

const YAHOO_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

// Default list of leveraged ETFs to scan
const DEFAULT_ETFS = [
  // 3x Leveraged
  'TQQQ', 'SOXL', 'UPRO', 'SPXL', 'TECL', 'FAS', 'TNA', 'LABU', 'FNGU', 'NAIL',
  'DPST', 'DFEN', 'RETL', 'MIDU', 'UDOW', 'URTY', 'WEBL', 'HIBL', 'WANT', 'DUSL',
  // 2x Leveraged
  'QLD', 'SSO', 'UWM', 'DDM', 'MVV', 'SAA', 'UYG', 'ROM', 'USD', 'UGE',
  // Inverse (for reference)
  // 'SQQQ', 'SPXS', 'SOXS', 'FAZ', 'TZA'
];

// Calculate RSI from candles
function calculateRSI(candles: Candle[], period: number = 14): number[] {
  const rsiValues: number[] = [];

  if (candles.length < period + 1) {
    return rsiValues;
  }

  // Calculate price changes
  const changes: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    changes.push(candles[i].close - candles[i - 1].close);
  }

  // Calculate initial average gains and losses
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) {
      avgGain += changes[i];
    } else {
      avgLoss += Math.abs(changes[i]);
    }
  }

  avgGain /= period;
  avgLoss /= period;

  // First RSI value
  if (avgLoss === 0) {
    rsiValues.push(100);
  } else {
    const rs = avgGain / avgLoss;
    rsiValues.push(100 - (100 / (1 + rs)));
  }

  // Calculate subsequent RSI values using smoothed method
  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      rsiValues.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsiValues.push(100 - (100 / (1 + rs)));
    }
  }

  return rsiValues;
}

interface ScanResult {
  symbol: string;
  currentPrice: number;
  currentRSI: number;
  avgVolume: number;
  // Backtest results
  totalSignals: number;
  winsAt1_5Pct: number;
  winsAt2Pct: number;
  winRateAt1_5Pct: number;
  winRateAt2Pct: number;
  avgDaysTo1_5Pct: number;
  avgMaxGain: number;
  avgMaxDrawdown: number;
  // Signal quality
  signalStrength: number; // 0-100 score
  isCurrentlyOversold: boolean;
  error?: string;
}

async function fetchHistoricalData(symbol: string): Promise<Candle[] | null> {
  try {
    // Fetch 1 year of daily data for backtesting
    const url = `${YAHOO_BASE_URL}/${symbol}?interval=1d&range=1y`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];

    if (!result) {
      return null;
    }

    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0];

    if (!quote) {
      return null;
    }

    const candles: Candle[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      if (
        quote.open[i] == null ||
        quote.high[i] == null ||
        quote.low[i] == null ||
        quote.close[i] == null
      ) {
        continue;
      }

      candles.push({
        time: timestamps[i],
        open: quote.open[i],
        high: quote.high[i],
        low: quote.low[i],
        close: quote.close[i],
        volume: quote.volume?.[i],
      });
    }

    return candles;
  } catch {
    return null;
  }
}

function analyzeETF(
  symbol: string,
  candles: Candle[],
  rsiConfig: RSIConfig
): ScanResult {
  const rsiValues = calculateRSI(candles, rsiConfig.period);

  // Align RSI with candles (RSI starts at period index)
  const offset = candles.length - rsiValues.length;

  // Get current values
  const currentPrice = candles[candles.length - 1]?.close || 0;
  const currentRSI = rsiValues[rsiValues.length - 1] || 50;

  // Calculate average volume
  const volumes = candles.slice(-20).map(c => c.volume || 0);
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;

  // Backtest: Find all RSI oversold signals and track outcomes
  let totalSignals = 0;
  let winsAt1_5Pct = 0;
  let winsAt2Pct = 0;
  let totalDaysTo1_5Pct = 0;
  let totalMaxGain = 0;
  let totalMaxDrawdown = 0;

  const maxLookforward = 7; // Look forward up to 7 trading days

  for (let i = 0; i < rsiValues.length - maxLookforward; i++) {
    const rsi = rsiValues[i];
    const prevRsi = i > 0 ? rsiValues[i - 1] : 100;

    // Signal: RSI crosses below oversold threshold
    if (rsi < rsiConfig.oversold && prevRsi >= rsiConfig.oversold) {
      totalSignals++;

      const entryPrice = candles[i + offset].close;
      const target1_5 = entryPrice * 1.015;
      const target2 = entryPrice * 1.02;

      let hit1_5 = false;
      let hit2 = false;
      let daysTo1_5 = maxLookforward;
      let maxGain = 0;
      let maxDrawdown = 0;

      // Look forward to see if target is hit
      for (let j = 1; j <= maxLookforward && i + offset + j < candles.length; j++) {
        const futureCandle = candles[i + offset + j];
        const highPrice = futureCandle.high;
        const lowPrice = futureCandle.low;

        // Track max gain and drawdown
        const gainPct = ((highPrice - entryPrice) / entryPrice) * 100;
        const drawdownPct = ((entryPrice - lowPrice) / entryPrice) * 100;

        maxGain = Math.max(maxGain, gainPct);
        maxDrawdown = Math.max(maxDrawdown, drawdownPct);

        if (!hit1_5 && highPrice >= target1_5) {
          hit1_5 = true;
          daysTo1_5 = j;
        }

        if (!hit2 && highPrice >= target2) {
          hit2 = true;
        }
      }

      if (hit1_5) winsAt1_5Pct++;
      if (hit2) winsAt2Pct++;
      totalDaysTo1_5Pct += daysTo1_5;
      totalMaxGain += maxGain;
      totalMaxDrawdown += maxDrawdown;
    }
  }

  // Calculate metrics
  const winRateAt1_5Pct = totalSignals > 0 ? (winsAt1_5Pct / totalSignals) * 100 : 0;
  const winRateAt2Pct = totalSignals > 0 ? (winsAt2Pct / totalSignals) * 100 : 0;
  const avgDaysTo1_5Pct = totalSignals > 0 ? totalDaysTo1_5Pct / totalSignals : 0;
  const avgMaxGain = totalSignals > 0 ? totalMaxGain / totalSignals : 0;
  const avgMaxDrawdown = totalSignals > 0 ? totalMaxDrawdown / totalSignals : 0;

  // Calculate signal strength score (0-100)
  // Based on: win rate, avg gain vs drawdown, number of signals
  const winRateScore = winRateAt1_5Pct; // 0-100
  const riskRewardScore = avgMaxDrawdown > 0 ? Math.min(100, (avgMaxGain / avgMaxDrawdown) * 50) : 50;
  const sampleSizeScore = Math.min(100, totalSignals * 5); // Penalize if < 20 signals

  const signalStrength = Math.round(
    (winRateScore * 0.5) + (riskRewardScore * 0.3) + (sampleSizeScore * 0.2)
  );

  return {
    symbol,
    currentPrice,
    currentRSI,
    avgVolume,
    totalSignals,
    winsAt1_5Pct,
    winsAt2Pct,
    winRateAt1_5Pct,
    winRateAt2Pct,
    avgDaysTo1_5Pct,
    avgMaxGain,
    avgMaxDrawdown,
    signalStrength,
    isCurrentlyOversold: currentRSI < rsiConfig.oversold,
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbolsParam = searchParams.get('symbols');
  const period = parseInt(searchParams.get('period') || '250');
  const oversold = parseInt(searchParams.get('oversold') || '50');
  const overbought = parseInt(searchParams.get('overbought') || '55');

  const symbols = symbolsParam ? symbolsParam.split(',') : DEFAULT_ETFS;

  const rsiConfig: RSIConfig = {
    period,
    oversold,
    overbought,
  };

  const results: ScanResult[] = [];

  // Process symbols in parallel with rate limiting
  const batchSize = 5;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (symbol) => {
        const candles = await fetchHistoricalData(symbol.toUpperCase());

        if (!candles || candles.length < period + 10) {
          return {
            symbol: symbol.toUpperCase(),
            currentPrice: 0,
            currentRSI: 0,
            avgVolume: 0,
            totalSignals: 0,
            winsAt1_5Pct: 0,
            winsAt2Pct: 0,
            winRateAt1_5Pct: 0,
            winRateAt2Pct: 0,
            avgDaysTo1_5Pct: 0,
            avgMaxGain: 0,
            avgMaxDrawdown: 0,
            signalStrength: 0,
            isCurrentlyOversold: false,
            error: 'Insufficient data',
          } as ScanResult;
        }

        return analyzeETF(symbol.toUpperCase(), candles, rsiConfig);
      })
    );

    results.push(...batchResults);

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  // Sort by signal strength (best first)
  results.sort((a, b) => b.signalStrength - a.signalStrength);

  return NextResponse.json({
    rsiConfig,
    results,
    timestamp: new Date().toISOString(),
  });
}
