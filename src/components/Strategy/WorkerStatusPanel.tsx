'use client';

import { useEffect, useState } from 'react';
import { useStrategyStore } from '@/store';
import { showToast } from '@/components/UI';
import { format } from 'date-fns';

interface WorkerStatus {
  startedAt: string;
  lastTickAt: string | null;
  ticks: number;
  errors: number;
  strategyCount: number;
  runtimeCount: number;
  recentEvents: { ts: string; type: string; detail: string }[];
}

interface WorkerStatusResponse {
  enabled: boolean;
  status: WorkerStatus | null;
}

/**
 * Status panel for the server-side strategy worker (Sprint 13). Shows whether
 * SERVER_WORKER_ENABLED=1 is set, when the worker last ticked, how many
 * strategies it's tracking, and the recent fire log. Provides a "Sync now"
 * button that pushes the browser's strategy list up to the worker.
 *
 * Lives inside the Settings → Broker tab area (next to the Schwab card)
 * so the operational controls cluster together.
 */
export default function WorkerStatusPanel() {
  const [data, setData] = useState<WorkerStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const strategies = useStrategyStore((s) => s.strategies);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/worker/status');
      const j = await r.json();
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const sync = async () => {
    try {
      const r = await fetch('/api/worker/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategies }),
      });
      const j = await r.json();
      if (j.error) {
        showToast(j.error, 'error', 5000);
        return;
      }
      showToast(`Synced ${j.count} strategies to server worker`);
      refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Sync failed', 'error');
    }
  };

  useEffect(() => {
    refresh();
    const i = setInterval(refresh, 15_000);
    return () => clearInterval(i);
  }, []);

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <div>
          <h3 className="font-medium text-white text-sm">Server-side strategy worker</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">
            Runs the strategy engine even when no browser tab is open. Opt-in
            via SERVER_WORKER_ENABLED=1 in env. Read-only "shadow run" — does
            not place broker orders yet.
          </p>
        </div>
        <button onClick={refresh} disabled={loading} className="btn btn-ghost text-xs">
          {loading ? '…' : 'Refresh'}
        </button>
      </div>
      <div className="card-body space-y-3">
        {error && <div className="text-xs text-loss">⚠ {error}</div>}
        {!data ? (
          <div className="text-xs text-gray-500 italic">Loading…</div>
        ) : !data.enabled ? (
          <div className="space-y-2">
            <div className="badge badge-neutral">Disabled</div>
            <div className="text-xs text-gray-400">
              Set <code className="text-accent-light">SERVER_WORKER_ENABLED=1</code> in your{' '}
              <code className="text-accent-light">.env</code> and restart the container to enable
              tab-independent strategy ticking. Until then, strategies only
              fire while a browser tab is open.
            </div>
          </div>
        ) : !data.status ? (
          <div className="text-xs text-gray-400">
            Worker is enabled but hasn't reported yet. Wait ~10s for the first
            tick.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <Stat
                label="Status"
                value={
                  data.status.lastTickAt
                    ? `Last tick ${formatAge(data.status.lastTickAt)} ago`
                    : 'Idle'
                }
                color="profit"
              />
              <Stat label="Ticks" value={data.status.ticks.toString()} />
              <Stat
                label="Strategies"
                value={`${data.status.strategyCount} synced`}
                hint={`${data.status.runtimeCount} runtimes`}
              />
              <Stat
                label="Errors"
                value={data.status.errors.toString()}
                color={data.status.errors > 0 ? 'loss' : undefined}
              />
            </div>

            <div className="flex items-center gap-2">
              <button onClick={sync} className="btn btn-primary text-xs">
                Sync {strategies.length} strategies → worker
              </button>
              <span className="text-[10px] text-gray-500">
                Run after creating/editing a strategy
              </span>
            </div>

            <div>
              <h4 className="text-[9px] uppercase tracking-widest text-gray-500 mb-1">
                Recent worker events
              </h4>
              {data.status.recentEvents.length === 0 ? (
                <div className="text-[11px] text-gray-600 italic">No events yet</div>
              ) : (
                <div className="space-y-0.5 max-h-48 overflow-y-auto font-mono text-[10px]">
                  {data.status.recentEvents.map((e, i) => (
                    <div
                      key={i}
                      className={`flex gap-2 ${
                        e.type === 'error'
                          ? 'text-loss'
                          : e.type === 'action'
                          ? 'text-profit'
                          : 'text-gray-400'
                      }`}
                    >
                      <span className="text-gray-600 shrink-0">
                        {format(new Date(e.ts), 'HH:mm:ss')}
                      </span>
                      <span className="shrink-0 uppercase">{e.type}</span>
                      <span className="truncate">{e.detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string;
  hint?: string;
  color?: 'profit' | 'loss';
}) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/5 p-2">
      <div className="text-[9px] uppercase tracking-widest text-gray-500">{label}</div>
      <div
        className={`text-xs font-mono font-semibold mt-0.5 ${
          color === 'profit'
            ? 'text-profit'
            : color === 'loss'
            ? 'text-loss'
            : 'text-white'
        }`}
      >
        {value}
      </div>
      {hint && <div className="text-[9px] text-gray-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}
