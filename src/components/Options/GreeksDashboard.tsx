'use client';

import { useEffect, useMemo, useState } from 'react';
import { useOptionsStore } from '@/store';
import { OptionContract } from '@/types/options';
import { formatCurrency } from '@/lib/calculations';

/**
 * Aggregate Greeks across all open options positions. Net delta /
 * theta / vega answer "what's my book look like right now?"
 *
 * Refresh: re-fetches each underlying's chain on a 30s tick when
 * mounted. Cached chains shared with the rest of the panel via
 * the API's upstream caching.
 */
export default function GreeksDashboard() {
  const positions = useOptionsStore((s) => s.positions).filter((p) => !p.closedAt);
  const [legGreeks, setLegGreeks] = useState<Record<string, OptionContract>>({});
  const [loading, setLoading] = useState(false);

  const underlyings = useMemo(
    () => Array.from(new Set(positions.map((p) => p.underlying))),
    [positions]
  );

  const refresh = async () => {
    if (underlyings.length === 0) return;
    setLoading(true);
    try {
      const next: Record<string, OptionContract> = {};
      for (const u of underlyings) {
        const r = await fetch(`/api/options/chain?symbol=${encodeURIComponent(u)}`);
        const chain = await r.json();
        if (!chain.configured) continue;
        for (const exp of chain.expirations) {
          for (const c of Object.values(exp.calls) as OptionContract[]) {
            next[c.symbol] = c;
          }
          for (const c of Object.values(exp.puts) as OptionContract[]) {
            next[c.symbol] = c;
          }
        }
      }
      setLegGreeks(next);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const i = setInterval(refresh, 30_000);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [underlyings.join(',')]);

  if (positions.length === 0) return null;

  // Aggregate
  let netDelta = 0;
  let netGamma = 0;
  let netTheta = 0;
  let netVega = 0;
  let totalCost = 0;
  for (const p of positions) {
    totalCost += p.netCost;
    for (const l of p.legs) {
      const c = legGreeks[l.contractSymbol];
      if (!c) continue;
      const sign =
        l.instruction === 'BUY_TO_OPEN' || l.instruction === 'BUY_TO_CLOSE' ? 1 : -1;
      netDelta += sign * c.delta * l.quantity * 100;
      netGamma += sign * c.gamma * l.quantity * 100;
      netTheta += sign * c.theta * l.quantity * 100;
      netVega += sign * c.vega * l.quantity * 100;
    }
  }

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Aggregate Greeks · {positions.length} position{positions.length === 1 ? '' : 's'}</h3>
        <button
          onClick={refresh}
          disabled={loading}
          className="text-[10px] uppercase tracking-widest text-gray-500 hover:text-white"
        >
          {loading ? '…' : 'Refresh'}
        </button>
      </div>
      <div className="card-body grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Stat
          label="Net delta"
          value={netDelta.toFixed(0)}
          hint="$/$ exposure to underlying"
          tone={netDelta > 0 ? 'profit' : netDelta < 0 ? 'loss' : undefined}
        />
        <Stat label="Net gamma" value={netGamma.toFixed(0)} hint="rate of Δ change" />
        <Stat
          label="Net theta"
          value={`${netTheta >= 0 ? '+' : ''}${netTheta.toFixed(0)}/d`}
          hint="$ per day decay"
          tone={netTheta > 0 ? 'profit' : netTheta < 0 ? 'loss' : undefined}
        />
        <Stat label="Net vega" value={netVega.toFixed(0)} hint="$ per 1% IV move" />
        <Stat
          label="Net cost"
          value={formatCurrency(Math.abs(totalCost))}
          hint={totalCost < 0 ? 'credit received' : 'debit paid'}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'profit' | 'loss';
}) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/5 p-2">
      <div className="text-[9px] uppercase tracking-widest text-gray-500">{label}</div>
      <div
        className={`text-sm font-mono font-semibold mt-0.5 ${
          tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-white'
        }`}
      >
        {value}
      </div>
      {hint && <div className="text-[9px] text-gray-500 mt-0.5">{hint}</div>}
    </div>
  );
}
