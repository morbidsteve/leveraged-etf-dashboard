'use client';

import { useMemo, useState } from 'react';
import { useStrategyStore } from '@/store';
import { format, formatDistanceToNow } from 'date-fns';

/**
 * Engine diagnostics — observability into the strategy engine. Lives in
 * Settings → Broker, below worker status.
 *
 * Aggregates the StrategyEvent log into per-strategy + per-event-type
 * counts and surfaces the most recent activity. No new instrumentation
 * needed; we read from the existing strategyStore events array.
 */
export default function EngineDiagnosticsCard() {
  const events = useStrategyStore((s) => s.events);
  const strategies = useStrategyStore((s) => s.strategies);
  const runtimes = useStrategyStore((s) => s.runtimes);
  const [filter, setFilter] = useState<'all' | 'state_change' | 'action_emitted' | 'error'>('all');

  const stats = useMemo(() => {
    const totalEvents = events.length;
    const byType: Record<string, number> = {};
    const byStrategy: Record<string, number> = {};
    const errors: typeof events = [];
    let lastEventAt: Date | null = null;
    for (const ev of events) {
      byType[ev.type] = (byType[ev.type] ?? 0) + 1;
      byStrategy[ev.strategyId] = (byStrategy[ev.strategyId] ?? 0) + 1;
      if (ev.type === 'error') errors.push(ev);
      const t = new Date(ev.timestamp);
      if (!lastEventAt || t > lastEventAt) lastEventAt = t;
    }
    return { totalEvents, byType, byStrategy, errors, lastEventAt };
  }, [events]);

  const filteredEvents = useMemo(() => {
    let list = [...events];
    if (filter !== 'all') list = list.filter((e) => e.type === filter);
    return list
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 100);
  }, [events, filter]);

  const enabledCount = strategies.filter((s) => s.enabled).length;
  const runtimeCount = Object.keys(runtimes).length;
  const inPositionCount = Object.values(runtimes).filter((r) => r.state === 'in_position').length;
  const armedCount = Object.values(runtimes).filter((r) => r.state === 'armed').length;

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="font-medium text-white">Engine diagnostics</h2>
        <p className="text-[11px] text-gray-500 mt-1">
          Activity log + state aggregation across all strategies. Live —
          updates as the engine fires events.
        </p>
      </div>
      <div className="card-body space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <Stat
            label="Strategies"
            value={`${enabledCount} / ${strategies.length}`}
            hint="enabled / total"
          />
          <Stat
            label="Runtimes"
            value={runtimeCount.toString()}
            hint="(strategy × ticker) pairs"
          />
          <Stat
            label="In position"
            value={inPositionCount.toString()}
            tone={inPositionCount > 0 ? 'profit' : undefined}
          />
          <Stat
            label="Armed"
            value={armedCount.toString()}
          />
          <Stat
            label="Total events"
            value={stats.totalEvents.toString()}
            hint={
              stats.lastEventAt
                ? `last ${formatDistanceToNow(stats.lastEventAt, { addSuffix: true })}`
                : 'never'
            }
          />
          <Stat
            label="Actions emitted"
            value={(stats.byType.action_emitted ?? 0).toString()}
            tone={(stats.byType.action_emitted ?? 0) > 0 ? 'profit' : undefined}
          />
          <Stat
            label="State changes"
            value={(stats.byType.state_change ?? 0).toString()}
          />
          <Stat
            label="Errors"
            value={(stats.byType.error ?? 0).toString()}
            tone={stats.errors.length > 0 ? 'loss' : undefined}
          />
        </div>

        {/* Event log */}
        <div>
          <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
            <h3 className="text-[10px] uppercase tracking-widest text-gray-500">
              Recent events
            </h3>
            <div className="flex gap-1">
              {(['all', 'state_change', 'action_emitted', 'error'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded border ${
                    filter === f
                      ? 'bg-accent/20 border-accent/40 text-accent-light'
                      : 'bg-white/[0.03] border-white/10 text-gray-500'
                  }`}
                >
                  {f === 'all' ? 'all' : f.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {filteredEvents.length === 0 ? (
            <div className="text-[11px] text-gray-600 italic">No events yet</div>
          ) : (
            <div className="space-y-0.5 font-mono text-[10px] max-h-72 overflow-y-auto">
              {filteredEvents.map((e) => {
                const strategy = strategies.find((s) => s.id === e.strategyId);
                const color =
                  e.type === 'error'
                    ? 'text-loss'
                    : e.type === 'action_emitted'
                    ? 'text-profit'
                    : 'text-gray-300';
                return (
                  <div
                    key={e.id}
                    className={`flex items-start gap-2 p-1 rounded hover:bg-white/[0.03] ${color}`}
                  >
                    <span className="text-gray-600 shrink-0">
                      {format(new Date(e.timestamp), 'HH:mm:ss')}
                    </span>
                    <span className="text-gray-500 shrink-0 uppercase tracking-widest text-[9px]">
                      {e.type}
                    </span>
                    <span className="text-gray-400 shrink-0 truncate max-w-[120px]">
                      {strategy?.name ?? e.strategyId.slice(0, 8)}
                    </span>
                    <span className="truncate flex-1">{e.detail}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Per-strategy breakdown */}
        {Object.keys(stats.byStrategy).length > 0 && (
          <div>
            <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">
              Events per strategy
            </h3>
            <div className="space-y-0.5">
              {Object.entries(stats.byStrategy)
                .sort((a, b) => b[1] - a[1])
                .map(([sId, count]) => {
                  const s = strategies.find((x) => x.id === sId);
                  return (
                    <div
                      key={sId}
                      className="flex items-center gap-2 text-[11px] font-mono"
                    >
                      <span className="text-white truncate flex-1">
                        {s?.name ?? sId.slice(0, 8)}
                      </span>
                      <span className="text-gray-500 shrink-0">
                        {count} event{count === 1 ? '' : 's'}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
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
