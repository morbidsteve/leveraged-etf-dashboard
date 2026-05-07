/**
 * Market-hours helpers — keyed off US Eastern time. Yahoo timestamps are in
 * market time, so we just compare against ET hour/minute boundaries.
 *
 * Pure: no I/O, no setTimeout. Caller passes `now` (defaults to Date.now()).
 */

export type MarketSession = 'pre' | 'open' | 'post' | 'closed';

const HOLIDAYS_2026 = new Set([
  // Approximate NYSE holidays — used to widen the "closed" window so we
  // don't hammer Yahoo on holiday Mondays. Update annually.
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
  '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
]);

/**
 * Convert a Date to US Eastern Time {y, m, d, h, min, weekday} components.
 * Uses Intl rather than depending on the host timezone.
 */
function toEt(d: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sun
} {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  const weekdayStr = get('weekday');
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour') === '24' ? '00' : get('hour')),
    minute: Number(get('minute')),
    weekday: weekdayMap[weekdayStr] ?? 0,
  };
}

export function getMarketSession(now: Date = new Date()): MarketSession {
  const et = toEt(now);
  if (et.weekday === 0 || et.weekday === 6) return 'closed';
  const dateKey = `${et.year}-${String(et.month).padStart(2, '0')}-${String(et.day).padStart(2, '0')}`;
  if (HOLIDAYS_2026.has(dateKey)) return 'closed';

  const minutes = et.hour * 60 + et.minute;
  // Pre-market: 4:00–9:29 ET
  if (minutes >= 4 * 60 && minutes < 9 * 60 + 30) return 'pre';
  // Regular: 9:30–15:59 ET (close at 16:00)
  if (minutes >= 9 * 60 + 30 && minutes < 16 * 60) return 'open';
  // After-hours: 16:00–19:59 ET
  if (minutes >= 16 * 60 && minutes < 20 * 60) return 'post';
  return 'closed';
}

export interface PollPolicy {
  base: number;     // ms during regular hours
  pre: number;
  post: number;
  closed: number;
}

const DEFAULT_POLICY: PollPolicy = {
  base: 1000,
  pre: 10_000,
  post: 10_000,
  closed: 60_000,
};

export function getPollIntervalMs(
  now: Date = new Date(),
  policy: PollPolicy = DEFAULT_POLICY
): number {
  switch (getMarketSession(now)) {
    case 'open': return policy.base;
    case 'pre': return policy.pre;
    case 'post': return policy.post;
    case 'closed': return policy.closed;
  }
}

export function describeSession(s: MarketSession): string {
  switch (s) {
    case 'pre': return 'Pre-market';
    case 'open': return 'Live';
    case 'post': return 'After-hours';
    case 'closed': return 'Closed';
  }
}
