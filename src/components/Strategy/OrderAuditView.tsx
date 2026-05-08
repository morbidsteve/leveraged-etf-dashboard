'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';

interface AuditEntry {
  ts: string;
  outcome: 'allowed' | 'rejected' | 'submitted' | 'failed';
  symbol: string;
  shares: number;
  estimatedPrice: number;
  orderId?: string;
  reason?: string;
}

interface AuditConfig {
  perOrderUsdCap?: number;
  dailyOrderCount?: number;
  symbolAllowlist?: string[];
}

const OUTCOME_STYLES: Record<AuditEntry['outcome'], string> = {
  allowed: 'text-gray-300 bg-white/[0.02]',
  rejected: 'text-loss bg-loss/10',
  submitted: 'text-profit bg-profit/10',
  failed: 'text-loss bg-loss/15',
};

/**
 * Inline audit log of every recent server-side order decision. Reads
 * /api/schwab/audit which returns the append-only log + the active
 * guardrail config (per-order cap, daily count cap, symbol allowlist).
 *
 * Renders inside SchwabConnectCard so it's adjacent to the connection
 * status. Auto-refreshes when the audit drawer opens.
 */
export default function OrderAuditView() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [config, setConfig] = useState<AuditConfig>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    setError(null);
    fetch('/api/schwab/audit')
      .then((r) => r.json())
      .then((data) => {
        setEntries(data.recent ?? []);
        setConfig(data.config ?? {});
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] uppercase tracking-widest text-gray-500">
          Recent order decisions ({entries.length})
        </h4>
        <button
          onClick={refresh}
          disabled={loading}
          className="text-[10px] uppercase text-gray-500 hover:text-white"
        >
          {loading ? '…' : 'Refresh'}
        </button>
      </div>

      <div className="text-[10px] text-gray-500 font-mono">
        Caps: per-order ${config.perOrderUsdCap ?? '—'} · daily {config.dailyOrderCount ?? '—'} ·{' '}
        allowlist {config.symbolAllowlist?.length ? config.symbolAllowlist.join(',') : 'all'}
      </div>

      {error && <div className="text-[10px] text-loss">⚠ {error}</div>}

      {entries.length === 0 ? (
        <div className="text-[10px] text-gray-600 italic">
          No order activity recorded yet
        </div>
      ) : (
        <div className="space-y-1 font-mono text-[11px] max-h-48 overflow-y-auto">
          {entries.map((e, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 px-2 py-1 rounded ${OUTCOME_STYLES[e.outcome]}`}
            >
              <span className="text-gray-500 shrink-0">
                {(() => {
                  try {
                    return format(new Date(e.ts), 'MM/dd HH:mm:ss');
                  } catch {
                    return '—';
                  }
                })()}
              </span>
              <span className="uppercase shrink-0 font-bold">{e.outcome}</span>
              <span className="shrink-0">{e.symbol}</span>
              <span className="shrink-0 text-gray-400">
                {e.shares}@${e.estimatedPrice.toFixed(2)}
              </span>
              {e.orderId && (
                <span className="text-gray-500 shrink-0">#{e.orderId.slice(-8)}</span>
              )}
              {e.reason && (
                <span className="text-gray-400 truncate" title={e.reason}>
                  {e.reason}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
