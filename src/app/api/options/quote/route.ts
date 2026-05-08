import { NextRequest, NextResponse } from 'next/server';
import { getOptionChain } from '@/lib/schwab/options';
import { OptionContract } from '@/types/options';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/options/quote?symbols=SOXL  260117C00050000,...
 *
 * Per-contract quote refresh for open positions. For now, fetches the
 * underlying's chain (cached upstream) and pulls out the requested
 * contract symbols. A future revision can swap in Schwab's
 * /marketdata/v1/quotes batch endpoint or the streamer.
 *
 * Body: ?symbols=COMMA_SEPARATED_OCC_SYMBOLS
 * Response: { quotes: Record<string, OptionContract> }
 */
export async function GET(request: NextRequest) {
  const symbolsParam = request.nextUrl.searchParams.get('symbols');
  if (!symbolsParam) {
    return NextResponse.json({ error: 'symbols param required' }, { status: 400 });
  }

  const symbols = symbolsParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json({ quotes: {} });
  }

  // Group symbols by underlying. OCC symbols start with the underlying
  // (padded), e.g. "SOXL  260117C00050000". Best-effort parse.
  const byUnderlying = new Map<string, string[]>();
  for (const occ of symbols) {
    const m = occ.match(/^([A-Z.]+)\s+/);
    const ul = m ? m[1] : occ.slice(0, 5).trim();
    const list = byUnderlying.get(ul) ?? [];
    list.push(occ);
    byUnderlying.set(ul, list);
  }

  const out: Record<string, OptionContract> = {};
  const underlyings = Array.from(byUnderlying.keys());
  for (const ul of underlyings) {
    const chain = await getOptionChain(ul);
    if (!chain.configured) continue;
    for (const exp of chain.expirations) {
      for (const c of Object.values(exp.calls)) {
        if (symbols.includes(c.symbol)) out[c.symbol] = c;
      }
      for (const c of Object.values(exp.puts)) {
        if (symbols.includes(c.symbol)) out[c.symbol] = c;
      }
    }
  }

  return NextResponse.json({ quotes: out, fetchedAt: new Date().toISOString() });
}
