import { NextRequest, NextResponse } from 'next/server';
import { Candle, RSIConfig } from '@/types';

const YAHOO_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

// Simple in-memory cache for candle data
// Cache TTL: 5 minutes for intraday data
const CACHE_TTL = 5 * 60 * 1000;

interface CacheEntry {
  data: Candle[];
  timestamp: number;
}

const candleCache: Map<string, CacheEntry> = new Map();

function getCacheKey(symbol: string, interval: string, source: string): string {
  return `${source}:${symbol}:${interval}`;
}

function getCachedCandles(key: string): Candle[] | null {
  const entry = candleCache.get(key);
  if (!entry) return null;

  // Check if cache is still valid
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    candleCache.delete(key);
    return null;
  }

  return entry.data;
}

function setCachedCandles(key: string, data: Candle[]): void {
  candleCache.set(key, {
    data,
    timestamp: Date.now(),
  });
}

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

interface TimeframeMetrics {
  totalSignals: number;
  winsAt1_5Pct: number;
  winsAt2Pct: number;
  winRateAt1_5Pct: number;
  winRateAt2Pct: number;
  avgMinsTo1_5Pct: number;
  avgMaxGain: number;
  avgMaxDrawdown: number;
  signalStrength: number;
  dataPoints: number;
}

interface ScanResult {
  symbol: string;
  currentPrice: number;
  currentRSI: number;
  avgVolume: number;
  // Short-term: 1-minute data for past 7 days
  shortTerm: TimeframeMetrics;
  // Long-term: 5-minute data for past 60 days
  longTerm: TimeframeMetrics;
  // Combined score
  combinedScore: number;
  isCurrentlyOversold: boolean;
  error?: string;
}

// Fetch candle data from Yahoo Finance with caching
// Yahoo limits: 1m = 7 days max, 5m = 60 days max
async function fetchCandleData(symbol: string, interval: '1m' | '5m', range: string): Promise<Candle[] | null> {
  const cacheKey = getCacheKey(symbol, interval, 'yahoo');

  // Check cache first
  const cached = getCachedCandles(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const url = `${YAHOO_BASE_URL}/${symbol}?interval=${interval}&range=${range}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${symbol} (${interval}): ${response.status}`);
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

    // Cache the result
    if (candles.length > 0) {
      setCachedCandles(cacheKey, candles);
    }

    return candles;
  } catch (err) {
    console.error(`Error fetching ${symbol}:`, err);
    return null;
  }
}

