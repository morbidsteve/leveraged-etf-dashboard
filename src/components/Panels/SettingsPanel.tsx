'use client';

import { useRef, useState } from 'react';
import { useSettingsStore, useTradeStore, DEFAULT_SCANNER_SETTINGS } from '@/store';
import { DEFAULT_RSI_CONFIG } from '@/lib/rsi';
import { Trade } from '@/types';
import { SchwabConnectCard } from '@/components/Strategy';
import { downloadBundle, applyBundle } from '@/lib/exportImport';
import { Tabs, TabPanel, TabDef } from '@/components/UI';
import WatchlistManager from './WatchlistManager';

type SettingsTab = 'broker' | 'risk' | 'strategy' | 'watchlists' | 'scanner' | 'data' | 'help';

const SETTINGS_TABS: TabDef<SettingsTab>[] = [
  { id: 'broker', label: 'Broker' },
  { id: 'risk', label: 'Risk & guardrails' },
  { id: 'strategy', label: 'Strategy defaults' },
  { id: 'watchlists', label: 'Watchlists' },
  { id: 'scanner', label: 'Scanner' },
  { id: 'data', label: 'Data' },
  { id: 'help', label: 'Help' },
];

export default function SettingsPanel() {
  const { settings, updateSettings, updateRSIConfig, updateScannerSettings } =
    useSettingsStore();
  const scannerSettings = settings.scannerSettings || DEFAULT_SCANNER_SETTINGS;
  const trades = useTradeStore((state) => state.trades);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const handleExportTrades = () => {
    const csv = generateTradeCSV(trades);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trades-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAll = () => {
    downloadBundle();
  };

  const handleImportPick = () => {
    setImportStatus(null);
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const bundle = JSON.parse(text);
      if (
        !confirm(
          'Importing will OVERWRITE your current trades, strategies, paper history, alerts, and settings with the contents of this backup. Continue?'
        )
      ) {
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      const result = applyBundle(bundle);
      if (!result.ok) {
        setImportStatus(`Import failed: ${result.reason}`);
        return;
      }
      setImportStatus(
        `Imported ${result.keysWritten.length} stores. Reloading…`
      );
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      setImportStatus(
        `Import failed: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleClearAllData = () => {
    if (confirm('Clear all data? This cannot be undone.')) {
      if (confirm('This will delete ALL trades and settings. Continue?')) {
        localStorage.clear();
        window.location.reload();
      }
    }
  };

  // Persist last-selected settings tab across visits via localStorage.
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    if (typeof window === 'undefined') return 'broker';
    const stored = window.localStorage.getItem('etf-settings-active-tab');
    if (
      stored === 'broker' ||
      stored === 'risk' ||
      stored === 'strategy' ||
      stored === 'watchlists' ||
      stored === 'scanner' ||
      stored === 'data' ||
      stored === 'help'
    ) {
      return stored;
    }
    return 'broker';
  });

  return (
    <div className="space-y-4">
      <Tabs<SettingsTab>
        tabs={SETTINGS_TABS}
        active={activeTab}
        onChange={(t) => {
          setActiveTab(t);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('etf-settings-active-tab', t);
          }
        }}
        variant="underline"
      />

      <TabPanel id="broker" active={activeTab}>
        <SchwabConnectCard />
      </TabPanel>

      <TabPanel id="risk" active={activeTab}>
      <div className="card">
        <div className="card-header">
          <h2 className="font-medium text-white">Daily guardrails</h2>
        </div>
        <div className="card-body space-y-4">
          <p className="text-xs text-gray-400 leading-relaxed">
            Hard caps that block <strong>new entries</strong> (manual + strategy paper +
            auto) for the rest of the day once exceeded. Exits to close existing positions
            are always allowed. Resets at midnight ET. Set to 0 or empty to disable.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Max trades / day</label>
              <input
                type="number"
                value={settings.guardrails?.maxTradesPerDay ?? ''}
                onChange={(e) =>
                  updateSettings({
                    guardrails: {
                      ...(settings.guardrails ?? {}),
                      maxTradesPerDay: e.target.value ? Number(e.target.value) : undefined,
                    },
                  })
                }
                className="input w-full font-mono"
                placeholder="off"
                min={0}
              />
              <p className="text-[10px] text-gray-500 mt-1">Per-day entry cap; lock once hit.</p>
            </div>
            <div>
              <label className="label">Daily loss limit ($)</label>
              <input
                type="number"
                step="50"
                value={settings.guardrails?.dailyLossLimit ?? ''}
                onChange={(e) =>
                  updateSettings({
                    guardrails: {
                      ...(settings.guardrails ?? {}),
                      dailyLossLimit: e.target.value ? Number(e.target.value) : undefined,
                    },
                  })
                }
                className="input w-full font-mono"
                placeholder="off"
                min={0}
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Pause when day P&L drops to -$X. Enter as positive number.
              </p>
            </div>
          </div>
        </div>
      </div>
      </TabPanel>

      <TabPanel id="strategy" active={activeTab}>
      <div className="card">
        <div className="card-header">
          <h2 className="font-medium text-white">General</h2>
        </div>
        <div className="card-body space-y-4">
          <div>
            <label className="label">Default Ticker</label>
            <input
              type="text"
              value={settings.defaultTicker}
              onChange={(e) =>
                updateSettings({ defaultTicker: e.target.value.toUpperCase() })
              }
              className="input w-40 uppercase font-mono"
            />
          </div>
          <div>
            <label className="label">Refresh Interval (seconds)</label>
            <input
              type="number"
              value={settings.refreshInterval / 1000}
              onChange={(e) =>
                updateSettings({ refreshInterval: Number(e.target.value) * 1000 })
              }
              className="input w-40"
              min="1"
              max="60"
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-medium text-white">RSI Configuration</h2>
        </div>
        <div className="card-body space-y-4">
          <div>
            <label className="label">Period Length</label>
            <input
              type="number"
              value={settings.rsiConfig.period}
              onChange={(e) => updateRSIConfig({ period: Number(e.target.value) })}
              className="input w-40 font-mono"
              min="1"
              max="500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Default: {DEFAULT_RSI_CONFIG.period}
            </p>
          </div>
          <div>
            <label className="label">Overbought Level</label>
            <input
              type="number"
              value={settings.rsiConfig.overbought}
              onChange={(e) => updateRSIConfig({ overbought: Number(e.target.value) })}
              className="input w-40 font-mono"
              min="50"
              max="100"
            />
            <p className="text-xs text-gray-500 mt-1">
              Default: {DEFAULT_RSI_CONFIG.overbought}
            </p>
          </div>
          <div>
            <label className="label">Oversold Level</label>
            <input
              type="number"
              value={settings.rsiConfig.oversold}
              onChange={(e) => updateRSIConfig({ oversold: Number(e.target.value) })}
              className="input w-40 font-mono"
              min="0"
              max="50"
            />
            <p className="text-xs text-gray-500 mt-1">
              Default: {DEFAULT_RSI_CONFIG.oversold}
            </p>
          </div>
          <button
            onClick={() => updateRSIConfig(DEFAULT_RSI_CONFIG)}
            className="btn btn-ghost text-sm"
          >
            Reset to Defaults
          </button>
        </div>
      </div>
      </TabPanel>

      <TabPanel id="watchlists" active={activeTab}>
        <WatchlistManager />
      </TabPanel>

      <TabPanel id="scanner" active={activeTab}>
      <div className="card">
        <div className="card-header">
          <h2 className="font-medium text-white">ETF Scanner Defaults</h2>
        </div>
        <div className="card-body space-y-4">
          <div>
            <label className="label">RSI Period</label>
            <input
              type="number"
              value={scannerSettings.rsiPeriod}
              onChange={(e) => updateScannerSettings({ rsiPeriod: Number(e.target.value) })}
              className="input w-40 font-mono"
              min="1"
              max="500"
            />
          </div>
          <div>
            <label className="label">Oversold Threshold</label>
            <input
              type="number"
              value={scannerSettings.oversoldThreshold}
              onChange={(e) =>
                updateScannerSettings({ oversoldThreshold: Number(e.target.value) })
              }
              className="input w-40 font-mono"
              min="1"
              max="100"
            />
          </div>
          <div>
            <label className="label">Min Win Rate %</label>
            <input
              type="number"
              value={scannerSettings.minWinRate}
              onChange={(e) =>
                updateScannerSettings({ minWinRate: Number(e.target.value) })
              }
              className="input w-40 font-mono"
              min="0"
              max="100"
            />
          </div>
          <div>
            <label className="label">Min Signals</label>
            <input
              type="number"
              value={scannerSettings.minSignals}
              onChange={(e) =>
                updateScannerSettings({ minSignals: Number(e.target.value) })
              }
              className="input w-40 font-mono"
              min="1"
              max="100"
            />
          </div>
          <div>
            <label className="label">Data Source</label>
            <select
              value={scannerSettings.dataSource}
              onChange={(e) =>
                updateScannerSettings({ dataSource: e.target.value as 'yahoo' | 'finnhub' })
              }
              className="input w-40"
            >
              <option value="yahoo">Yahoo Finance</option>
              <option value="finnhub">Finnhub</option>
            </select>
          </div>
          <button
            onClick={() => updateScannerSettings(DEFAULT_SCANNER_SETTINGS)}
            className="btn btn-ghost text-sm"
          >
            Reset to Defaults
          </button>
        </div>
      </div>
      </TabPanel>

      <TabPanel id="data" active={activeTab}>
      <div className="card">
        <div className="card-header">
          <h2 className="font-medium text-white">Data management</h2>
        </div>
        <div className="card-body space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-white text-sm">Export trades (CSV)</div>
              <div className="text-xs text-gray-500">{trades.length} trades</div>
            </div>
            <button onClick={handleExportTrades} className="btn btn-outline text-sm">
              Export CSV
            </button>
          </div>

          <div className="border-t border-white/5 pt-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-medium text-white text-sm">Full backup (JSON)</div>
                <div className="text-xs text-gray-500">
                  Trades · strategies · paper history · alerts · settings. Local only.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleExportAll} className="btn btn-primary text-sm">
                  Export all
                </button>
                <button onClick={handleImportPick} className="btn btn-outline text-sm">
                  Import…
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={handleImportFile}
                />
              </div>
            </div>
            {importStatus && (
              <div
                className={`text-[11px] mt-1 ${
                  importStatus.startsWith('Imported')
                    ? 'text-profit'
                    : 'text-loss'
                }`}
              >
                {importStatus}
              </div>
            )}
            <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">
              Backup file lands in your Downloads. To migrate: export here, copy file to the new
              device, open this dashboard there, click Import. No cloud, no third-party storage.
              Schwab tokens are NOT in the bundle (those live encrypted on the host).
            </p>
          </div>

          <div className="border-t border-white/5 pt-4 flex items-center justify-between">
            <div>
              <div className="font-medium text-loss text-sm">Clear all data</div>
              <div className="text-xs text-gray-500">Delete trades + settings + paper history</div>
            </div>
            <button onClick={handleClearAllData} className="btn btn-danger text-sm">
              Clear data
            </button>
          </div>
        </div>
      </div>
      </TabPanel>

      <TabPanel id="help" active={activeTab}>
      <div className="card">
        <div className="card-header">
          <h2 className="font-medium text-white">Keyboard Shortcuts</h2>
        </div>
        <div className="card-body grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">New Trade</span>
            <kbd className="kbd">N</kbd>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Calculator</span>
            <kbd className="kbd">C</kbd>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Refresh</span>
            <kbd className="kbd">R</kbd>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Search</span>
            <kbd className="kbd">/</kbd>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Close panel</span>
            <kbd className="kbd">Esc</kbd>
          </div>
        </div>
      </div>
      </TabPanel>
    </div>
  );
}

function generateTradeCSV(trades: Trade[]): string {
  const headers = [
    'ID',
    'Ticker',
    'Status',
    'Created At',
    'Closed At',
    'Entries',
    'Avg Cost',
    'Total Shares',
    'Realized P&L',
    'Notes',
    'Tags',
  ];
  const rows = trades.map((t) => [
    t.id,
    t.ticker,
    t.status,
    new Date(t.createdAt).toISOString(),
    t.closedAt ? new Date(t.closedAt).toISOString() : '',
    t.entries.length,
    t.avgCost.toFixed(2),
    t.totalShares,
    t.realizedPnL.toFixed(2),
    `"${t.notes.replace(/"/g, '""')}"`,
    `"${t.tags.join(', ')}"`,
  ]);
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
