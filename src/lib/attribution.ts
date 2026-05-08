import { PaperTrade } from '@/store/paperStore';

/**
 * Performance attribution — break down P&L across slicing dimensions
 * to find which subsets of your trading actually make money.
 *
 * Pure functions. UI in a later commit.
 */

export interface AttributionBucket {
  key: string;
  label: string;
  trades: number;
  wins: number;
  totalPnL: number;
  avgPnL: number;
  winRate: number;
  bestTrade: number;
  worstTrade: number;
}

/** Slice paper trades by ticker. */
export function attributeByTicker(trades: PaperTrade[]): AttributionBucket[] {
  return bucketize(trades, (t) => t.ticker, (k) => k);
}

/** Slice by strategy. */
export function attributeByStrategy(
  trades: PaperTrade[],
  strategyNameById: Record<string, string>
): AttributionBucket[] {
  return bucketize(
    trades,
    (t) => t.strategyId,
    (id) => strategyNameById[id] ?? id.slice(0, 8)
  );
}

/** Slice by hour of day (entry time, ET-equivalent local hour). */
export function attributeByHour(trades: PaperTrade[]): AttributionBucket[] {
  return bucketize(
    trades,
    (t) => String(new Date(t.entryAt).getHours()),
    (h) => `${h}:00`
  );
}

/** Slice by day of week. */
export function attributeByDayOfWeek(trades: PaperTrade[]): AttributionBucket[] {
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return bucketize(
    trades,
    (t) => String(new Date(t.entryAt).getDay()),
    (d) => labels[parseInt(d, 10)] ?? d
  );
}

/** Slice by hold-time bucket (≤5min, 5-30min, 30min-2h, 2h-1d, >1d). */
export function attributeByHoldTime(trades: PaperTrade[]): AttributionBucket[] {
  const bucketOf = (mins: number): string => {
    if (mins <= 5) return '0-5m';
    if (mins <= 30) return '5-30m';
    if (mins <= 120) return '30m-2h';
    if (mins <= 1440) return '2h-1d';
    return '>1d';
  };
  return bucketize(
    trades,
    (t) => {
      const mins = (new Date(t.exitAt).getTime() - new Date(t.entryAt).getTime()) / 60_000;
      return bucketOf(mins);
    },
    (k) => k
  );
}

function bucketize(
  trades: PaperTrade[],
  keyFn: (t: PaperTrade) => string,
  labelFn: (k: string) => string
): AttributionBucket[] {
  const buckets = new Map<string, PaperTrade[]>();
  for (const t of trades) {
    const k = keyFn(t);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(t);
  }
  const out: AttributionBucket[] = [];
  const entries = Array.from(buckets.entries());
  for (const [key, list] of entries) {
    const wins = list.filter((t) => t.realizedPnL > 0);
    const total = list.reduce((s, t) => s + t.realizedPnL, 0);
    const pnls = list.map((t) => t.realizedPnL);
    out.push({
      key,
      label: labelFn(key),
      trades: list.length,
      wins: wins.length,
      totalPnL: total,
      avgPnL: total / list.length,
      winRate: (wins.length / list.length) * 100,
      bestTrade: Math.max(...pnls),
      worstTrade: Math.min(...pnls),
    });
  }
  return out.sort((a, b) => b.totalPnL - a.totalPnL);
}
