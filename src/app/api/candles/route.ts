import { NextRequest, NextResponse } from 'next/server';
import { Candle } from '@/types';

const YAHOO_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol') || 'TQQQ';
  const interval = searchParams.get('interval') || '1m';
  const range = searchParams.get('range') || '5d';

  try {
    const url = `${YAHOO_BASE_URL}/${symbol}?interval=${interval}&range=${range}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      next: { revalidate: 10 }, // Cache for 10 seconds
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance API error: ${response.status}`);
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];

    if (!result) {
      throw new Error('No data returned from Yahoo Finance');
    }

    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0];

    if (!quote) {
      return NextResponse.json({ candles: [] });
    }

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

    return NextResponse.json({
      symbol,
      interval,
      range,
      candles,
      meta: {
        currency: result.meta.currency,
        regularMarketPrice: result.meta.regularMarketPrice,
        previousClose: result.meta.previousClose,
      },
    });
  } catch (error) {
    console.error('Error fetching candles:', error);
    return NextResponse.json(
      { error: 'Failed to fetch candle data', candles: [] },
      { status: 500 }
    );
  }
}
