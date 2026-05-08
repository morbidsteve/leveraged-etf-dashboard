import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/insider?symbol=NVDA
 *
 * Insider transactions (Form 4 filings) via Finnhub. Tracks corporate
 * insider buys/sells — large insider buys can signal confidence in
 * the company; large sells can signal the opposite (or just liquidity
 * needs).
 *
 * Requires FINNHUB_API_KEY. Without one, returns 200 with configured: false
 * so the UI degrades gracefully.
 */

interface FinnhubInsiderTx {
  name: string;
  share: number;          // shares
  change: number;         // change (+ buy / - sell)
  filingDate: string;     // YYYY-MM-DD
  transactionDate: string;
  transactionPrice: number;
  transactionCode: string; // P=purchase, S=sale, etc.
  symbol: string;
  position?: string;      // e.g. "CEO", "Director"
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase();
  if (!symbol) {
    return NextResponse.json({ error: 'symbol param required' }, { status: 400 });
  }

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey || apiKey === 'your_finnhub_key') {
    return NextResponse.json({ items: [], configured: false });
  }

  // Last 90 days
  const to = new Date();
  const from = new Date(to.getTime() - 90 * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const url = `https://finnhub.io/api/v1/stock/insider-transactions?symbol=${symbol}&from=${fmt(from)}&to=${fmt(to)}&token=${apiKey}`;

  try {
    const resp = await fetch(url, { next: { revalidate: 3600 } }); // cache 1hr
    if (!resp.ok) {
      return NextResponse.json({
        items: [],
        configured: true,
        error: `Upstream ${resp.status}`,
      });
    }
    const data = (await resp.json()) as { data?: FinnhubInsiderTx[] };
    const raw = data.data ?? [];

    // Aggregate stats
    let totalBuyShares = 0;
    let totalSellShares = 0;
    let totalBuyValue = 0;
    let totalSellValue = 0;
    for (const tx of raw) {
      const value = Math.abs(tx.change) * (tx.transactionPrice ?? 0);
      if (tx.change > 0) {
        totalBuyShares += tx.change;
        totalBuyValue += value;
      } else if (tx.change < 0) {
        totalSellShares += Math.abs(tx.change);
        totalSellValue += value;
      }
    }

    const items = raw.slice(0, 30).map((tx) => ({
      name: tx.name,
      position: tx.position,
      change: tx.change,
      shares: Math.abs(tx.change),
      direction: tx.change > 0 ? 'buy' : tx.change < 0 ? 'sell' : 'flat',
      price: tx.transactionPrice,
      value: Math.abs(tx.change) * (tx.transactionPrice ?? 0),
      date: tx.transactionDate,
      code: tx.transactionCode,
    }));

    return NextResponse.json({
      items,
      configured: true,
      summary: {
        totalBuyShares,
        totalSellShares,
        totalBuyValue,
        totalSellValue,
        netShares: totalBuyShares - totalSellShares,
        netValue: totalBuyValue - totalSellValue,
        windowDays: 90,
      },
    });
  } catch (e) {
    return NextResponse.json({
      items: [],
      configured: true,
      error: e instanceof Error ? e.message : 'fetch failed',
    });
  }
}
