'use client';

import { useState } from 'react';
import { usePaperStore, useTradeStore } from '@/store';
import { formatCurrency } from '@/lib/calculations';
import { format } from 'date-fns';

export interface JournalEntry {
  kind: 'paper' | 'manual';
  id: string;
  ticker: string;
  strategyName: string;
  shares: number;
  entryPrice: number;
  exitPrice: number;
  entryAt: Date;
  exitAt: Date;
  reason: string;
  realizedPnL: number;
  notes: string;
  tags: string[];
}

/**
 * One closed-trade entry with inline notes editor and tag chips.
 * Persists writes to the right store (paper vs manual) on blur.
 */
export default function JournalEntryCard({ entry }: { entry: JournalEntry }) {
  const setPaperNotes = usePaperStore((s) => s.setNotes);
  const setPaperTags = usePaperStore((s) => s.setTags);
  const updateManual = useTradeStore((s) => s.updateTrade);

  const [notes, setNotes] = useState(entry.notes);
  const [tagDraft, setTagDraft] = useState('');
  const [tags, setTags] = useState<string[]>(entry.tags);
  const [editing, setEditing] = useState(false);

  const win = entry.realizedPnL > 0;
  const pct = entry.entryPrice > 0
    ? ((entry.exitPrice - entry.entryPrice) / entry.entryPrice) * 100
    : 0;
  const holdMin = (entry.exitAt.getTime() - entry.entryAt.getTime()) / 60_000;
  const holdLabel =
    holdMin < 60
      ? `${holdMin.toFixed(0)}m`
      : holdMin < 60 * 24
      ? `${(holdMin / 60).toFixed(1)}h`
      : `${(holdMin / 60 / 24).toFixed(1)}d`;

  const persistNotes = () => {
    if (notes === entry.notes) return;
    if (entry.kind === 'paper') setPaperNotes(entry.id, notes);
    else updateManual(entry.id, { notes });
  };

  const persistTags = (next: string[]) => {
    setTags(next);
    if (entry.kind === 'paper') setPaperTags(entry.id, next);
    else updateManual(entry.id, { tags: next });
  };

  const addTag = () => {
    const t = tagDraft.trim().replace(/^#/, '');
    if (!t) return;
    if (tags.includes(t)) {
      setTagDraft('');
      return;
    }
    persistTags([...tags, t]);
    setTagDraft('');
  };

  const removeTag = (t: string) => persistTags(tags.filter((x) => x !== t));

  return (
    <div
      className={`card border-l-2 ${
        win ? 'border-l-profit/60' : 'border-l-loss/60'
      }`}
    >
      <div className="card-body space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-bold text-white">{entry.ticker}</span>
              <span
                className={`text-[9px] uppercase tracking-widest font-mono px-1.5 py-0.5 rounded ${
                  entry.kind === 'paper'
                    ? 'bg-accent/15 border border-accent/30 text-accent-light'
                    : 'bg-white/[0.03] border border-white/10 text-gray-400'
                }`}
              >
                {entry.kind}
              </span>
              {entry.strategyName !== '—' && (
                <span className="text-[10px] text-gray-500 truncate">
                  · {entry.strategyName}
                </span>
              )}
            </div>
            <div className="text-[11px] text-gray-400 font-mono mt-1">
              {entry.shares} shares · ${entry.entryPrice.toFixed(2)} → ${entry.exitPrice.toFixed(2)} · {holdLabel}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              {format(entry.entryAt, 'MMM d, HH:mm')} → {format(entry.exitAt, 'MMM d, HH:mm')}
            </div>
            {entry.reason && entry.reason !== 'Manual close' && (
              <div className="text-[10px] text-gray-500 italic mt-0.5">
                exit: {entry.reason}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className={`text-lg font-bold font-mono ${win ? 'text-profit' : 'text-loss'}`}>
              {formatCurrency(entry.realizedPnL)}
            </div>
            <div className={`text-[11px] font-mono ${win ? 'text-profit' : 'text-loss'}`}>
              {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {tags.map((t) => (
            <span
              key={t}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent/15 border border-accent/30 text-accent-light flex items-center gap-1"
            >
              #{t}
              <button
                onClick={() => removeTag(t)}
                className="text-accent-light/60 hover:text-loss"
                aria-label={`Remove tag ${t}`}
              >
                ×
              </button>
            </span>
          ))}
          {editing ? (
            <input
              type="text"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                } else if (e.key === 'Escape') {
                  setTagDraft('');
                }
              }}
              onBlur={addTag}
              placeholder="add tag…"
              autoFocus
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.03] border border-white/10 text-white w-24"
            />
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.03] border border-dashed border-white/15 text-gray-500 hover:text-white"
            >
              + tag
            </button>
          )}
        </div>

        <div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={persistNotes}
            placeholder="What were you thinking? What's the lesson? (Notes auto-save on blur.)"
            rows={notes ? Math.min(8, Math.max(2, notes.split('\n').length)) : 2}
            className="input w-full text-xs py-2 resize-y leading-snug"
          />
        </div>
      </div>
    </div>
  );
}
