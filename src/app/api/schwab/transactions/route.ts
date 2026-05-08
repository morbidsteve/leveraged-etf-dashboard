import { NextRequest, NextResponse } from 'next/server';
import { getTransactions } from '@/lib/schwab/client';
import { getActiveAccountHash } from '@/lib/schwab/account';

/**
 * GET /api/schwab/transactions?days=7
 *
 * Returns broker-recorded TRADE transactions for the last N days. Used by
 * the Trades panel to optionally backfill from Schwab so users don't have
 * to manually log every trade.
 */
export async function GET(request: NextRequest) {
  const daysParam = request.nextUrl.searchParams.get('days');
  const days = Math.max(1, Math.min(60, Number(daysParam) || 7));

  try {
    const hash = await getActiveAccountHash();
    const end = new Date();
    const start = new Date(end.getTime() - days * 86400_000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const raw = await getTransactions(hash, {
      startDate: fmt(start),
      endDate: fmt(end),
      types: 'TRADE',
    });

    // Flatten to a simpler shape the client can consume
    const items = raw.map((t) => {
      const leg = t.transferItems?.find((i) => i.instrument?.symbol);
      return {
        id: t.activityId,
        time: t.time,
        symbol: leg?.instrument?.symbol ?? '?',
        amount: leg?.amount ?? 0,
        price: leg?.price ?? 0,
        netAmount: t.netAmount ?? 0,
        type: t.type,
        status: t.status,
      };
    });

    return NextResponse.json({ days, items });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
