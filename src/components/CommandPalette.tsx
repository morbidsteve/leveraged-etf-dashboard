'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useStrategyStore,
  useSettingsStore,
  usePriceStore,
  usePaperStore,
  useTradeStore,
} from '@/store';
import { showToast } from '@/components/UI';

// ── Action union ─────────────────────────────────────────────────────────

export type PaletteAction =
  // Navigation
  | { kind: 'open-drawer'; view: string }
  | { kind: 'open-settings-tab'; tab: string }
  | { kind: 'expand-strategy'; strategyId: string }
  | { kind: 'select-ticker'; ticker: string }
  // Strategy actions
  | { kind: 'toggle-strategy'; strategyId: string; enabled: boolean }
  | { kind: 'clone-strategy'; strategyId: string }
  // Watchlist actions
  | { kind: 'set-active-watchlist'; id: string }
  | { kind: 'add-ticker'; ticker: string }
  | { kind: 'remove-ticker'; ticker: string }
  // Position actions
  | { kind: 'manage-position'; tradeId: string; ticker: string }
  | { kind: 'log-new-trade'; ticker?: string }
  // Options actions
  | { kind: 'options-chain'; ticker: string }
  | { kind: 'options-template'; structure: string; ticker: string }
  // Chart toggles
  | { kind: 'set-chart-interval'; interval: '1m' | '5m' | '15m' | '1h' | '1d' }
  | { kind: 'set-chart-range'; range: '1d' | '5d' | '1mo' | '3mo' }
  | { kind: 'toggle-indicator'; key: 'ema20' | 'ema50' | 'sma20' | 'vwap' | 'bollinger' | 'macd' }
  | { kind: 'toggle-extended-hours' }
  | { kind: 'toggle-position-alerts' }
  // Quick actions
  | { kind: 'refresh-data' }
  | { kind: 'kill-switch' }
  | { kind: 'export-bundle' }
  | { kind: 'connect-schwab' }
  // Help
  | { kind: 'help'; topic: string };

export interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  category: string;
  /** Optional kbd shortcut chips shown to the right. */
  kbd?: string[];
  action: PaletteAction;
  /** When set, this item is "destructive" and renders in red — e.g. kill switch. */
  destructive?: boolean;
}

const RECENT_KEY = 'etf-palette-recent-v1';
const RECENT_MAX = 6;

/**
 * Universal Cmd+K command palette.
 *
 * Expanded in this revision to cover ~40+ actions across navigation,
 * strategies, tickers, positions, options, chart toggles, quick actions,
 * settings deep-links, and help. Recent items persisted to localStorage
 * so commonly-used commands surface at top.
 *
 * Action dispatch model: most operations dispatch DOM CustomEvents the
 * dashboard already listens for (etf-open-drawer, etf-expand-strategy,
 * etf-open-position-modal, etf-open-options-template, etc.) so the
 * palette stays purely presentational. Direct store mutations only
 * for trivial toggles (ticker selection, watchlist switch).
 */
