import { NextRequest, NextResponse } from 'next/server';
import { PriceData } from '@/types';

const YAHOO_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol') || 'TQQQ';

  try {
    const url = `${YAHOO_BASE_URL}/${symbol}?interval=1m&range=1d`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      next: { revalidate: 5 }, // Cache for 5 seconds
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance API error: ${response.status}`);
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];

    if (!result) {
      throw new Error('No data returned from Yahoo Finance');
    }

    const meta = result.meta;
    const previousClose = meta.previousClose || meta.chartPreviousClose || 0;
    const currentPrice = meta.regularMarketPrice || 0;
    const change = currentPrice - previousClose;
    const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

    const priceData: PriceData = {
      ticker: symbol,
      price: currentPrice,
      change: change,
      changePercent: changePercent,
      volume: meta.regularMarketVolume || 0,
      timestamp: new Date(meta.regularMarketTime * 1000),
    };

    return NextResponse.json(priceData);
  } catch (error) {
    console.error('Error fetching quote:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quote data' },
      { status: 500 }
    );
  }
}
