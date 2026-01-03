'use client';

import { MainLayout } from '@/components/Layout';
import { useSettingsStore, useTradeStore, DEFAULT_SCANNER_SETTINGS } from '@/store';
import { DEFAULT_RSI_CONFIG } from '@/lib/rsi';

export default function SettingsPage() {
  const { settings, updateSettings, updateRSIConfig, updateScannerSettings } = useSettingsStore();
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
    if (confirm('Are you sure you want to clear all data? This action cannot be undone.')) {
      if (confirm('This will delete ALL trades and settings. Type "DELETE" to confirm.')) {
        localStorage.clear();
        window.location.reload();
      }
    }
  };

  return (
    <MainLayout>
      <h1 className="text-2xl font-bold text-white mb-6">Settings</h1>

      <div className="max-w-2xl space-y-6">
        {/* General Settings */}
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
                onChange={(e) => updateSettings({ defaultTicker: e.target.value.toUpperCase() })}
                className="input w-40 uppercase"
              />
            </div>

            <div>
              <label className="label">Refresh Interval (seconds)</label>
              <input
                type="number"
                value={settings.refreshInterval / 1000}
                onChange={(e) => updateSettings({ refreshInterval: Number(e.target.value) * 1000 })}
                className="input w-40"
                min="5"
                max="60"
              />
              <p className="text-xs text-gray-500 mt-1">
                How often to fetch new price data (5-60 seconds)
              </p>
            </div>

            <div>
              <label className="label">Theme</label>
              <select
                value={settings.theme}
                onChange={(e) => updateSettings({ theme: e.target.value as 'dark' | 'light' })}
                className="input w-40"
              >
                <option value="dark">Dark</option>
                <option value="light">Light (Coming Soon)</option>
              </select>
            </div>
          </div>
        </div>

        {/* RSI Settings */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-medium text-white">RSI Configuration (Dashboard/Chart)</h2>
          </div>
          <div className="card-body space-y-4">
            <div>
              <label className="label">Period Length</label>
              <input
                type="number"
                value={settings.rsiConfig.period}
                onChange={(e) => updateRSIConfig({ period: Number(e.target.value) })}
                className="input w-40"
                min="1"
                max="500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Number of periods for RSI calculation (default: {DEFAULT_RSI_CONFIG.period})
              </p>
            </div>

            <div>
              <label className="label">Overbought Level</label>
              <input
                type="number"
                value={settings.rsiConfig.overbought}
                onChange={(e) => updateRSIConfig({ overbought: Number(e.target.value) })}
                className="input w-40"
                min="50"
                max="100"
              />
              <p className="text-xs text-gray-500 mt-1">
                RSI above this level is overbought (default: {DEFAULT_RSI_CONFIG.overbought})
              </p>
            </div>

            <div>
              <label className="label">Oversold Level</label>
              <input
                type="number"
                value={settings.rsiConfig.oversold}
                onChange={(e) => updateRSIConfig({ oversold: Number(e.target.value) })}
                className="input w-40"
                min="0"
                max="50"
              />
              <p className="text-xs text-gray-500 mt-1">
                RSI below this level is oversold (default: {DEFAULT_RSI_CONFIG.oversold})
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={() => updateRSIConfig(DEFAULT_RSI_CONFIG)}
                className="btn btn-ghost text-sm"
              >
                Reset to Defaults
              </button>
            </div>
          </div>
        </div>

        {/* Scanner Settings */}
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
                className="input w-40"
                min="1"
                max="500"
              />
              <p className="text-xs text-gray-500 mt-1">
                RSI period for scanner analysis (default: {DEFAULT_SCANNER_SETTINGS.rsiPeriod})
              </p>
            </div>

            <div>
              <label className="label">Oversold Threshold</label>
              <input
                type="number"
                value={scannerSettings.oversoldThreshold}
                onChange={(e) => updateScannerSettings({ oversoldThreshold: Number(e.target.value) })}
                className="input w-40"
                min="1"
                max="100"
              />
              <p className="text-xs text-gray-500 mt-1">
                RSI below this triggers a signal (default: {DEFAULT_SCANNER_SETTINGS.oversoldThreshold})
              </p>
            </div>

            <div>
              <label className="label">Minimum Win Rate %</label>
              <input
                type="number"
                value={scannerSettings.minWinRate}
                onChange={(e) => updateScannerSettings({ minWinRate: Number(e.target.value) })}
                className="input w-40"
                min="0"
                max="100"
              />
              <p className="text-xs text-gray-500 mt-1">
                Filter results below this win rate (default: {DEFAULT_SCANNER_SETTINGS.minWinRate}%)
              </p>
            </div>

            <div>
              <label className="label">Minimum Signals</label>
              <input
                type="number"
                value={scannerSettings.minSignals}
                onChange={(e) => updateScannerSettings({ minSignals: Number(e.target.value) })}
                className="input w-40"
                min="1"
                max="100"
              />
              <p className="text-xs text-gray-500 mt-1">
                Require at least this many signals (default: {DEFAULT_SCANNER_SETTINGS.minSignals})
              </p>
            </div>

            <div>
              <label className="label">Data Source</label>
              <select
                value={scannerSettings.dataSource}
                onChange={(e) => updateScannerSettings({ dataSource: e.target.value as 'yahoo' | 'finnhub' })}
                className="input w-40"
              >
                <option value="yahoo">Yahoo Finance</option>
                <option value="finnhub">Finnhub</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Data provider for scanner
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={() => updateScannerSettings(DEFAULT_SCANNER_SETTINGS)}
                className="btn btn-ghost text-sm"
              >
                Reset to Defaults
              </button>
            </div>
          </div>
        </div>

        {/* Data Management */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-medium text-white">Data Management</h2>
          </div>
          <div className="card-body space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-white">Export Trades</div>
                <div className="text-xs text-gray-500">
                  Download all trades as CSV ({trades.length} trades)
                </div>
              </div>
              <button onClick={handleExportTrades} className="btn btn-primary">
                Export CSV
              </button>
            </div>

            <div className="border-t border-dark-border pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-loss">Clear All Data</div>
                  <div className="text-xs text-gray-500">
                    Permanently delete all trades and settings
                  </div>
                </div>
                <button onClick={handleClearAllData} className="btn btn-danger">
                  Clear Data
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* API Configuration */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-medium text-white">API Configuration</h2>
          </div>
          <div className="card-body">
            <p className="text-sm text-gray-400 mb-4">
              Currently using Yahoo Finance API (no key required). Additional API providers can be configured via environment variables.
            </p>

            <div className="p-4 bg-dark-bg rounded-lg">
              <h3 className="text-sm font-medium text-gray-400 mb-2">Supported Providers</h3>
              <ul className="text-sm text-gray-500 space-y-1">
                <li>• Yahoo Finance (default, no key needed)</li>
                <li>• Alpha Vantage (requires API key)</li>
                <li>• Finnhub (requires API key)</li>
                <li>• Polygon.io (requires API key)</li>
                <li>• Twelve Data (requires API key)</li>
              </ul>
            </div>

            <p className="text-xs text-gray-500 mt-4">
              To use a different provider, set the corresponding API key in your environment variables.
              See <code className="text-blue-400">.env.example</code> for configuration options.
            </p>
          </div>
        </div>

        {/* Keyboard Shortcuts */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-medium text-white">Keyboard Shortcuts</h2>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-2 gap-4 text-sm">
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
            </div>
            <p className="text-xs text-gray-500 mt-4">
              Keyboard shortcuts work on all pages.
            </p>
          </div>
        </div>

        {/* About */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-medium text-white">About</h2>
          </div>
          <div className="card-body">
            <p className="text-sm text-gray-400">
              Leveraged ETF Trading Dashboard v1.0.0
            </p>
            <p className="text-sm text-gray-400 mt-2">
              A personal trading dashboard optimized for scalping leveraged ETFs with custom RSI indicators.
            </p>
            <p className="text-xs text-gray-500 mt-4 border-t border-dark-border pt-4">
              This application is for personal trade tracking and analysis purposes only.
              It does not constitute financial advice. Past performance does not guarantee
              future results. Trading leveraged ETFs involves significant risk.
            </p>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

function generateTradeCSV(trades: ReturnType<typeof useTradeStore.getState>['trades']): string {
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

  const rows = trades.map(trade => [
    trade.id,
    trade.ticker,
    trade.status,
    new Date(trade.createdAt).toISOString(),
    trade.closedAt ? new Date(trade.closedAt).toISOString() : '',
    trade.entries.length,
    trade.avgCost.toFixed(2),
    trade.totalShares,
    trade.realizedPnL.toFixed(2),
    `"${trade.notes.replace(/"/g, '""')}"`,
    `"${trade.tags.join(', ')}"`,
  ]);

  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}