export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Store hooks ─────────────────────────────────────────────────────
  const strategies = useStrategyStore((s) => s.strategies);
  const updateStrategy = useStrategyStore((s) => s.updateStrategy);
  const addStrategy = useStrategyStore((s) => s.addStrategy);
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const updateChartSettings = useSettingsStore((s) => s.updateChartSettings);
  const setActiveWatchlist = useSettingsStore((s) => s.setActiveWatchlist);
  const addToWatchlist = useSettingsStore((s) => s.addToWatchlist);
  const removeFromWatchlist = useSettingsStore((s) => s.removeFromWatchlist);
  const setSelectedTicker = usePriceStore((s) => s.setSelectedTicker);
  const selectedTicker = usePriceStore((s) => s.selectedTicker);
  const trades = useTradeStore((s) => s.trades);

  // Recent commands (localStorage)
  const [recentIds, setRecentIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(RECENT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const pushRecent = (id: string) => {
    setRecentIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, RECENT_MAX);
      try {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        // ignore quota
      }
      return next;
    });
  };

  // ── Catalog generation ──────────────────────────────────────────────
  const items: PaletteItem[] = useMemo(() => {
    const out: PaletteItem[] = [];

    // === Navigate ===
    const drawers: { view: string; label: string; kbd?: string[] }[] = [
      { view: 'strategies', label: 'Strategies' },
      { view: 'monitor', label: 'Live monitor' },
      { view: 'backtest', label: 'Backtest' },
      { view: 'journal', label: 'Trade journal' },
      { view: 'trades', label: 'Trade history' },
      { view: 'analytics', label: 'Analytics' },
      { view: 'scanner', label: 'Scanner' },
      { view: 'calculator', label: 'Position calculator', kbd: ['C'] },
      { view: 'alerts', label: 'Alerts & rules' },
      { view: 'options', label: 'Options chain & positions' },
      { view: 'settings', label: 'Settings' },
      { view: 'newTrade', label: 'New trade form', kbd: ['N'] },
    ];
    for (const d of drawers) {
      out.push({
        id: `drawer-${d.view}`,
        label: `Open ${d.label}`,
        category: 'Navigate',
        kbd: d.kbd,
        action: { kind: 'open-drawer', view: d.view },
      });
    }

    // Settings tab deep-links
    const tabs = [
      { id: 'broker', label: 'Broker (Schwab + worker)' },
      { id: 'risk', label: 'Risk & guardrails' },
      { id: 'strategy', label: 'Strategy defaults' },
      { id: 'watchlists', label: 'Watchlists' },
      { id: 'scanner', label: 'Scanner defaults' },
      { id: 'data', label: 'Data export/import' },
      { id: 'help', label: 'Help & docs' },
    ];
    for (const t of tabs) {
      out.push({
        id: `settings-${t.id}`,
        label: `Settings → ${t.label}`,
        category: 'Settings',
        action: { kind: 'open-settings-tab', tab: t.id },
      });
    }

    // === Tickers (active watchlist) ===
    const tickers = settings.watchlist ?? [];
    for (const t of tickers) {
      const isSelected = t === selectedTicker;
      out.push({
        id: `ticker-${t}`,
        label: t,
        hint: isSelected ? 'currently selected' : 'switch chart to ticker',
        category: 'Tickers',
        action: { kind: 'select-ticker', ticker: t },
      });
      // Per-ticker quick actions
      out.push({
        id: `ticker-${t}-options`,
        label: `Options chain · ${t}`,
        hint: 'open chain viewer',
        category: 'Options',
        action: { kind: 'options-chain', ticker: t },
      });
      out.push({
        id: `ticker-${t}-newtrade`,
        label: `Log new ${t} trade`,
        category: 'New trade',
        action: { kind: 'log-new-trade', ticker: t },
      });
      out.push({
        id: `ticker-${t}-remove`,
        label: `Remove ${t} from watchlist`,
        category: 'Watchlist edits',
        action: { kind: 'remove-ticker', ticker: t },
      });
    }

    // === Strategies ===
    for (const s of strategies) {
      out.push({
        id: `strategy-${s.id}-expand`,
        label: s.name,
        hint: `${s.tickers.join(', ')} · ${s.mode}${s.enabled ? ' · enabled' : ' · disabled'}`,
        category: 'Strategies',
        action: { kind: 'expand-strategy', strategyId: s.id },
      });
      out.push({
        id: `strategy-${s.id}-toggle`,
        label: `${s.enabled ? 'Disable' : 'Enable'} "${s.name}"`,
        category: 'Strategies',
        action: {
          kind: 'toggle-strategy',
          strategyId: s.id,
          enabled: !s.enabled,
        },
      });
      out.push({
        id: `strategy-${s.id}-clone`,
        label: `Clone "${s.name}"`,
        category: 'Strategies',
        action: { kind: 'clone-strategy', strategyId: s.id },
      });
    }

    // === Positions ===
    const openTrades = trades.filter((t) => t.status === 'open');
    for (const t of openTrades) {
      out.push({
        id: `pos-${t.id}`,
        label: `Manage ${t.ticker} position`,
        hint: `${t.totalShares} shares @ $${t.avgCost.toFixed(2)}`,
        category: 'Positions',
        action: { kind: 'manage-position', tradeId: t.id, ticker: t.ticker },
      });
    }

    // === Watchlists (multi-list switcher) ===
    for (const wl of settings.watchlists ?? []) {
      out.push({
        id: `wl-${wl.id}`,
        label: `Switch to "${wl.name}" watchlist`,
        hint: `${wl.tickers.length} tickers`,
        category: 'Watchlists',
        action: { kind: 'set-active-watchlist', id: wl.id },
      });
    }

    // === Options templates (per active ticker) ===
    if (selectedTicker) {
      const templates = [
        { structure: 'bull-put-credit', label: 'Build bull put credit spread' },
        { structure: 'bear-call-credit', label: 'Build bear call credit spread' },
        { structure: 'bull-call-debit', label: 'Build bull call debit spread' },
        { structure: 'bear-put-debit', label: 'Build bear put debit spread' },
        { structure: 'iron-condor', label: 'Build iron condor' },
        { structure: 'long-straddle', label: 'Build long straddle' },
        { structure: 'long-strangle', label: 'Build long strangle' },
      ];
      for (const t of templates) {
        out.push({
          id: `opt-tpl-${t.structure}-${selectedTicker}`,
          label: `${t.label} · ${selectedTicker}`,
          category: 'Options',
          action: {
            kind: 'options-template',
            structure: t.structure,
            ticker: selectedTicker,
          },
        });
      }
    }

    // === Chart toggles ===
    const intervals: Array<'1m' | '5m' | '15m' | '1h' | '1d'> = ['1m', '5m', '15m', '1h', '1d'];
    for (const i of intervals) {
      out.push({
        id: `chart-int-${i}`,
        label: `Chart interval → ${i}`,
        hint: settings.chartSettings.interval === i ? 'current' : '',
        category: 'Chart',
        action: { kind: 'set-chart-interval', interval: i },
      });
    }
    const ranges: Array<'1d' | '5d' | '1mo' | '3mo'> = ['1d', '5d', '1mo', '3mo'];
    for (const r of ranges) {
      out.push({
        id: `chart-rng-${r}`,
        label: `Chart range → ${r}`,
        hint: settings.chartSettings.range === r ? 'current' : '',
        category: 'Chart',
        action: { kind: 'set-chart-range', range: r },
      });
    }
    const inds: Array<'ema20' | 'ema50' | 'sma20' | 'vwap' | 'bollinger' | 'macd'> = [
      'ema20', 'ema50', 'sma20', 'vwap', 'bollinger', 'macd',
    ];
    for (const k of inds) {
      const on = settings.indicators?.[k] ?? false;
      out.push({
        id: `chart-ind-${k}`,
        label: `${on ? 'Hide' : 'Show'} ${k.toUpperCase()} indicator`,
        category: 'Chart',
        action: { kind: 'toggle-indicator', key: k },
      });
    }
    out.push({
      id: 'toggle-extended-hours',
      label: `${settings.guardrails?.extendedHours ? 'Disable' : 'Enable'} extended hours`,
      category: 'Chart',
      action: { kind: 'toggle-extended-hours' },
    });

    // === Quick actions ===
    out.push({
      id: 'refresh',
      label: 'Refresh data now',
      kbd: ['R'],
      category: 'Quick',
      action: { kind: 'refresh-data' },
    });
    out.push({
      id: 'toggle-pos-alerts',
      label: `${settings.positionAlerts?.enabled ? 'Disable' : 'Enable'} position auto-alerts`,
      hint: `currently ${settings.positionAlerts?.enabled ? 'on' : 'off'}`,
      category: 'Quick',
      action: { kind: 'toggle-position-alerts' },
    });
    out.push({
      id: 'kill-switch',
      label: 'Kill switch — disable all auto strategies',
      hint: 'stops auto-mode immediately',
      category: 'Quick',
      destructive: true,
      action: { kind: 'kill-switch' },
    });
    out.push({
      id: 'export-bundle',
      label: 'Export full backup (JSON)',
      hint: 'trades + strategies + settings',
      category: 'Quick',
      action: { kind: 'export-bundle' },
    });
    out.push({
      id: 'connect-schwab',
      label: 'Connect Schwab broker',
      hint: 'opens OAuth flow',
      category: 'Quick',
      action: { kind: 'connect-schwab' },
    });

    // === New trade (no ticker) ===
    out.push({
      id: 'newtrade-blank',
      label: 'Log new trade (blank)',
      kbd: ['N'],
      category: 'New trade',
      action: { kind: 'log-new-trade' },
    });

    // === Help ===
    out.push({
      id: 'help-shortcuts',
      label: 'Keyboard shortcuts',
      kbd: ['?'],
      category: 'Help',
      action: { kind: 'help', topic: 'shortcuts' },
    });

    return out;
  }, [strategies, settings, selectedTicker, trades]);

  const filtered = useMemo(
    () => filterAndRank(items, query, recentIds),
    [items, query, recentIds]
  );

  // Keyboard wiring — open with Cmd/Ctrl+K (or `?` for help)
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

  const runAction = async (item: PaletteItem) => {
    pushRecent(item.id);
    setOpen(false);
    const a = item.action;

    switch (a.kind) {
      case 'open-drawer':
        window.dispatchEvent(new CustomEvent('etf-open-drawer', { detail: a.view }));
        return;

      case 'open-settings-tab':
        window.dispatchEvent(new CustomEvent('etf-open-drawer', { detail: 'settings' }));
        // Settings panel listens for this and switches its internal tab
        window.dispatchEvent(new CustomEvent('etf-settings-tab', { detail: a.tab }));
        return;

      case 'expand-strategy':
        window.dispatchEvent(new CustomEvent('etf-open-drawer', { detail: 'strategies' }));
        window.dispatchEvent(
          new CustomEvent('etf-expand-strategy', { detail: a.strategyId })
        );
        return;

      case 'select-ticker':
        setSelectedTicker(a.ticker);
        showToast(`Switched to ${a.ticker}`, 'info', 1500);
        return;

      case 'toggle-strategy': {
        const s = strategies.find((x) => x.id === a.strategyId);
        updateStrategy(a.strategyId, { enabled: a.enabled });
        showToast(`${a.enabled ? 'Enabled' : 'Disabled'} "${s?.name ?? 'strategy'}"`);
        return;
      }

      case 'clone-strategy': {
        const s = strategies.find((x) => x.id === a.strategyId);
        if (!s) return;
        const cloned = addStrategy({
          name: `${s.name} (variant)`,
          tickers: [...s.tickers],
          enabled: false,
          mode: 'paper',
          size: s.size,
          rsiConfig: s.rsiConfig,
          entry: { when: structuredClone(s.entry.when) },
          exit: { when: structuredClone(s.exit.when) },
          stopLoss: s.stopLoss ? { ...s.stopLoss } : undefined,
          cooldownMinutes: s.cooldownMinutes,
        });
        showToast(`Cloned to "${cloned.name}"`);
        // Open it in detail view
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('etf-open-drawer', { detail: 'strategies' }));
          window.dispatchEvent(new CustomEvent('etf-expand-strategy', { detail: cloned.id }));
        }, 100);
        return;
      }

      case 'set-active-watchlist': {
        setActiveWatchlist(a.id);
        const wl = (settings.watchlists ?? []).find((w) => w.id === a.id);
        showToast(`Active watchlist: ${wl?.name ?? 'switched'}`);
        return;
      }

      case 'add-ticker':
        addToWatchlist(a.ticker);
        showToast(`Added ${a.ticker} to watchlist`);
        return;

      case 'remove-ticker':
        removeFromWatchlist(a.ticker);
        showToast(`Removed ${a.ticker} from watchlist`, 'info');
        return;

      case 'manage-position':
        window.dispatchEvent(
          new CustomEvent('etf-open-position-modal', {
            detail: { kind: 'manual', tradeId: a.tradeId },
          })
        );
        return;

      case 'log-new-trade':
        window.dispatchEvent(new CustomEvent('etf-open-drawer', { detail: 'newTrade' }));
        if (a.ticker) {
          // NewTradePanel listens for this to pre-fill ticker
          window.dispatchEvent(
            new CustomEvent('etf-new-trade-ticker', { detail: a.ticker })
          );
        }
        return;

      case 'options-chain':
        setSelectedTicker(a.ticker);
        window.dispatchEvent(new CustomEvent('etf-open-drawer', { detail: 'options' }));
        window.dispatchEvent(
          new CustomEvent('etf-options-symbol', { detail: a.ticker })
        );
        return;

      case 'options-template':
        setSelectedTicker(a.ticker);
        window.dispatchEvent(new CustomEvent('etf-open-drawer', { detail: 'options' }));
        window.dispatchEvent(
          new CustomEvent('etf-options-template', {
            detail: { ticker: a.ticker, structure: a.structure },
          })
        );
        return;

      case 'set-chart-interval':
        updateChartSettings({ interval: a.interval });
        showToast(`Interval → ${a.interval}`, 'info', 1500);
        return;

      case 'set-chart-range':
        updateChartSettings({ range: a.range });
        showToast(`Range → ${a.range}`, 'info', 1500);
        return;

      case 'toggle-indicator': {
        const cur = settings.indicators?.[a.key] ?? false;
        updateSettings({
          indicators: { ...(settings.indicators ?? {}), [a.key]: !cur },
        });
        showToast(`${a.key.toUpperCase()} ${!cur ? 'on' : 'off'}`, 'info', 1500);
        return;
      }

      case 'toggle-extended-hours': {
        const cur = settings.guardrails?.extendedHours ?? false;
        updateSettings({
          guardrails: { ...(settings.guardrails ?? {}), extendedHours: !cur },
        });
        showToast(`Extended hours ${!cur ? 'on' : 'off'}`);
        return;
      }

      case 'toggle-position-alerts': {
        const pa = settings.positionAlerts ?? {
          enabled: true,
          takeProfitPct: 2,
          stopLossPct: -1,
          soundEnabled: true,
          toastEnabled: true,
          browserEnabled: false,
          cooldownMinutes: 60,
        };
        updateSettings({
          positionAlerts: { ...pa, enabled: !pa.enabled },
        });
        showToast(`Position alerts ${!pa.enabled ? 'enabled' : 'disabled'}`);
        return;
      }

      case 'refresh-data':
        window.dispatchEvent(new CustomEvent('etf-refresh-data'));
        showToast('Refreshing data', 'info', 1500);
        return;

      case 'kill-switch': {
        let n = 0;
        for (const s of strategies) {
          if (s.enabled) {
            updateStrategy(s.id, { enabled: false });
            n++;
          }
        }
        showToast(`Kill switch: disabled ${n} strategies`, n > 0 ? 'success' : 'info');
        return;
      }

      case 'export-bundle': {
        const { downloadBundle } = await import('@/lib/exportImport');
        downloadBundle();
        showToast('Backup downloaded');
        return;
      }

      case 'connect-schwab':
        window.location.href = '/api/schwab/authorize';
        return;

      case 'help':
        if (a.topic === 'shortcuts') {
          window.dispatchEvent(new CustomEvent('etf-show-shortcuts-help'));
        }
        return;
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-start justify-center pt-[10vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="glass-strong rounded-xl w-full max-w-2xl mx-4 shadow-glow overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 border-b border-white/10 flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
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
            placeholder="Type to search · drawers, tickers, strategies, positions, options templates, chart toggles, quick actions…"
            className="flex-1 bg-transparent text-white text-base placeholder:text-gray-500 focus:outline-none px-1"
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

// ── Category-grouped result list ────────────────────────────────────────

function CategoryGroups({
  items,
  activeIdx,
  onSelect,
}: {
  items: PaletteItem[];
  activeIdx: number;
  onSelect: (item: PaletteItem) => void;
}) {
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
                className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3 transition ${
                  isActive
                    ? it.destructive
                      ? 'bg-loss/15'
                      : 'bg-accent/15'
                    : 'hover:bg-white/[0.04]'
                }`}
              >
                <span
                  className={`text-sm truncate ${
                    isActive
                      ? it.destructive
                        ? 'text-loss font-medium'
                        : 'text-accent-light font-medium'
                      : it.destructive
                      ? 'text-loss/80'
                      : 'text-white'
                  }`}
                >
                  {it.label}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {it.hint && (
                    <span className="text-[10px] text-gray-500 font-mono truncate">
                      {it.hint}
                    </span>
                  )}
                  {it.kbd?.map((k) => (
                    <kbd key={k} className="kbd text-[9px] px-1 py-0">
                      {k}
                    </kbd>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}

// ── Filter / rank ────────────────────────────────────────────────────────

function filterAndRank(items: PaletteItem[], q: string, recentIds: string[]): PaletteItem[] {
  const query = q.trim().toLowerCase();

  // Empty query: show recents first, then top categories
  if (!query) {
    const recent = recentIds
      .map((id) => items.find((it) => it.id === id))
      .filter((x): x is PaletteItem => !!x)
      .map((it) => ({ ...it, category: 'Recent' }));
    const recentIdSet = new Set(recentIds);
    const rest = items.filter((it) => !recentIdSet.has(it.id));
    return [...recent, ...rest];
  }

  const scored: { item: PaletteItem; score: number }[] = [];
  for (const it of items) {
    const score = scoreMatch(it, query);
    if (score >= 0) {
      // Bonus for recents
      const bonus = recentIds.includes(it.id) ? -50 : 0;
      scored.push({ item: it, score: score + bonus });
    }
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.map((s) => s.item);
}

function scoreMatch(item: PaletteItem, query: string): number {
  const label = item.label.toLowerCase();
  const hint = (item.hint ?? '').toLowerCase();
  const cat = item.category.toLowerCase();
  if (label.startsWith(query)) return -100;
  const idx = label.indexOf(query);
  if (idx >= 0) return idx;
  if (hint.includes(query)) return 1000 + hint.indexOf(query);
  if (cat.includes(query)) return 2000;
  if (subseq(label, query)) return 3000;
  return -1;
}

function subseq(haystack: string, needle: string): boolean {
  let i = 0;
  for (const ch of haystack) {
    if (ch === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return false;
}
