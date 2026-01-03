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
  avgBarsTo1_5Pct: number;
  avgMaxGain: number;
  avgMaxDrawdown: number;
  // Signal quality
  signalStrength: number; // 0-100 score
  isCurrentlyOversold: boolean;
  dataPoints: number;
  error?: string;
}

// Fetch intraday minute data (up to 60 days from Yahoo)
async function fetchIntradayData(symbol: string): Promise<Candle[] | null> {
  try {
    // Yahoo allows up to 60 days of 1-minute data, or 730 days of 1-hour data
    // We'll use 5-minute intervals for a good balance of granularity and data range
    // 5m interval gives us up to 60 days of data
    const url = `${YAHOO_BASE_URL}/${symbol}?interval=5m&range=60d`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${symbol}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];

    if (!result) {
      console.error(`No result for ${symbol}`);
      return null;
    }

    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0];

    if (!quote) {
      console.error(`No quote data for ${symbol}`);
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
  } catch (err) {
    console.error(`Error fetching ${symbol}:`, err);
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
  const volumes = candles.slice(-100).map(c => c.volume || 0);
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;

  // Backtest: Find all RSI oversold signals and track outcomes
  let totalSignals = 0;
  let winsAt1_5Pct = 0;
  let winsAt2Pct = 0;
  let totalBarsTo1_5Pct = 0;
  let totalMaxGain = 0;
  let totalMaxDrawdown = 0;

  // For 5-minute candles, 1 week = ~5 trading days * 6.5 hours * 12 candles/hour = ~390 candles
  // But we'll look forward ~500 bars to be safe (about 1 week of trading)
  const maxLookforward = 500;

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
      let barsTo1_5 = maxLookforward;
      let maxGain = 0;
      let maxDrawdown = 0;

      // Look forward to see if target is hit within ~1 week
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
          barsTo1_5 = j;
        }

        if (!hit2 && highPrice >= target2) {
          hit2 = true;
        }

        // Once we hit both targets, we can stop looking
        if (hit1_5 && hit2) break;
      }

      if (hit1_5) winsAt1_5Pct++;
      if (hit2) winsAt2Pct++;
      totalBarsTo1_5Pct += hit1_5 ? barsTo1_5 : 0;
      totalMaxGain += maxGain;
      totalMaxDrawdown += maxDrawdown;
    }
  }

  // Calculate metrics
  const winRateAt1_5Pct = totalSignals > 0 ? (winsAt1_5Pct / totalSignals) * 100 : 0;
  const winRateAt2Pct = totalSignals > 0 ? (winsAt2Pct / totalSignals) * 100 : 0;
  const avgBarsTo1_5Pct = winsAt1_5Pct > 0 ? totalBarsTo1_5Pct / winsAt1_5Pct : 0;
  const avgMaxGain = totalSignals > 0 ? totalMaxGain / totalSignals : 0;
  const avgMaxDrawdown = totalSignals > 0 ? totalMaxDrawdown / totalSignals : 0;

  // Calculate signal strength score (0-100)
  // Based on: win rate, avg gain vs drawdown, number of signals, consistency
  const winRateScore = winRateAt1_5Pct; // 0-100
  const riskRewardScore = avgMaxDrawdown > 0 ? Math.min(100, (avgMaxGain / avgMaxDrawdown) * 50) : 50;
  // Need at least 3 signals to be meaningful, penalize heavily if fewer
  const sampleSizeScore = totalSignals >= 5 ? 100 : totalSignals >= 3 ? 60 : totalSignals * 15;

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
    avgBarsTo1_5Pct,
    avgMaxGain,
    avgMaxDrawdown,
    signalStrength,
    isCurrentlyOversold: currentRSI < rsiConfig.oversold,
    dataPoints: candles.length,
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbolsParam = searchParams.get('symbols');
  // Default to 14-period RSI for intraday (common standard)
  // But allow override via parameter
  const period = parseInt(searchParams.get('period') || '14');
  const oversold = parseInt(searchParams.get('oversold') || '50');
  const overbought = parseInt(searchParams.get('overbought') || '70');

  const symbols = symbolsParam ? symbolsParam.split(',') : DEFAULT_ETFS;

  const rsiConfig: RSIConfig = {
    period,
    oversold,
    overbought,
  };

  const results: ScanResult[] = [];

  // Process symbols in parallel with rate limiting
  const batchSize = 3; // Smaller batches to avoid rate limiting with intraday data
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (symbol) => {
        const candles = await fetchIntradayData(symbol.toUpperCase());

        if (!candles || candles.length < period + 100) {
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
            avgBarsTo1_5Pct: 0,
            avgMaxGain: 0,
            avgMaxDrawdown: 0,
            signalStrength: 0,
            isCurrentlyOversold: false,
            dataPoints: candles?.length || 0,
            error: `Insufficient data (${candles?.length || 0} candles)`,
          } as ScanResult;
        }

        return analyzeETF(symbol.toUpperCase(), candles, rsiConfig);
      })
    );

    results.push(...batchResults);

    // Delay between batches to avoid rate limiting
    if (i + batchSize < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Sort by signal strength (best first), putting errors at the end
  results.sort((a, b) => {
    if (a.error && !b.error) return 1;
    if (!a.error && b.error) return -1;
    return b.signalStrength - a.signalStrength;
  });

  return NextResponse.json({
    rsiConfig,
    results,
    timestamp: new Date().toISOString(),
    note: 'Using 5-minute candles over 60 days. RSI signals when crossing below threshold, tracking if price gains 1.5%+ within ~1 week.',
  });
}