// Fetch candle data from Finnhub with caching
// Resolution: 1 = 1 minute, 5 = 5 minutes, D = daily
async function fetchFinnhubCandles(
  symbol: string,
  resolution: '1' | '5' | 'D',
  daysBack: number,
  apiKey: string
): Promise<Candle[] | null> {
  const cacheKey = getCacheKey(symbol, resolution, 'finnhub');

  // Check cache first
  const cached = getCachedCandles(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const from = now - (daysBack * 24 * 60 * 60);

    const url = `${FINNHUB_BASE_URL}/stock/candle?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${now}&token=${apiKey}`;

    const response = await fetch(url);

    if (!response.ok) {
      console.error(`Finnhub failed for ${symbol}: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.s !== 'ok' || !data.t || data.t.length === 0) {
      console.error(`Finnhub no data for ${symbol}: ${data.s}`);
      return null;
    }

    const candles: Candle[] = [];

    for (let i = 0; i < data.t.length; i++) {
      candles.push({
        time: data.t[i],
        open: data.o[i],
        high: data.h[i],
        low: data.l[i],
        close: data.c[i],
        volume: data.v[i],
      });
    }

    // Cache the result
    if (candles.length > 0) {
      setCachedCandles(cacheKey, candles);
    }

    return candles;
  } catch (err) {
    console.error(`Finnhub error for ${symbol}:`, err);
    return null;
  }
}

// Analyze a single timeframe and return metrics
// Now counts ALL instances where RSI is below threshold (not just crossings)
function analyzeTimeframe(
  candles: Candle[],
  rsiConfig: RSIConfig,
  barsPerDay: number,  // 390 for 1m, 78 for 5m
  minsPerBar: number   // 1 for 1m, 5 for 5m
): TimeframeMetrics {
  const rsiValues = calculateRSI(candles, rsiConfig.period);
  const offset = candles.length - rsiValues.length;

  let totalSignals = 0;
  let winsAt1_5Pct = 0;
  let winsAt2Pct = 0;
  let totalBarsTo1_5Pct = 0;
  let totalMaxGain = 0;
  let totalMaxDrawdown = 0;

  // Look forward 1 trading day
  const maxLookforward = barsPerDay;

  // To avoid counting overlapping signals, skip bars that are within lookforward of previous signal
  let lastSignalIndex = -maxLookforward;

  for (let i = 0; i < rsiValues.length - maxLookforward; i++) {
    const rsi = rsiValues[i];

    // Signal: RSI is below oversold threshold
    // Only count if we're far enough from the last signal to avoid overlap
    if (rsi < rsiConfig.oversold && (i - lastSignalIndex) >= maxLookforward) {
      totalSignals++;
      lastSignalIndex = i;

      const entryPrice = candles[i + offset].close;
      const target1_5 = entryPrice * 1.015;
      const target2 = entryPrice * 1.02;

      let hit1_5 = false;
      let hit2 = false;
      let barsTo1_5 = maxLookforward;
      let maxGain = 0;
      let maxDrawdown = 0;

      for (let j = 1; j <= maxLookforward && i + offset + j < candles.length; j++) {
        const futureCandle = candles[i + offset + j];
        const highPrice = futureCandle.high;
        const lowPrice = futureCandle.low;

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

        if (hit1_5 && hit2) break;
      }

      if (hit1_5) winsAt1_5Pct++;
      if (hit2) winsAt2Pct++;
      totalBarsTo1_5Pct += hit1_5 ? barsTo1_5 : 0;
      totalMaxGain += maxGain;
      totalMaxDrawdown += maxDrawdown;
    }
  }

  const winRateAt1_5Pct = totalSignals > 0 ? (winsAt1_5Pct / totalSignals) * 100 : 0;
  const winRateAt2Pct = totalSignals > 0 ? (winsAt2Pct / totalSignals) * 100 : 0;
  const avgMinsTo1_5Pct = winsAt1_5Pct > 0 ? (totalBarsTo1_5Pct / winsAt1_5Pct) * minsPerBar : 0;
  const avgMaxGain = totalSignals > 0 ? totalMaxGain / totalSignals : 0;
  const avgMaxDrawdown = totalSignals > 0 ? totalMaxDrawdown / totalSignals : 0;

  // Signal strength score
  const winRateScore = winRateAt1_5Pct;
  const riskRewardScore = avgMaxDrawdown > 0 ? Math.min(100, (avgMaxGain / avgMaxDrawdown) * 50) : 50;
  const sampleSizeScore = totalSignals >= 10 ? 100 : totalSignals >= 5 ? 70 : totalSignals >= 3 ? 50 : totalSignals * 15;

  const signalStrength = Math.round(
    (winRateScore * 0.5) + (riskRewardScore * 0.3) + (sampleSizeScore * 0.2)
  );

  return {
    totalSignals,
    winsAt1_5Pct,
    winsAt2Pct,
    winRateAt1_5Pct,
    winRateAt2Pct,
    avgMinsTo1_5Pct,
    avgMaxGain,
    avgMaxDrawdown,
    signalStrength,
    dataPoints: candles.length,
  };
}

// Get empty metrics for error cases
function emptyMetrics(): TimeframeMetrics {
  return {
    totalSignals: 0,
    winsAt1_5Pct: 0,
    winsAt2Pct: 0,
    winRateAt1_5Pct: 0,
    winRateAt2Pct: 0,
    avgMinsTo1_5Pct: 0,
    avgMaxGain: 0,
    avgMaxDrawdown: 0,
    signalStrength: 0,
    dataPoints: 0,
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbolsParam = searchParams.get('symbols');
  // Default to 14-period RSI for intraday (common standard)
  const period = parseInt(searchParams.get('period') || '14');
  const oversold = parseInt(searchParams.get('oversold') || '50');
  const overbought = parseInt(searchParams.get('overbought') || '70');
  const source = searchParams.get('source') || 'yahoo';
  const apiKey = searchParams.get('apiKey') || '';

  const symbols = symbolsParam ? symbolsParam.split(',') : DEFAULT_ETFS;

  const rsiConfig: RSIConfig = {
    period,
    oversold,
    overbought,
  };

  const results: ScanResult[] = [];

  // Use Finnhub if selected and API key is provided
  const useFinnhub = source === 'finnhub' && apiKey;

  // Process symbols in parallel with rate limiting
  // Finnhub free tier: 60 API calls/minute, so we need to be careful
  const batchSize = useFinnhub ? 5 : 2; // Finnhub can handle more parallel requests
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (symbol) => {
        const sym = symbol.toUpperCase();

        // Fetch both timeframes in parallel
        let candles1m: Candle[] | null;
        let candles5m: Candle[] | null;

        if (useFinnhub) {
          // Finnhub: 1-minute for 7 days, 5-minute for 60 days
          [candles1m, candles5m] = await Promise.all([
            fetchFinnhubCandles(sym, '1', 7, apiKey),
            fetchFinnhubCandles(sym, '5', 60, apiKey),
          ]);
        } else {
          // Yahoo: 1-minute for 7 days, 5-minute for 60 days
          [candles1m, candles5m] = await Promise.all([
            fetchCandleData(sym, '1m', '7d'),
            fetchCandleData(sym, '5m', '60d'),
          ]);
        }

        // Get current price and RSI from 1m data (most recent)
        let currentPrice = 0;
        let currentRSI = 50;
        let avgVolume = 0;

        if (candles1m && candles1m.length > 0) {
          currentPrice = candles1m[candles1m.length - 1].close;
          const rsiValues = calculateRSI(candles1m, period);
          currentRSI = rsiValues[rsiValues.length - 1] || 50;
          const volumes = candles1m.slice(-100).map(c => c.volume || 0);
          avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
        } else if (candles5m && candles5m.length > 0) {
          currentPrice = candles5m[candles5m.length - 1].close;
          const rsiValues = calculateRSI(candles5m, period);
          currentRSI = rsiValues[rsiValues.length - 1] || 50;
          const volumes = candles5m.slice(-100).map(c => c.volume || 0);
          avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
        }

        // Analyze short-term (1m data, 7 days)
        // 390 bars per day for 1m, 1 min per bar
        const shortTerm = candles1m && candles1m.length >= period + 100
          ? analyzeTimeframe(candles1m, rsiConfig, 390, 1)
          : emptyMetrics();

        // Analyze long-term (5m data, 60 days)
        // 78 bars per day for 5m, 5 mins per bar
        const longTerm = candles5m && candles5m.length >= period + 100
          ? analyzeTimeframe(candles5m, rsiConfig, 78, 5)
          : emptyMetrics();

        // Check if we have any valid data
        if (shortTerm.dataPoints === 0 && longTerm.dataPoints === 0) {
          return {
            symbol: sym,
            currentPrice: 0,
            currentRSI: 0,
            avgVolume: 0,
            shortTerm: emptyMetrics(),
            longTerm: emptyMetrics(),
            combinedScore: 0,
            isCurrentlyOversold: false,
            error: 'No data available',
          } as ScanResult;
        }

        // Combined score: weight short-term 60%, long-term 40%
        // Short-term is more actionable, long-term confirms pattern reliability
        const combinedScore = Math.round(
          (shortTerm.signalStrength * 0.6) + (longTerm.signalStrength * 0.4)
        );

        return {
          symbol: sym,
          currentPrice,
          currentRSI,
          avgVolume,
          shortTerm,
          longTerm,
          combinedScore,
          isCurrentlyOversold: currentRSI < rsiConfig.oversold,
        } as ScanResult;
      })
    );

    results.push(...batchResults);

    // Delay between batches to avoid rate limiting
    if (i + batchSize < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Sort by combined score (best first), putting errors at the end
  results.sort((a, b) => {
    if (a.error && !b.error) return 1;
    if (!a.error && b.error) return -1;
    return b.combinedScore - a.combinedScore;
  });

  const dataSourceLabel = useFinnhub ? 'Finnhub' : 'Yahoo Finance';

  return NextResponse.json({
    rsiConfig,
    results,
    timestamp: new Date().toISOString(),
    dataSource: dataSourceLabel,
    methodology: {
      shortTerm: {
        dataSource: `1-minute candles for past 7 days (${dataSourceLabel})`,
        dataPoints: 'Up to ~2,500 per ETF (390 bars/day × 7 days)',
        targetWindow: '1 trading day (390 minutes)',
      },
      longTerm: {
        dataSource: `5-minute candles for past 60 days (${dataSourceLabel})`,
        dataPoints: 'Up to ~4,600 per ETF (78 bars/day × 60 days)',
        targetWindow: '1 trading day (390 minutes)',
      },
      signalTrigger: `RSI(${period}) crosses below ${oversold}`,
      targets: ['1.5% gain', '2% gain'],
      scoreFormula: 'Combined: 60% short-term + 40% long-term',
    },
  });
}
