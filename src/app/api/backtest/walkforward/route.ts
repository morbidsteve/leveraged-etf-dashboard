import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/backtest/walkforward
 *
 * Body: { strategy, ticker, interval, range, inSampleBars, outOfSampleBars }
 *
 * Runs walk-forward analysis: rolling in-sample / out-of-sample splits
 * over the candle history. Returns the aggregate summary + per-window
 * IS/OOS metrics. Used by BacktestPanel's "Validate" button.
 */
export async function POST(request: NextRequest) {
  let body: {
    strategy?: unknown;
    ticker?: string;
    interval?: string;
    range?: string;
    inSampleBars?: number;
    outOfSampleBars?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { strategy, ticker, interval = '5m', range = '3mo' } = body;
  const inSampleBars = body.inSampleBars ?? 500;
  const outOfSampleBars = body.outOfSampleBars ?? 100;

  if (!strategy || !ticker) {
    return NextResponse.json({ error: 'strategy + ticker required' }, { status: 400 });
  }

  try {
    // Import server-side libs lazily
    const { runWalkForward } = await import('@/lib/strategy/walkForward');
    // Fetch candles via Yahoo (same as the backtest endpoint)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}&includePrePost=false`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'leveraged-etf-dashboard/1.0' },
      cache: 'no-store',
    });
    if (!r.ok) return NextResponse.json({ error: `Yahoo ${r.status}` }, { status: 502 });
    const data = await r.json();
    const result = data.chart?.result?.[0];
    if (!result) return NextResponse.json({ error: 'No candle data' }, { status: 404 });
    const ts = result.timestamp ?? [];
    const q = result.indicators.quote[0];
    const candles = [];
    for (let i = 0; i < ts.length; i++) {
      if (q.open[i] != null) {
        candles.push({
          time: ts[i],
          open: q.open[i]!,
          high: q.high[i]!,
          low: q.low[i]!,
          close: q.close[i]!,
          volume: q.volume[i] ?? 0,
        });
      }
    }
    const summary = runWalkForward({
      strategy: strategy as never,
      candles,
      inSampleBars,
      outOfSampleBars,
      interval,
      range,
    });
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
