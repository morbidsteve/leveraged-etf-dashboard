'use client';

import { useState } from 'react';
import { useSettingsStore } from '@/store';
import { Watchlist } from '@/types';

/**
 * Manages the user's named watchlists. Lives in the Settings panel under
 * the "Watchlists" tab. Add / rename / duplicate / delete; switch active.
 *
 * Backwards-compatible with single-list users — first time loaded, the
 * legacy `settings.watchlist` array is auto-migrated into a "Default" list.
 */
export default function WatchlistManager() {
  const settings = useSettingsStore((s) => s.settings);
  const addWatchlist = useSettingsStore((s) => s.addWatchlist);
  const renameWatchlist = useSettingsStore((s) => s.renameWatchlist);
  const deleteWatchlist = useSettingsStore((s) => s.deleteWatchlist);
  const setActiveWatchlist = useSettingsStore((s) => s.setActiveWatchlist);
  const duplicateWatchlist = useSettingsStore((s) => s.duplicateWatchlist);
  const addToWatchlist = useSettingsStore((s) => s.addToWatchlist);
  const removeFromWatchlist = useSettingsStore((s) => s.removeFromWatchlist);

  const lists: Watchlist[] = settings.watchlists ?? [
    { id: 'default', name: 'Default', tickers: settings.watchlist ?? [] },
  ];
  const activeId = settings.activeWatchlistId ?? lists[0]?.id ?? 'default';

  const [newName, setNewName] = useState('');
  const [tickerDraft, setTickerDraft] = useState('');

  const active = lists.find((l) => l.id === activeId) ?? lists[0];

  const handleCreateList = () => {
    const name = newName.trim();
    if (!name) return;
    const created = addWatchlist(name);
    setActiveWatchlist(created.id);
    setNewName('');
  };

  const handleAddTicker = () => {
    const t = tickerDraft.trim().toUpperCase();
    if (!t) return;
    addToWatchlist(t);
    setTickerDraft('');
  };

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-header">
          <h2 className="font-medium text-white">Watchlists</h2>
        </div>
        <div className="card-body space-y-4">
          <p className="text-xs text-gray-400">
            Watchlists are ticker collections — switch the active list to
            re-scope the radar, alerts, and watchlist rail. Add a new list to
            keep, e.g., Semis vs. FAANG vs. Inverse setups separate.
          </p>

          {/* Tabs of watchlists */}
          <div className="flex flex-wrap gap-1.5 items-center">
            {lists.map((l) => (
              <button
                key={l.id}
                onClick={() => setActiveWatchlist(l.id)}
                className={`text-xs px-2.5 py-1 rounded border transition ${
                  l.id === activeId
                    ? 'bg-accent/20 border-accent/40 text-accent-light'
                    : 'bg-white/[0.03] border-white/10 text-gray-400 hover:text-white'
                }`}
              >
                {l.name}
                <span className="ml-1.5 text-[10px] text-gray-500 font-mono">
                  {l.tickers.length}
                </span>
              </button>
            ))}
          </div>

          {/* New-list form */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreateList();
                }
              }}
              placeholder="New list name (e.g. Semis)"
              className="input flex-1 text-xs py-1.5"
            />
            <button
              onClick={handleCreateList}
              disabled={!newName.trim()}
              className="btn btn-primary text-xs disabled:opacity-40"
            >
              + List
            </button>
          </div>

          {/* Active list editor */}
          {active && (
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={active.name}
                  onChange={(e) => renameWatchlist(active.id, e.target.value)}
                  className="input flex-1 text-sm py-1.5 font-medium"
                />
                <button
                  onClick={() => duplicateWatchlist(active.id)}
                  className="btn btn-outline text-xs"
                  title="Duplicate this list"
                >
                  Duplicate
                </button>
                {lists.length > 1 && (
                  <button
                    onClick={() => {
                      if (confirm(`Delete watchlist "${active.name}"?`)) {
                        deleteWatchlist(active.id);
                      }
                    }}
                    className="btn btn-ghost text-xs text-loss"
                  >
                    Delete
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg bg-white/[0.03] border border-white/5 min-h-[44px]">
                {active.tickers.length === 0 ? (
                  <span className="text-[11px] text-gray-500 italic">
                    No tickers in this list yet
                  </span>
                ) : (
                  active.tickers.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/20 border border-accent/30 text-accent-light text-xs font-mono"
                    >
                      {t}
                      <button
                        onClick={() => removeFromWatchlist(t)}
                        className="hover:text-white"
                        aria-label={`Remove ${t}`}
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={tickerDraft}
                  onChange={(e) => setTickerDraft(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTicker();
                    }
                  }}
                  placeholder="Add ticker (e.g. NVDA)"
                  className="input flex-1 text-xs py-1.5 font-mono"
                />
                <button
                  onClick={handleAddTicker}
                  disabled={!tickerDraft.trim()}
                  className="btn btn-primary text-xs disabled:opacity-40"
                >
                  + Ticker
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
