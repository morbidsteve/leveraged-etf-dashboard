'use client';

import { useState } from 'react';
import {
  useLayoutStore,
  useSettingsStore,
  usePriceStore,
  LayoutView,
} from '@/store';
import { showToast } from '@/components/UI';

/**
 * Compact layout switcher — pinned to the top-right of the dashboard.
 * Drop-down of named layouts; "Save current" snapshots the live
 * settings into a new view; "Apply" loads a view back.
 */
export default function LayoutSwitcher() {
  const views = useLayoutStore((s) => s.views);
  const activeViewId = useLayoutStore((s) => s.activeViewId);
  const addView = useLayoutStore((s) => s.addView);
  const deleteView = useLayoutStore((s) => s.deleteView);
  const setActiveView = useLayoutStore((s) => s.setActiveView);

  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const updateChartSettings = useSettingsStore((s) => s.updateChartSettings);
  const setActiveWatchlist = useSettingsStore((s) => s.setActiveWatchlist);
  const selectedTicker = usePriceStore((s) => s.selectedTicker);
  const setSelectedTicker = usePriceStore((s) => s.setSelectedTicker);

  const [showMenu, setShowMenu] = useState(false);
  const [newName, setNewName] = useState('');

  const saveCurrent = () => {
    const name = newName.trim() || `Layout ${views.length + 1}`;
    const view = addView({
      name,
      selectedTicker,
      chartInterval: settings.chartSettings.interval,
      chartRange: settings.chartSettings.range,
      theme: settings.theme,
      density: settings.density,
      activeWatchlistId: settings.activeWatchlistId,
      indicators: settings.indicators ? { ...settings.indicators } : undefined,
    });
    setActiveView(view.id);
    setNewName('');
    showToast(`Saved layout "${view.name}"`);
  };

  const applyView = (view: LayoutView) => {
    if (view.selectedTicker) setSelectedTicker(view.selectedTicker);
    updateSettings({
      ...(view.theme && { theme: view.theme }),
      ...(view.density && { density: view.density }),
      ...(view.indicators && { indicators: view.indicators }),
    });
    if (view.chartInterval || view.chartRange) {
      updateChartSettings({
        ...(view.chartInterval && { interval: view.chartInterval }),
        ...(view.chartRange && { range: view.chartRange }),
      });
    }
    if (view.activeWatchlistId) setActiveWatchlist(view.activeWatchlistId);
    setActiveView(view.id);
    setShowMenu(false);
    showToast(`Applied layout "${view.name}"`);
  };

  const activeView = views.find((v) => v.id === activeViewId);

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu((v) => !v)}
        className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded border bg-white/[0.03] border-white/10 text-gray-400 hover:text-white hover:border-accent/40 transition"
        title="Saved layouts"
      >
        ⊞ {activeView ? activeView.name : 'Layouts'}
      </button>
      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute right-0 mt-1 w-72 z-50 glass-strong rounded-lg border border-white/10 shadow-glow p-2 space-y-2">
            <div className="text-[9px] uppercase tracking-widest text-gray-500 font-bold px-1">
              Saved layouts
            </div>
            {views.length === 0 ? (
              <div className="text-[11px] text-gray-500 italic px-1 py-1">
                No layouts yet
              </div>
            ) : (
              <div className="space-y-0.5 max-h-48 overflow-y-auto">
                {views.map((v) => (
                  <div
                    key={v.id}
                    className={`flex items-center gap-2 px-2 py-1 rounded ${
                      v.id === activeViewId ? 'bg-accent/10' : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <button
                      onClick={() => applyView(v)}
                      className="flex-1 text-left text-xs text-white truncate"
                    >
                      {v.name}
                    </button>
                    <span className="text-[10px] text-gray-500 font-mono">
                      {v.selectedTicker ?? ''}
                    </span>
                    <button
                      onClick={() => {
                        if (confirm(`Delete layout "${v.name}"?`)) deleteView(v.id);
                      }}
                      className="text-loss text-[10px] hover:brightness-125"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-white/10 pt-2 space-y-1.5">
              <div className="text-[9px] uppercase tracking-widest text-gray-500 font-bold px-1">
                Save current
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      saveCurrent();
                    }
                  }}
                  placeholder="Name (e.g. Open / Vacation)"
                  className="input flex-1 text-xs py-1"
                />
                <button onClick={saveCurrent} className="btn btn-primary text-[10px] px-2 py-1">
                  Save
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
