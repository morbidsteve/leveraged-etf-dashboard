import { NextRequest, NextResponse } from 'next/server';
import { Candle } from '@/types';
import { Strategy } from '@/types/strategy';
import { runBacktest } from '@/lib/strategy/backtest';

const YAHOO_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

const ALLOWED_INTERVALS = new Set(['1m', '2m', '5m', '15m', '30m', '60m', '1h', '1d']);
const ALLOWED_RANGES = new Set([
  '1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max',
]);

export async function POST(request: NextRequest) {
  let body: { strategy: Strategy; ticker?: string; interval?: string; range?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const strategy = body.strategy;
  if (!strategy || !strategy.entry || !strategy.exit) {
    return NextResponse.json(
      { error: 'Missing or malformed `strategy` field' },
      { status: 400 }
    );
  }

  const ticker = (body.ticker || strategy.ticker).toUpperCase();
  const interval = body.interval || '5m';
  const range = body.range || '1mo';

  if (!ALLOWED_INTERVALS.has(interval)) {
    return NextResponse.json(
      { error: `Invalid interval. Allowed: ${Array.from(ALLOWED_INTERVALS).join(', ')}` },
      { status: 400 }
    );
  }
  if (!ALLOWED_RANGES.has(range)) {
    return NextResponse.json(
      { error: `Invalid range. Allowed: ${Array.from(ALLOWED_RANGES).join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const url = `${YAHOO_BASE_URL}/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}&includePrePost=false`;
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      // Backtests are cheap to recompute; cache for a minute
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Yahoo Finance returned ${response.status}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    if (!result) {
      return NextResponse.json({ error: 'No data returned from Yahoo Finance' }, { status: 502 });
    }

    const timestamps: number[] = result.timestamp || [];
    const quote = result.indicators?.quote?.[0];
    if (!quote) {
      return NextResponse.json({ error: 'No quote indicators in response' }, { status: 502 });
    }

    const candles: Candle[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (
        quote.open[i] == null ||
        quote.high[i] == null ||
        quote.low[i] == null ||
        quote.close[i] == null
      ) continue;
      candles.push({
        time: timestamps[i],
        open: quote.open[i],
        high: quote.high[i],
        low: quote.low[i],
        close: quote.close[i],
        volume: quote.volume?.[i],
      });
    }

    // Strategy from client is JSON; convert date strings back to Date.
    const normalizedStrategy: Strategy = {
      ...strategy,
      ticker,
      createdAt: new Date(strategy.createdAt),
      updatedAt: new Date(strategy.updatedAt),
    };

    const backtest = runBacktest({
      strategy: normalizedStrategy,
      candles,
      interval,
      range,
    });

    return NextResponse.json(backtest);
  } catch (error) {
    console.error('Backtest error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Backtest failed' },
      { status: 500 }
    );
  }
}
