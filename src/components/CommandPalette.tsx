'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useStrategyStore,
  useSettingsStore,
  usePriceStore,
  usePaperStore,
} from '@/store';

export type PaletteAction =
  | { kind: 'open-drawer'; view: string; label: string }
  | { kind: 'select-ticker'; ticker: string }
  | { kind: 'expand-strategy'; strategyId: string; strategyName: string }
  | { kind: 'set-active-watchlist'; id: string; name: string }
  | { kind: 'help'; topic: string };

export interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  category: string;
  action: PaletteAction;
  /** Lower = better. Used for ranking. */
  score?: number;
}

/**
 * Universal Cmd+K command palette. Fuzzy-matches across drawers, watchlist
 * tickers, strategies, and watchlists. Selecting an item dispatches a
 * window event the dashboard already listens for (etf-open-drawer) or sets
 * store state directly.
 *
 * Mounts once at the app root. Open via Cmd/Ctrl+K (or just K when not
 * in an input). Esc / outside-click closes. Up/Down navigates results;
 * Enter selects.
 */
export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const strategies = useStrategyStore((s) => s.strategies);
  const settings = useSettingsStore((s) => s.settings);
  const setActiveWatchlist = useSettingsStore((s) => s.setActiveWatchlist);
  const setSelectedTicker = usePriceStore((s) => s.setSelectedTicker);

  // Build catalog of items
  const items: PaletteItem[] = useMemo(() => {
    const out: PaletteItem[] = [];

    // Drawers
    const drawers = [
      { view: 'strategies', label: 'Strategies' },
      { view: 'monitor', label: 'Live monitor' },
      { view: 'backtest', label: 'Backtest' },
      { view: 'journal', label: 'Trade journal' },
      { view: 'trades', label: 'Trade history' },
      { view: 'analytics', label: 'Analytics' },
      { view: 'scanner', label: 'Scanner' },
      { view: 'calculator', label: 'Position calculator' },
      { view: 'alerts', label: 'Alerts & rules' },
      { view: 'options', label: 'Options chain & positions' },
      { view: 'settings', label: 'Settings' },
      { view: 'newTrade', label: 'New trade' },
    ];
    for (const d of drawers) {
      out.push({
        id: `drawer-${d.view}`,
        label: `Open ${d.label}`,
        category: 'Navigate',
        action: { kind: 'open-drawer', view: d.view, label: d.label },
      });
    }

    // Watchlist tickers (active list)
    const tickers = settings.watchlist ?? [];
    for (const t of tickers) {
      out.push({
        id: `ticker-${t}`,
        label: t,
        hint: 'Set as active ticker',
        category: 'Tickers',
        action: { kind: 'select-ticker', ticker: t },
      });
    }

    // Strategies
    for (const s of strategies) {
      out.push({
        id: `strategy-${s.id}`,
        label: s.name,
        hint: `${s.tickers.join(', ')} · ${s.mode}${s.enabled ? ' · enabled' : ''}`,
        category: 'Strategies',
        action: { kind: 'expand-strategy', strategyId: s.id, strategyName: s.name },
      });
    }

    // Watchlists (multi-list switcher)
    for (const wl of settings.watchlists ?? []) {
      out.push({
        id: `wl-${wl.id}`,
        label: `Switch to "${wl.name}"`,
        hint: `${wl.tickers.length} tickers`,
        category: 'Watchlists',
        action: { kind: 'set-active-watchlist', id: wl.id, name: wl.name },
      });
    }

    // Help
    out.push({
      id: 'help-shortcuts',
      label: 'Keyboard shortcuts',
      category: 'Help',
      action: { kind: 'help', topic: 'shortcuts' },
    });

    return out;
  }, [strategies, settings]);

  const filtered = useMemo(() => filterAndRank(items, query), [items, query]);

  // Keyboard wiring — open with Cmd/Ctrl+K (or "k" when not in an input)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inField =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === '?' && !inField) {
        e.preventDefault();
        setOpen(true);
        setQuery('shortcuts');
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Reset active index when results change
  useEffect(() => {
    setActiveIdx(0);
  }, [filtered.length, query]);

  const runAction = (item: PaletteItem) => {
    const a = item.action;
    setOpen(false);
    if (a.kind === 'open-drawer') {
      window.dispatchEvent(new CustomEvent('etf-open-drawer', { detail: a.view }));
    } else if (a.kind === 'select-ticker') {
      setSelectedTicker(a.ticker);
    } else if (a.kind === 'expand-strategy') {
      window.dispatchEvent(new CustomEvent('etf-open-drawer', { detail: 'strategies' }));
      // hand-off via separate event for the Strategies panel to expand the row
      window.dispatchEvent(
        new CustomEvent('etf-expand-strategy', { detail: a.strategyId })
      );
    } else if (a.kind === 'set-active-watchlist') {
      setActiveWatchlist(a.id);
    } else if (a.kind === 'help') {
      window.dispatchEvent(new CustomEvent('etf-show-shortcuts-help'));
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-start justify-center pt-[10vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="glass-strong rounded-xl w-full max-w-xl mx-4 shadow-glow overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 border-b border-white/10">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setOpen(false);
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIdx((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (filtered[activeIdx]) runAction(filtered[activeIdx]);
              }
            }}
            placeholder="Search drawers, tickers, strategies… (Esc to close)"
            className="w-full bg-transparent text-white text-base placeholder:text-gray-500 focus:outline-none px-1"
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">
              No matches for "{query}"
            </div>
          ) : (
            <CategoryGroups items={filtered} activeIdx={activeIdx} onSelect={runAction} />
          )}
        </div>
        <div className="p-2 border-t border-white/5 flex items-center gap-3 text-[10px] text-gray-500 uppercase tracking-widest">
          <span>
            <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> nav
          </span>
          <span>
            <kbd className="kbd">↵</kbd> select
          </span>
          <span>
            <kbd className="kbd">Esc</kbd> close
          </span>
          <span className="ml-auto">
            <kbd className="kbd">⌘K</kbd> toggle · <kbd className="kbd">?</kbd> help
          </span>
        </div>
      </div>
    </div>
  );
}

