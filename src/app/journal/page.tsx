'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePaperStore, useTradeStore, useStrategyStore } from '@/store';
import { useStoreHydration } from '@/hooks/useHydration';
import JournalEntryCard from '@/components/Journal/JournalEntryCard';
import { formatCurrency } from '@/lib/calculations';

type Source = 'all' | 'manual' | 'paper';
type Outcome = 'all' | 'win' | 'loss';

/**
 * Trade journal — every closed trade with notes, tags, and entry/exit
 * snapshot. Filterable by source (manual / paper) and outcome.
 *
 * Building this habit (note WHY each trade entered + WHAT you'd do
 * differently) is the highest-leverage skill the dashboard can
 * scaffold over time. Tag freely; tags become aggregable later.
 */
export default function JournalPage() {
  const hydrated = useStoreHydration();
  const paperClosed = usePaperStore((s) => s.closed);
  const manual = useTradeStore((s) => s.trades);
  const strategies = useStrategyStore((s) => s.strategies);
  const stratNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of strategies) m.set(s.id, s.name);
    return m;
  }, [strategies]);

  const [source, setSource] = useState<Source>('all');
  const [outcome, setOutcome] = useState<Outcome>('all');
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  // Unified entry list: paper + manual closed trades, sorted by exit time desc.
  const entries = useMemo(() => {
    if (!hydrated) return [];
    const paperEntries = paperClosed.map((t) => ({
      kind: 'paper' as const,
      id: t.id,
      ticker: t.ticker,
      strategyName: stratNameById.get(t.strategyId) ?? '—',
      shares: t.shares,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      entryAt: new Date(t.entryAt),
      exitAt: new Date(t.exitAt),
      reason: t.reason,
      realizedPnL: t.realizedPnL,
      notes: t.notes ?? '',
      tags: t.tags ?? [],
    }));
    const manualEntries = manual
      .filter((t) => t.status === 'closed')
      .map((t) => ({
        kind: 'manual' as const,
        id: t.id,
        ticker: t.ticker,
        strategyName: '—',
        shares: t.totalShares,
        entryPrice: t.avgCost,
        exitPrice:
          t.exits.length > 0
            ? t.exits.reduce((s, e) => s + e.price * e.shares, 0) /
              t.exits.reduce((s, e) => s + e.shares, 0)
            : t.avgCost,
        entryAt: new Date(t.createdAt),
        exitAt: t.closedAt ? new Date(t.closedAt) : new Date(t.createdAt),
        reason: 'Manual close',
        realizedPnL: t.realizedPnL,
        notes: t.notes ?? '',
        tags: t.tags ?? [],
      }));
    const all = [...paperEntries, ...manualEntries].sort(
      (a, b) => b.exitAt.getTime() - a.exitAt.getTime()
    );
    return all;
  }, [hydrated, paperClosed, manual, stratNameById]);

  // Tag aggregation for the filter bar
  const allTags = useMemo(() => {
    const seen = new Map<string, number>();
    for (const e of entries) for (const t of e.tags) seen.set(t, (seen.get(t) ?? 0) + 1);
    return Array.from(seen.entries()).sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (source !== 'all' && e.kind !== source) return false;
      if (outcome === 'win' && e.realizedPnL <= 0) return false;
      if (outcome === 'loss' && e.realizedPnL > 0) return false;
      if (tagFilter && !e.tags.includes(tagFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = `${e.ticker} ${e.strategyName} ${e.notes} ${e.tags.join(' ')} ${e.reason}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [entries, source, outcome, tagFilter, search]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const winners = filtered.filter((e) => e.realizedPnL > 0).length;
    const winRate = total > 0 ? (winners / total) * 100 : 0;
    const totalPnL = filtered.reduce((s, e) => s + e.realizedPnL, 0);
    const noted = filtered.filter((e) => e.notes.trim().length > 0).length;
    return { total, winRate, totalPnL, noted };
  }, [filtered]);

  return (
    <div className="min-h-screen p-4 md:p-8 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">Trade journal</h1>
          <p className="text-xs text-gray-500 mt-1">
            Every closed trade with editable notes + tags. The compounding skill.
          </p>
        </div>
        <Link
          href="/"
          className="text-[10px] uppercase tracking-widest font-mono px-2 py-1 rounded border bg-white/[0.03] border-white/10 text-gray-400 hover:text-white"
        >
          ← Dashboard
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat label="Trades" value={`${stats.total}`} />
        <Stat label="Win rate" value={`${stats.winRate.toFixed(0)}%`} />
        <Stat
          label="P&L"
          value={formatCurrency(stats.totalPnL)}
          tone={stats.totalPnL >= 0 ? 'profit' : 'loss'}
        />
        <Stat
          label="Journaled"
          value={`${stats.noted}/${stats.total}`}
          tone={stats.noted === stats.total && stats.total > 0 ? 'profit' : 'neutral'}
        />
      </div>

      <div className="card">
        <div className="card-body space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ticker, notes, tags…"
              className="input text-xs py-1.5 flex-1 min-w-[200px]"
            />
            <Pill active={source === 'all'} onClick={() => setSource('all')}>All</Pill>
            <Pill active={source === 'paper'} onClick={() => setSource('paper')}>Paper</Pill>
            <Pill active={source === 'manual'} onClick={() => setSource('manual')}>Manual</Pill>
            <span className="w-px h-5 bg-white/10" />
            <Pill active={outcome === 'all'} onClick={() => setOutcome('all')}>Any</Pill>
            <Pill active={outcome === 'win'} onClick={() => setOutcome('win')}>Wins</Pill>
            <Pill active={outcome === 'loss'} onClick={() => setOutcome('loss')}>Losses</Pill>
          </div>

          {allTags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase tracking-widest text-gray-500">Tags:</span>
              {allTags.map(([tag, count]) => (
                <button
                  key={tag}
                  onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                    tagFilter === tag
                      ? 'bg-accent/20 border-accent/40 text-accent-light'
                      : 'bg-white/[0.03] border-white/10 text-gray-400 hover:text-white'
                  }`}
                >
                  #{tag} <span className="text-gray-600">{count}</span>
                </button>
              ))}
              {tagFilter && (
                <button
                  onClick={() => setTagFilter(null)}
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-loss/40 bg-loss/10 text-loss"
                >
                  Clear ×
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="card-body text-center py-12 text-gray-500 text-sm">
            {entries.length === 0
              ? "No closed trades yet. Close a position and it'll show up here."
              : 'No trades match your filters.'}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((e) => (
            <JournalEntryCard key={`${e.kind}-${e.id}`} entry={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'profit' | 'loss' | 'neutral';
}) {
  const cls =
    tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-white';
  return (
    <div className="card">
      <div className="card-body">
        <div className="text-[10px] uppercase tracking-widest text-gray-500">{label}</div>
        <div className={`text-lg font-semibold font-mono ${cls}`}>{value}</div>
      </div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-[10px] uppercase tracking-widest font-mono px-2 py-1 rounded border ${
        active
          ? 'bg-accent/20 border-accent/40 text-accent-light'
          : 'bg-white/[0.03] border-white/10 text-gray-400 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}
