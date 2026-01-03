'use client';

import { MainLayout } from '@/components/Layout';
import { useAlertStore } from '@/store';
import { format } from 'date-fns';

const ALERT_TYPE_LABELS: Record<string, string> = {
  rsi_oversold: 'RSI Oversold (Buy Signal)',
  rsi_overbought: 'RSI Overbought (Sell Signal)',
  price_target_15: 'Price Target 1.5%',
  price_target_20: 'Price Target 2%',
  volume_spike: 'Volume Spike',
  drawdown: 'Drawdown Warning',
};

const ALERT_TYPE_COLORS: Record<string, string> = {
  rsi_oversold: 'text-profit',
  rsi_overbought: 'text-loss',
  price_target_15: 'text-profit',
  price_target_20: 'text-profit',
  volume_spike: 'text-neutral',
  drawdown: 'text-loss',
};

export default function AlertsPage() {
  const { alerts, settings, acknowledgeAlert, clearAlerts, updateSettings } = useAlertStore();

  const handleToggle = (key: keyof typeof settings) => {
    if (typeof settings[key] === 'boolean') {
      updateSettings({ [key]: !settings[key] });
    }
  };

  return (
    <MainLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Alerts</h1>
        {alerts.length > 0 && (
          <button onClick={clearAlerts} className="btn btn-ghost">
            Clear All
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alert History */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="card-header">
              <h2 className="font-medium text-white">Alert History</h2>
            </div>
            {alerts.length === 0 ? (
              <div className="card-body text-center py-12 text-gray-500">
                <svg className="w-12 h-12 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <p>No alerts yet</p>
                <p className="text-sm mt-1">Alerts will appear here when triggered</p>
              </div>
            ) : (
              <div className="divide-y divide-dark-border">
                {alerts
                  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                  .map((alert) => (
                    <div
                      key={alert.id}
                      className={`p-4 flex items-start justify-between ${alert.acknowledged ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 ${ALERT_TYPE_COLORS[alert.type] || 'text-gray-400'}`}>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                          </svg>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">{alert.ticker}</span>
                            <span className={`text-sm ${ALERT_TYPE_COLORS[alert.type] || 'text-gray-400'}`}>
                              {ALERT_TYPE_LABELS[alert.type] || alert.type}
                            </span>
                          </div>
                          <p className="text-sm text-gray-400 mt-1">{alert.message}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {format(new Date(alert.timestamp), 'MMM dd, yyyy HH:mm:ss')}
                          </p>
                        </div>
                      </div>
                      {!alert.acknowledged && (
                        <button
                          onClick={() => acknowledgeAlert(alert.id)}
                          className="btn btn-ghost text-xs"
                        >
                          Dismiss
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Alert Settings */}
        <div className="card h-fit">
          <div className="card-header">
            <h2 className="font-medium text-white">Alert Settings</h2>
          </div>
          <div className="card-body space-y-6">
            {/* Master Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-white">Alerts Enabled</div>
                <div className="text-xs text-gray-500">Master toggle for all alerts</div>
              </div>
              <button
                onClick={() => handleToggle('enabled')}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  settings.enabled ? 'bg-profit' : 'bg-dark-border'
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    settings.enabled ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>

            <div className="border-t border-dark-border pt-4 space-y-4">
              <h3 className="text-sm font-medium text-gray-400">RSI Thresholds</h3>

              <div>
                <label className="label">Buy Signal (RSI below)</label>
                <input
                  type="number"
                  value={settings.rsiBuyThreshold}
                  onChange={(e) => updateSettings({ rsiBuyThreshold: Number(e.target.value) })}
                  className="input w-full"
                  min="0"
                  max="100"
                />
              </div>

              <div>
                <label className="label">Sell Signal (RSI above)</label>
                <input
                  type="number"
                  value={settings.rsiSellThreshold}
                  onChange={(e) => updateSettings({ rsiSellThreshold: Number(e.target.value) })}
                  className="input w-full"
                  min="0"
                  max="100"
                />
              </div>
            </div>

            <div className="border-t border-dark-border pt-4 space-y-4">
              <h3 className="text-sm font-medium text-gray-400">Price Alerts</h3>

              <div className="flex items-center justify-between">
                <span className="text-sm">1.5% Target Alert</span>
                <button
                  onClick={() => updateSettings({
                    priceAlerts: { ...settings.priceAlerts, target15Enabled: !settings.priceAlerts.target15Enabled }
                  })}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    settings.priceAlerts.target15Enabled ? 'bg-profit' : 'bg-dark-border'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                      settings.priceAlerts.target15Enabled ? 'left-5' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm">2% Target Alert</span>
                <button
                  onClick={() => updateSettings({
                    priceAlerts: { ...settings.priceAlerts, target20Enabled: !settings.priceAlerts.target20Enabled }
                  })}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    settings.priceAlerts.target20Enabled ? 'bg-profit' : 'bg-dark-border'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                      settings.priceAlerts.target20Enabled ? 'left-5' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="border-t border-dark-border pt-4 space-y-4">
              <h3 className="text-sm font-medium text-gray-400">Other Settings</h3>

              <div className="flex items-center justify-between">
                <span className="text-sm">Sound Enabled</span>
                <button
                  onClick={() => handleToggle('soundEnabled')}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    settings.soundEnabled ? 'bg-profit' : 'bg-dark-border'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                      settings.soundEnabled ? 'left-5' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>

              <div>
                <label className="label">Cooldown (minutes)</label>
                <input
                  type="number"
                  value={settings.cooldownMinutes}
                  onChange={(e) => updateSettings({ cooldownMinutes: Number(e.target.value) })}
                  className="input w-full"
                  min="1"
                  max="60"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Minimum time between repeated alerts
                </p>
              </div>

              <div>
                <label className="label">Drawdown Threshold (%)</label>
                <input
                  type="number"
                  value={settings.drawdownThreshold}
                  onChange={(e) => updateSettings({ drawdownThreshold: Number(e.target.value) })}
                  className="input w-full"
                  min="1"
                  max="50"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Alert when position drops below this %
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
