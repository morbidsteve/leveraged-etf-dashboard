import { Candle, PriceData } from '@/types';

const BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

interface YahooChartResult {
  meta: {
    currency: string;
    symbol: string;
    regularMarketPrice: number;
    previousClose: number;
    regularMarketVolume: number;
    regularMarketTime: number;
  };
  timestamp: number[];
  indicators: {
    quote: Array<{
      open: number[];
      high: number[];
      low: number[];
      close: number[];
      volume: number[];
    }>;
  };
}

interface YahooResponse {
  chart: {
    result: YahooChartResult[];
    error: null | { code: string; description: string };
  };
}

/**
 * Fetch current quote data for a ticker
 */
export async function fetchQuote(ticker: string): Promise<PriceData | null> {
  try {
    const response = await fetch(`/api/quote?symbol=${ticker}`);
    if (!response.ok) throw new Error('Failed to fetch quote');

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching quote:', error);
    return null;
  }
}

/**
 * Fetch historical candle data for charting
 */
export async function fetchCandles(
  ticker: string,
  interval: '1m' | '5m' | '15m' | '1h' | '1d' = '1m',
  range: '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' = '1d'
): Promise<Candle[]> {
  try {
    const response = await fetch(
      `/api/candles?symbol=${ticker}&interval=${interval}&range=${range}`
    );
    if (!response.ok) throw new Error('Failed to fetch candles');

    const data = await response.json();
    return data.candles || [];
  } catch (error) {
    console.error('Error fetching candles:', error);
    return [];
  }
}

/**
 * Parse Yahoo Finance chart response to candles
 */
export function parseYahooCandles(data: YahooChartResult): Candle[] {
  const timestamps = data.timestamp || [];
  const quote = data.indicators?.quote?.[0];

  if (!quote) return [];

  const candles: Candle[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    // Skip invalid data points
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
}

/**
 * Get interval string for Yahoo Finance API
 */
export function getYahooInterval(minutes: number): string {
  switch (minutes) {
    case 1:
      return '1m';
    case 5:
      return '5m';
    case 15:
      return '15m';
    case 60:
      return '1h';
    case 1440:
      return '1d';
    default:
      return '1m';
  }
}

/**
 * Get range string based on interval to get enough data for RSI calculation (250+ periods)
 */
export function getRangeForInterval(interval: string): string {
  switch (interval) {
    case '1m':
      return '5d'; // ~2000 minutes of data (market hours)
    case '5m':
      return '1mo';
    case '15m':
      return '1mo';
    case '1h':
      return '3mo';
    case '1d':
      return '1y';
    default:
      return '5d';
  }
}
