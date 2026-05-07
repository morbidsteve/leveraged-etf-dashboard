'use client';

import { useSettingsStore, useTradeStore, DEFAULT_SCANNER_SETTINGS } from '@/store';
import { DEFAULT_RSI_CONFIG } from '@/lib/rsi';
import { Trade } from '@/types';

export default function SettingsPanel() {
  const { settings, updateSettings, updateRSIConfig, updateScannerSettings } =
    useSettingsStore();
  const scannerSettings = settings.scannerSettings || DEFAULT_SCANNER_SETTINGS;
  const trades = useTradeStore((state) => state.trades);

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

  const handleClearAllData = () => {
    if (confirm('Clear all data? This cannot be undone.')) {
      if (confirm('This will delete ALL trades and settings. Continue?')) {
        localStorage.clear();
        window.location.reload();
      }
    }
  };

  return (
    <div className="space-y-6">
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

      <div className="card">
        <div className="card-header">
          <h2 className="font-medium text-white">Data Management</h2>
        </div>
        <div className="card-body space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-white text-sm">Export Trades</div>
              <div className="text-xs text-gray-500">CSV ({trades.length} trades)</div>
            </div>
            <button onClick={handleExportTrades} className="btn btn-primary">
              Export CSV
            </button>
          </div>
          <div className="border-t border-white/5 pt-4 flex items-center justify-between">
            <div>
              <div className="font-medium text-loss text-sm">Clear All Data</div>
              <div className="text-xs text-gray-500">Delete trades + settings</div>
            </div>
            <button onClick={handleClearAllData} className="btn btn-danger">
              Clear Data
            </button>
          </div>
        </div>
      </div>

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
