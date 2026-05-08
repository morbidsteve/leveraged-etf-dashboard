import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/quote/:ticker — read-scoped quote endpoint.
 *
 * Pulls a fresh Yahoo quote (no auth needed at Yahoo). Returns the
 * latest trade price + day change. Useful for third-party consumers
 * that want a fast quote without setting up their own data feed.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const { requireApiKey } = await import('@/lib/api/auth');
  const auth = await requireApiKey(request, 'read');
  if (auth instanceof NextResponse) return auth;

  const ticker = params.ticker.toUpperCase();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker
  )}?range=1d&interval=1m`;

  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'leveraged-etf-dashboard/1.0' },
      cache: 'no-store',
    });
    if (!r.ok) {
      return NextResponse.json(
        { error: `Upstream ${r.status}` },
        { status: 502 }
      );
    }
    const data = await r.json();
    const result = data.chart?.result?.[0];
    if (!result) return NextResponse.json({ error: 'No quote' }, { status: 404 });
    const meta = result.meta;
    return NextResponse.json({
      ticker,
      price: meta.regularMarketPrice,
      previousClose: meta.previousClose ?? meta.chartPreviousClose,
      change: meta.regularMarketPrice - (meta.previousClose ?? meta.chartPreviousClose),
      changePercent:
        ((meta.regularMarketPrice - (meta.previousClose ?? meta.chartPreviousClose)) /
          (meta.previousClose ?? meta.chartPreviousClose)) *
        100,
      currency: meta.currency,
      exchange: meta.exchangeName,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'fetch failed' },
      { status: 502 }
    );
  }
}
