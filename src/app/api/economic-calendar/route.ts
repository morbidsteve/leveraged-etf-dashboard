import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/economic-calendar?days=14
 *
 * Pulls economic events from Finnhub. We focus on the events that
 * actually move leveraged ETFs:
 *   - FOMC rate decision + statement (~1500 ET)
 *   - CPI / Core CPI release (~830 ET)
 *   - Non-farm payrolls (~830 ET)
 *   - PCE / Core PCE
 *   - GDP advance / revisions
 *   - Retail sales
 *
 * Returns: { events: Array<{ date, time, country, event, impact, actual?, forecast? }> }
 *
 * Falls back to an empty list (200) when no FINNHUB_API_KEY is set so
 * UI consumers can no-op gracefully.
 */
interface FinnhubEvent {
  country?: string;
  event?: string;
  estimate?: number | string | null;
  prev?: number | string | null;
  actual?: number | string | null;
  impact?: 'low' | 'medium' | 'high' | string;
  time?: string;
  unit?: string;
}

const HIGH_IMPACT_KEYWORDS = [
  'FOMC',
  'Fed',
  'Interest Rate',
  'CPI',
  'Core CPI',
  'PCE',
  'Non-Farm',
  'NFP',
  'Unemployment',
  'GDP',
  'Retail Sales',
  'PPI',
  'Powell',
  'Jobless Claims',
];

function isUS(c: string | undefined): boolean {
  if (!c) return false;
  const lower = c.toLowerCase();
  return lower === 'us' || lower === 'usa' || lower === 'united states';
}

export async function GET(req: NextRequest) {
  const apiKey = process.env.FINNHUB_API_KEY;
  const days = Number(req.nextUrl.searchParams.get('days') ?? 14);
  if (!apiKey) {
    return NextResponse.json({ events: [], configured: false });
  }
  const now = new Date();
  const to = new Date(now.getTime() + days * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const url = `https://finnhub.io/api/v1/calendar/economic?from=${fmt(now)}&to=${fmt(to)}&token=${apiKey}`;
  try {
    const r = await fetch(url, { next: { revalidate: 1800 } });
    if (!r.ok) {
      return NextResponse.json({ events: [], error: `Finnhub ${r.status}` });
    }
    const data = (await r.json()) as { economicCalendar?: FinnhubEvent[] };
    const all = data.economicCalendar ?? [];
    // Keep US + high-impact only
    const events = all
      .filter((e) => isUS(e.country))
      .filter((e) => {
        const name = (e.event ?? '').toLowerCase();
        if (e.impact === 'high') return true;
        return HIGH_IMPACT_KEYWORDS.some((k) => name.includes(k.toLowerCase()));
      })
      .map((e) => {
        const t = e.time ?? '';
        // Finnhub returns "YYYY-MM-DD HH:MM:SS"
        let date = '';
        let time = '';
        if (t.includes(' ')) [date, time] = t.split(' ');
        else date = t;
        return {
          date,
          time,
          country: e.country ?? 'US',
          event: e.event ?? 'Unknown',
          impact: e.impact ?? 'high',
          forecast: e.estimate ?? null,
          previous: e.prev ?? null,
          actual: e.actual ?? null,
          unit: e.unit ?? null,
        };
      })
      .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
    return NextResponse.json({ events, configured: true });
  } catch (e) {
    return NextResponse.json(
      { events: [], error: e instanceof Error ? e.message : 'fetch failed' },
      { status: 502 }
    );
  }
}
