import { NextRequest, NextResponse } from 'next/server';

/**
 * Upcoming earnings via Finnhub /calendar/earnings. Filters to a list of
 * tickers if provided.
 *
 * Requires FINNHUB_API_KEY env var. Without one, returns empty gracefully.
 *
 * Response shape:
 *   { items: { symbol, date, hour?, epsEstimate?, revenueEstimate? }[] }
 */

interface FinnhubEarning {
  symbol: string;
  date: string;
  hour?: string;       // 'bmo' | 'amc' | ''
  epsEstimate?: number;
  revenueEstimate?: number;
}

export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get('symbols') ?? '';
  const symbols = symbolsParam
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey || apiKey === 'your_finnhub_key') {
    return NextResponse.json({ items: [], configured: false });
  }

  // Next 14 days
  const from = new Date();
  const to = new Date(from.getTime() + 14 * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const url = `https://finnhub.io/api/v1/calendar/earnings?from=${fmt(from)}&to=${fmt(to)}&token=${apiKey}`;

  try {
    const resp = await fetch(url, { next: { revalidate: 1800 } }); // cache 30min
    if (!resp.ok) {
      return NextResponse.json({
        items: [],
        configured: true,
        error: `Upstream ${resp.status}`,
      });
    }
    const data = (await resp.json()) as { earningsCalendar?: FinnhubEarning[] };
    const all = data.earningsCalendar ?? [];
    const filtered = symbols.length > 0
      ? all.filter((e) => symbols.includes(e.symbol.toUpperCase()))
      : all;
    const items = filtered.slice(0, 50).map((e) => ({
      symbol: e.symbol,
      date: e.date,
      hour: e.hour,
      epsEstimate: e.epsEstimate,
      revenueEstimate: e.revenueEstimate,
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
