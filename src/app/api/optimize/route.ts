import { NextRequest, NextResponse } from 'next/server';
import { Strategy } from '@/types/strategy';
import { runOptimizer } from '@/lib/strategy/optimizer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart';

/**
 * POST /api/optimize — grid-search RSI parameters for a strategy.
 *
 * Body: {
 *   strategy: Strategy,
 *   ticker: string,
 *   interval?: string, range?: string,
 *   periods?: number[], oversold?: number[], overbought?: number[],
 *   objective?: 'pnl' | 'winRate' | 'expectancy' | 'sharpe',
 * }
 */
export async function POST(req: NextRequest) {
  let body: {
    strategy?: Strategy;
    ticker?: string;
    interval?: string;
    range?: string;
    periods?: number[];
    oversold?: number[];
    overbought?: number[];
    objective?: 'pnl' | 'winRate' | 'expectancy' | 'sharpe';
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.strategy || !body.ticker) {
    return NextResponse.json({ error: 'strategy + ticker required' }, { status: 400 });
  }
  const interval = body.interval ?? '5m';
  const range = body.range ?? '3mo';
  const periods = body.periods ?? [50, 100, 150, 200, 250];
  const oversold = body.oversold ?? [40, 45, 50, 55];
  const overbought = body.overbought ?? [50, 55, 60, 65, 70];
  const stratSessions = body.strategy.sessions ?? ['open'];
  const includePrePost =
    stratSessions.includes('pre') || stratSessions.includes('post');

  try {
    const url = `${YAHOO}/${encodeURIComponent(body.ticker)}?range=${range}&interval=${interval}&includePrePost=${includePrePost}`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'leveraged-etf-dashboard/1.0' },
      cache: 'no-store',
    });
    if (!r.ok) return NextResponse.json({ error: `Yahoo ${r.status}` }, { status: 502 });
    const data = await r.json();
    const result = data.chart?.result?.[0];
    if (!result) return NextResponse.json({ error: 'no data' }, { status: 404 });
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
    const out = runOptimizer({
      strategy: body.strategy,
      candles,
      periods,
      oversold,
      overbought,
      objective: body.objective ?? 'pnl',
    });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
