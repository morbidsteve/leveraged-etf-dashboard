'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useStrategyStore, usePaperStore } from '@/store';
import type { PaperTrade, TradeSnapshot } from '@/store';
import { formatCurrency, formatPrice } from '@/lib/calculations';
import { format } from 'date-fns';
import { EmptyState } from '@/components/UI';

type Filter = 'all' | 'wins' | 'losses' | 'open';

export default function JournalPanel() {
  const strategies = useStrategyStore((s) => s.strategies);
  const closedTrades = usePaperStore((s) => s.closed);
  const openTrades = usePaperStore((s) => s.open);
  const reset = usePaperStore((s) => s.reset);
  const [filter, setFilter] = useState<Filter>('all');
  const [strategyFilter, setStrategyFilter] = useState<string | 'all'>('all');

  const filtered = useMemo(() => {
    let list = [...closedTrades].sort(
      (a, b) => new Date(b.exitAt).getTime() - new Date(a.exitAt).getTime()
    );
    if (filter === 'wins') list = list.filter((t) => t.realizedPnL > 0);
    if (filter === 'losses') list = list.filter((t) => t.realizedPnL <= 0);
    if (strategyFilter !== 'all') list = list.filter((t) => t.strategyId === strategyFilter);
    return list;
  }, [closedTrades, filter, strategyFilter]);

  const totalPnL = filtered.reduce((s, t) => s + t.realizedPnL, 0);
  const winRate =
    filtered.length > 0
      ? (filtered.filter((t) => t.realizedPnL > 0).length / filtered.length) * 100
      : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-400 max-w-2xl">
          Every paper trade auto-captures a 60-bar candle + RSI window at entry and exit. Review
          your strategy's actual decisions visually, not just from numbers.
        </p>
        <div className="flex items-center gap-2">
          <Link
            href="/journal"
            className="btn btn-ghost text-xs"
            title="Full journal — paper + manual trades, search, tags"
          >
            Open full journal →
          </Link>
          {closedTrades.length > 0 && (
            <button
              onClick={() => {
                if (confirm(`Clear all ${closedTrades.length} closed paper trades?`)) reset();
              }}
              className="btn btn-ghost text-xs"
            >
              Clear journal
            </button>
          )}
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          label="Trades"
          value={`${filtered.length}`}
          sub={openTrades.length > 0 ? `${openTrades.length} open` : undefined}
        />
        <SummaryCard
          label="Win rate"
          value={`${winRate.toFixed(0)}%`}
          tone={winRate >= 50 ? 'profit' : 'loss'}
        />
        <SummaryCard
          label="Total P&L"
          value={formatCurrency(totalPnL)}
          tone={totalPnL >= 0 ? 'profit' : 'loss'}
        />
        <SummaryCard
          label="Avg P&L"
          value={
            filtered.length > 0 ? formatCurrency(totalPnL / filtered.length) : formatCurrency(0)
          }
          tone={totalPnL >= 0 ? 'profit' : 'loss'}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="chip-group">
          {(['all', 'wins', 'losses'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`chip ${filter === f ? 'active' : ''}`}
            >
              {f === 'all' ? 'All' : f === 'wins' ? 'Wins' : 'Losses'}
            </button>
          ))}
        </div>
        {strategies.length > 1 && (
          <select
            value={strategyFilter}
            onChange={(e) => setStrategyFilter(e.target.value)}
            className="input text-xs py-1.5"
          >
            <option value="all">All strategies</option>
            {strategies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="journal"
          title={closedTrades.length === 0 ? 'No paper trades yet' : 'No trades match these filters'}
          description={
            closedTrades.length === 0
              ? 'Enable a strategy in paper mode and let it fire on a watchlist ticker. Each entry/exit auto-captures a 60-bar chart-context snapshot.'
              : 'Try a different filter or pick "All strategies" above.'
          }
          secondaryCta={
            closedTrades.length > 0
              ? {
                  label: 'Reset filters',
                  onClick: () => {
                    setFilter('all');
                    setStrategyFilter('all');
                  },
                }
              : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <JournalEntry
              key={t.id}
              trade={t}
              strategyName={strategies.find((s) => s.id === t.strategyId)?.name ?? 'Unknown strategy'}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function JournalEntry({ trade, strategyName }: { trade: PaperTrade; strategyName: string }) {
  const setNotes = usePaperStore((s) => s.setNotes);
  const setTags = usePaperStore((s) => s.setTags);
  const [notesDraft, setNotesDraft] = useState(trade.notes ?? '');
  const [tagInput, setTagInput] = useState('');
  const tags = trade.tags ?? [];
  const isWin = trade.realizedPnL > 0;
  const pnlPct =
    trade.entryPrice > 0
      ? ((trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100
      : 0;
  const holdMin = Math.round(
    (new Date(trade.exitAt).getTime() - new Date(trade.entryAt).getTime()) / 60000
  );

  return (
    <div
      className={`card border ${
        isWin ? 'border-profit/30' : 'border-loss/30'
      } overflow-hidden`}
    >
      <div className="card-header flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-bold text-white tracking-tight">{trade.ticker}</span>
          <span
            className={`badge ${isWin ? 'badge-profit' : 'badge-loss'}`}
            title="paper trade"
          >
            {isWin ? 'WIN' : 'LOSS'}
          </span>
          <span className="text-xs text-gray-500 truncate">{strategyName}</span>
        </div>
        <div className={`text-right ${isWin ? 'text-profit' : 'text-loss'}`}>
          <div className="font-mono font-bold">{formatCurrency(trade.realizedPnL)}</div>
          <div className="text-[10px] font-mono">
            {pnlPct >= 0 ? '+' : ''}
            {pnlPct.toFixed(2)}%
          </div>
        </div>
      </div>

      <div className="card-body space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <Mini label="Entry" value={`${formatPrice(trade.entryPrice)} × ${trade.shares}`} />
          <Mini label="Exit" value={formatPrice(trade.exitPrice)} />
          <Mini
            label="Hold"
            value={holdMin < 60 ? `${holdMin}m` : `${(holdMin / 60).toFixed(1)}h`}
          />
          <Mini
            label="Reason"
            value={trade.reason.length > 40 ? trade.reason.slice(0, 38) + '…' : trade.reason}
            full
          />
        </div>

        {(trade.entrySnapshot || trade.exitSnapshot) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {trade.entrySnapshot && (
              <SnapshotPanel
                snapshot={trade.entrySnapshot}
                title="Entry context"
                accent="profit"
                price={trade.entryPrice}
                at={new Date(trade.entryAt)}
              />
            )}
            {trade.exitSnapshot && (
              <SnapshotPanel
                snapshot={trade.exitSnapshot}
                title="Exit context"
                accent="loss"
                price={trade.exitPrice}
                at={new Date(trade.exitAt)}
              />
            )}
          </div>
        )}

        <div className="space-y-2 border-t border-white/5 pt-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {tags.map((t) => (
              <span
                key={t}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent/15 border border-accent/30 text-accent-light flex items-center gap-1"
              >
                #{t}
                <button
                  onClick={() => setTags(trade.id, tags.filter((x) => x !== t))}
                  className="text-accent-light/60 hover:text-loss"
                  aria-label="remove tag"
                >
                  ×
                </button>
              </span>
            ))}
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const t = tagInput.trim().replace(/^#/, '');
                  if (!t || tags.includes(t)) return setTagInput('');
                  setTags(trade.id, [...tags, t]);
                  setTagInput('');
                }
              }}
              placeholder="+ tag"
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.03] border border-dashed border-white/15 text-white w-20"
            />
          </div>
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            onBlur={() => {
              if (notesDraft !== (trade.notes ?? '')) setNotes(trade.id, notesDraft);
            }}
            placeholder="Why did this fire? What's the lesson? (auto-saves on blur)"
            rows={notesDraft ? Math.min(6, Math.max(2, notesDraft.split('\n').length)) : 2}
            className="input w-full text-xs py-1.5 leading-snug resize-y"
          />
        </div>

        <div className="text-[10px] text-gray-600 flex items-center justify-between border-t border-white/5 pt-2">
          <span>
            Entry {format(new Date(trade.entryAt), 'MMM dd HH:mm')} → Exit{' '}
            {format(new Date(trade.exitAt), 'MMM dd HH:mm')}
          </span>
          <span className="font-mono">id {trade.id.slice(0, 8)}</span>
        </div>
      </div>
    </div>
  );
}

