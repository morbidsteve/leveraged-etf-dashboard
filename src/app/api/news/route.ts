import { NextRequest, NextResponse } from 'next/server';

/**
 * Per-ticker news headlines via Finnhub /company-news.
 *
 * Requires FINNHUB_API_KEY env var. Without one, returns 200 with an empty
 * array so the UI degrades gracefully (renders "no news" instead of an error).
 *
 * Response shape:
 *   { items: { id, headline, summary, source, url, datetime }[] }
 */

interface FinnhubNews {
  category: string;
  datetime: number;
  headline: string;
  id: number;
  image?: string;
  related?: string;
  source: string;
  summary?: string;
  url: string;
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase();
  if (!symbol) {
    return NextResponse.json({ error: 'symbol param required' }, { status: 400 });
  }

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey || apiKey === 'your_finnhub_key') {
    // Graceful degrade — UI shows "configure FINNHUB_API_KEY" hint
    return NextResponse.json({ items: [], configured: false });
  }

  // Last 7 days
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const url = `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${fmt(from)}&to=${fmt(to)}&token=${apiKey}`;

  try {
    const resp = await fetch(url, { next: { revalidate: 300 } }); // cache 5min
    if (!resp.ok) {
      return NextResponse.json({ items: [], configured: true, error: `Upstream ${resp.status}` });
    }
    const raw = (await resp.json()) as FinnhubNews[];
    const items = (raw ?? []).slice(0, 10).map((n) => ({
      id: n.id,
      headline: n.headline,
      summary: n.summary?.slice(0, 240) ?? '',
      source: n.source,
      url: n.url,
      datetime: n.datetime, // unix seconds
    }));
    return NextResponse.json({ items, configured: true });
  } catch (e) {
    return NextResponse.json({
      items: [],
      configured: true,
      error: e instanceof Error ? e.message : 'fetch failed',
    });
  }
}
