import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/short-interest?symbol=NVDA — Finnhub short-interest data.
 * Returns days-to-cover, short ratio, and short %. Heavy short interest
 * + a strong move can signal a squeeze setup.
 *
 * Requires FINNHUB_API_KEY. Without one, returns 200 with configured: false.
 */
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase();
  if (!symbol) return NextResponse.json({ error: 'symbol param required' }, { status: 400 });

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey || apiKey === 'your_finnhub_key') {
    return NextResponse.json({ configured: false });
  }

  const url = `https://finnhub.io/api/v1/stock/short-interest?symbol=${symbol}&token=${apiKey}`;
  try {
    const r = await fetch(url, { next: { revalidate: 86400 } }); // cache 1d
    if (!r.ok) return NextResponse.json({ configured: true, error: `Upstream ${r.status}` });
    const data = (await r.json()) as { data?: Array<{ settlementDate: string; symbol: string; shortInterest: number; avgDailyShareVolume?: number }> };
    const items = (data.data ?? []).slice(0, 12).map((d) => ({
      date: d.settlementDate,
      shortInterest: d.shortInterest,
      avgDailyVolume: d.avgDailyShareVolume,
      daysToCover:
        d.avgDailyShareVolume && d.avgDailyShareVolume > 0
          ? d.shortInterest / d.avgDailyShareVolume
          : null,
    }));
    return NextResponse.json({ configured: true, items });
  } catch (e) {
    return NextResponse.json({
      configured: true,
      error: e instanceof Error ? e.message : 'fetch failed',
    });
  }
}