function CategoryGroups({
  items,
  activeIdx,
  onSelect,
}: {
  items: PaletteItem[];
  activeIdx: number;
  onSelect: (item: PaletteItem) => void;
}) {
  // Group by category, preserving rank order within group
  const groups = items.reduce<Record<string, PaletteItem[]>>((acc, it) => {
    (acc[it.category] = acc[it.category] || []).push(it);
    return acc;
  }, {});
  let runningIdx = -1;
  return (
    <>
      {Object.entries(groups).map(([cat, list]) => (
        <div key={cat}>
          <div className="px-3 pt-3 pb-1 text-[9px] uppercase tracking-widest text-gray-600 font-bold">
            {cat}
          </div>
          {list.map((it) => {
            runningIdx += 1;
            const isActive = runningIdx === activeIdx;
            return (
              <button
                key={it.id}
                onClick={() => onSelect(it)}
                onMouseEnter={() => {
                  /* hover doesn't override keyboard; a11y trade-off */
                }}
                className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3 transition ${
                  isActive ? 'bg-accent/15' : 'hover:bg-white/[0.04]'
                }`}
              >
                <span
                  className={`text-sm truncate ${
                    isActive ? 'text-accent-light font-medium' : 'text-white'
                  }`}
                >
                  {it.label}
                </span>
                {it.hint && (
                  <span className="text-[10px] text-gray-500 font-mono shrink-0 truncate ml-2">
                    {it.hint}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}

// ── Fuzzy filter / ranker ────────────────────────────────────────────────

function filterAndRank(items: PaletteItem[], q: string): PaletteItem[] {
  const query = q.trim().toLowerCase();
  if (!query) return items;
  const scored: { item: PaletteItem; score: number }[] = [];
  for (const it of items) {
    const score = scoreMatch(it, query);
    if (score >= 0) scored.push({ item: it, score });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.map((s) => s.item);
}

function scoreMatch(item: PaletteItem, query: string): number {
  // Lowered fields to search
  const label = item.label.toLowerCase();
  const hint = (item.hint ?? '').toLowerCase();
  const cat = item.category.toLowerCase();
  // Best: label startsWith query
  if (label.startsWith(query)) return -100;
  // Second: label contains query
  const idx = label.indexOf(query);
  if (idx >= 0) return idx;
  // Third: hint contains
  if (hint.includes(query)) return 1000 + hint.indexOf(query);
  // Fourth: category contains
  if (cat.includes(query)) return 2000;
  // Fifth: subsequence match (every char of query appears in label in order)
  if (subseq(label, query)) return 3000;
  return -1; // no match
}

function subseq(haystack: string, needle: string): boolean {
  let i = 0;
  for (const ch of haystack) {
    if (ch === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return false;
}