function SnapshotPanel({
  snapshot,
  title,
  accent,
  price,
  at,
}: {
  snapshot: TradeSnapshot;
  title: string;
  accent: 'profit' | 'loss';
  price: number;
  at: Date;
}) {
  return (
    <div className="rounded-lg p-3 bg-white/[0.03] border border-white/5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-widest text-gray-500">{title}</div>
        <div className="text-[10px] text-gray-400 font-mono">
          {formatPrice(price)} · {format(at, 'HH:mm:ss')}
        </div>
      </div>
      <SnapshotChart snapshot={snapshot} accent={accent} />
    </div>
  );
}

function SnapshotChart({
  snapshot,
  accent,
}: {
  snapshot: TradeSnapshot;
  accent: 'profit' | 'loss';
}) {
  const w = 360;
  const priceH = 80;
  const rsiH = 36;
  const totalH = priceH + rsiH + 8;

  const closes = snapshot.closes;
  if (closes.length < 2) {
    return (
      <div className="text-[10px] text-gray-600 italic h-20 flex items-center justify-center">
        not enough data for snapshot
      </div>
    );
  }

  const minP = Math.min(...closes.map((c) => c.close));
  const maxP = Math.max(...closes.map((c) => c.close));
  const rangeP = maxP - minP || 1;

  const xs = closes.map((_, i) => (i / Math.max(1, closes.length - 1)) * w);
  const ys = closes.map((c) => priceH - ((c.close - minP) / rangeP) * priceH);
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');

  // Marker x position (closest close to markerTime)
  const markerIdx = closes.findIndex((c) => c.time >= snapshot.markerTime);
  const mx = xs[markerIdx >= 0 ? markerIdx : closes.length - 1];

  // RSI sub-chart
  const rsi = snapshot.rsi;
  const rsiX = rsi.map((r) => {
    const closeIdx = closes.findIndex((c) => c.time === r.time);
    return closeIdx >= 0 ? xs[closeIdx] : 0;
  });
  const rsiY = rsi.map((r) => priceH + 8 + (rsiH - (r.value / 100) * rsiH));
  const rsiPath = rsi
    .map((_, i) => `${i === 0 ? 'M' : 'L'}${rsiX[i].toFixed(1)},${rsiY[i].toFixed(1)}`)
    .join(' ');
  const oversoldY = priceH + 8 + (rsiH - (snapshot.oversold / 100) * rsiH);
  const overboughtY = priceH + 8 + (rsiH - (snapshot.overbought / 100) * rsiH);

  const stroke = accent === 'profit' ? '#22c55e' : '#ef4444';

  return (
    <svg
      viewBox={`0 0 ${w} ${totalH}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height: `${totalH}px` }}
    >
      {/* Price area fill */}
      <polyline
        points={`0,${priceH} ${xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')} ${w},${priceH}`}
        fill={`${stroke}22`}
        stroke="none"
      />
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />

      {/* Marker */}
      <line
        x1={mx}
        x2={mx}
        y1={0}
        y2={priceH}
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      <circle cx={mx} cy={ys[markerIdx >= 0 ? markerIdx : closes.length - 1]} r="3" fill={stroke} />

      {/* Divider */}
      <line
        x1={0}
        x2={w}
        y1={priceH + 4}
        y2={priceH + 4}
        stroke="rgba(255,255,255,0.05)"
      />

      {/* RSI bands */}
      <line
        x1={0}
        x2={w}
        y1={oversoldY}
        y2={oversoldY}
        stroke="rgba(34,197,94,0.4)"
        strokeWidth="0.8"
        strokeDasharray="2 3"
      />
      <line
        x1={0}
        x2={w}
        y1={overboughtY}
        y2={overboughtY}
        stroke="rgba(239,68,68,0.4)"
        strokeWidth="0.8"
        strokeDasharray="2 3"
      />

      {/* RSI line */}
      {rsi.length > 1 && (
        <path d={rsiPath} fill="none" stroke="#9ba3b4" strokeWidth="1.2" />
      )}

      {/* RSI labels */}
      <text x={4} y={oversoldY - 1} fill="#22c55e" fontSize="8" fontFamily="ui-monospace">
        {snapshot.oversold}
      </text>
      <text x={4} y={overboughtY - 1} fill="#ef4444" fontSize="8" fontFamily="ui-monospace">
        {snapshot.overbought}
      </text>
    </svg>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'profit' | 'loss';
}) {
  const cls = tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-white';
  return (
    <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5">
      <div className="text-[10px] uppercase tracking-widest text-gray-500">{label}</div>
      <div className={`text-xl font-bold font-mono mt-0.5 ${cls}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Mini({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2 lg:col-span-1' : ''}>
      <div className="text-[9px] text-gray-500 uppercase tracking-widest">{label}</div>
      <div className="font-mono text-xs text-gray-200">{value}</div>
    </div>
  );
}
