import { NextRequest, NextResponse } from 'next/server';
import { getOptionChain } from '@/lib/schwab/options';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/options/chain?symbol=SOXL&expiration=YYYY-MM-DD
 *
 * Proxies Schwab's /marketdata/v1/chains. Always returns 200; if Schwab
 * isn't connected the body has `configured: false` so the UI degrades
 * gracefully instead of erroring.
 */
export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol');
  if (!symbol) {
    return NextResponse.json({ error: 'symbol param required' }, { status: 400 });
  }

  const expiration = request.nextUrl.searchParams.get('expiration') ?? undefined;
  const strikeCount = request.nextUrl.searchParams.get('strikeCount');

  const chain = await getOptionChain(symbol, {
    expiration,
    strikeCount: strikeCount ? Math.max(1, parseInt(strikeCount, 10)) : undefined,
  });

  return NextResponse.json(chain);
}
