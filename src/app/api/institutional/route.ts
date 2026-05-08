import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/institutional?symbol=NVDA — top institutional holders via
 * Finnhub. Surface large 13F-reported positions and their changes.
 *
 * Requires FINNHUB_API_KEY (premium tier for some endpoints — falls
 * back to free /investors when premium not available).
 */
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase();
  if (!symbol) return NextResponse.json({ error: 'symbol param required' }, { status: 400 });

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey || apiKey === 'your_finnhub_key') {
    return NextResponse.json({ configured: false });
  }

  // Try the institutional-portfolio endpoint first (premium); fall back
  // to /stock/ownership which is free-tier.
  const url = `https://finnhub.io/api/v1/stock/ownership?symbol=${symbol}&limit=20&token=${apiKey}`;
  try {
    const r = await fetch(url, { next: { revalidate: 86400 } });
    if (!r.ok) return NextResponse.json({ configured: true, error: `Upstream ${r.status}` });
    const data = (await r.json()) as { ownership?: Array<{ name: string; share: number; change: number; filingDate: string; portfolioPercent?: number }> };
    const holders = (data.ownership ?? []).slice(0, 20).map((h) => ({
      name: h.name,
      shares: h.share,
      change: h.change,
      direction: h.change > 0 ? 'increased' : h.change < 0 ? 'decreased' : 'unchanged',
      filingDate: h.filingDate,
      portfolioPercent: h.portfolioPercent,
    }));
    return NextResponse.json({ configured: true, holders });
  } catch (e) {
    return NextResponse.json({
      configured: true,
      error: e instanceof Error ? e.message : 'fetch failed',
    });
  }
}
