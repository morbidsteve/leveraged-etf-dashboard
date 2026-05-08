'use client';

import { useEffect, useMemo, useState } from 'react';
import { useOptionsStore } from '@/store';
import { differenceInCalendarDays, format } from 'date-fns';

interface EarningsItem {
  symbol: string;
  date: string;
  hour?: string;
}

/**
 * Warns about open options positions whose expirations straddle an
 * earnings announcement. Earnings cause sudden IV crush + gap risk —
 * particularly bad for short-premium structures (iron condors, credit
 * spreads) since vol crash should help but the underlying gap can blow
 * past your short strikes.
 *
 * Pulled from /api/earnings (Finnhub, opt-in). Silent when no API key
 * is configured or no positions overlap upcoming earnings.
 */
export default function EarningsRiskBanner() {
  const positions = useOptionsStore((s) => s.positions).filter((p) => !p.closedAt);
  const [earnings, setEarnings] = useState<EarningsItem[]>([]);

  const underlyings = useMemo(
    () => Array.from(new Set(positions.map((p) => p.underlying))),
    [positions]
  );

  useEffect(() => {
    if (underlyings.length === 0) return;
    fetch(`/api/earnings?symbols=${underlyings.join(',')}`)
      .then((r) => r.json())
      .then((data) => setEarnings(data.items ?? []))
      .catch(() => setEarnings([]));
  }, [underlyings.join(',')]);

  // Match each position against earnings: warn if any leg's expiration
  // is on or after the earnings date.
  const conflicts = useMemo(() => {
    const out: { symbol: string; earningsDate: string; legSummary: string }[] = [];
    for (const p of positions) {
      const e = earnings.find((x) => x.symbol === p.underlying);
      if (!e) continue;
      const eDate = new Date(e.date);
      const anyLegExpiresAfter = p.legs.some(
        (l) => new Date(l.expiration).getTime() >= eDate.getTime()
      );
      if (!anyLegExpiresAfter) continue;
      const days = differenceInCalendarDays(eDate, new Date());
      out.push({
        symbol: p.underlying,
        earningsDate: `${format(eDate, 'MMM d')}${days >= 0 ? ` (${days}d)` : ''}${e.hour === 'bmo' ? ' BMO' : e.hour === 'amc' ? ' AMC' : ''}`,
        legSummary: `${p.structure} · ${p.legs.length} legs`,
      });
    }
    return out;
  }, [positions, earnings]);

  if (conflicts.length === 0) return null;

  return (
    <div className="card border-amber-400/30 bg-amber-500/10">
      <div className="card-body space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-amber-300 text-base">⚠</span>
          <h3 className="text-sm font-semibold text-amber-200">
            Earnings risk on {conflicts.length} position{conflicts.length === 1 ? '' : 's'}
          </h3>
        </div>
        <div className="space-y-1 text-xs">
          {conflicts.map((c, i) => (
            <div key={i} className="font-mono text-amber-100">
              <strong className="font-semibold">{c.symbol}</strong> · {c.legSummary} · earnings {c.earningsDate}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-amber-200/80 leading-relaxed mt-1">
          Position expirations straddle an earnings announcement. Short-premium
          structures profit from IV crush but lose hard on outsized moves;
          consider closing before the event or rolling out.
        </p>
      </div>
    </div>
  );
}
