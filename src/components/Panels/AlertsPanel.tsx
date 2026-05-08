'use client';

import { useAlertStore } from '@/store';
import { format } from 'date-fns';
import CustomAlertRulesPanel from './CustomAlertRulesPanel';

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

export default function AlertsPanel() {
  const { alerts, settings, acknowledgeAlert, clearAlerts, updateSettings } = useAlertStore();

  const handleToggle = (key: keyof typeof settings) => {
    if (typeof settings[key] === 'boolean') {
      updateSettings({ [key]: !settings[key] });
    }
  };

  return (
    <div className="space-y-6">
      <CustomAlertRulesPanel />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
              Alert History
            </h2>
            {alerts.length > 0 && (
              <button onClick={clearAlerts} className="btn btn-ghost text-xs">
                Clear All
              </button>
            )}
          </div>

          <div className="card">
            {alerts.length === 0 ? (
              <div className="card-body text-center py-12 text-gray-500">
                <svg
                  className="w-10 h-10 mx-auto mb-3 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
                <p className="text-sm">No alerts yet</p>
                <p className="text-xs mt-1">Alerts will appear here when triggered</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {alerts
                  .sort(
                    (a, b) =>
                      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                  )
                  .map((alert) => (
                    <div
                      key={alert.id}
                      className={`p-4 flex items-start justify-between ${
                        alert.acknowledged ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 ${
                            ALERT_TYPE_COLORS[alert.type] || 'text-gray-400'
                          }`}
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                            />
                          </svg>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">{alert.ticker}</span>
                            <span
                              className={`text-sm ${
                                ALERT_TYPE_COLORS[alert.type] || 'text-gray-400'
                              }`}
                            >
                              {ALERT_TYPE_LABELS[alert.type] || alert.type}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">{alert.message}</p>
                          <p className="text-[10px] text-gray-500 mt-1">
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

        <div className="card h-fit">
          <div className="card-header">
            <h2 className="font-medium text-white">Alert Settings</h2>
          </div>
          <div className="card-body space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-white text-sm">Alerts Enabled</div>
                <div className="text-[10px] text-gray-500">Master toggle</div>
              </div>
              <Toggle
                value={settings.enabled}
                onChange={() => handleToggle('enabled')}
              />
            </div>

            <div className="border-t border-white/5 pt-4 space-y-4">
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                RSI Thresholds
              </h3>
              <div>
                <label className="label">Buy Signal (RSI below)</label>
                <input
                  type="number"
                  value={settings.rsiBuyThreshold}
                  onChange={(e) =>
                    updateSettings({ rsiBuyThreshold: Number(e.target.value) })
                  }
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
                  onChange={(e) =>
                    updateSettings({ rsiSellThreshold: Number(e.target.value) })
                  }
                  className="input w-full"
                  min="0"
                  max="100"
                />
              </div>
            </div>

            <div className="border-t border-white/5 pt-4 space-y-3">
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Price Alerts
              </h3>
              <div className="flex items-center justify-between text-sm">
                <span>1.5% Target</span>
                <Toggle
                  value={settings.priceAlerts.target15Enabled}
                  onChange={() =>
                    updateSettings({
                      priceAlerts: {
                        ...settings.priceAlerts,
                        target15Enabled: !settings.priceAlerts.target15Enabled,
                      },
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>2% Target</span>
                <Toggle
                  value={settings.priceAlerts.target20Enabled}
                  onChange={() =>
                    updateSettings({
                      priceAlerts: {
                        ...settings.priceAlerts,
                        target20Enabled: !settings.priceAlerts.target20Enabled,
                      },
                    })
                  }
                />
              </div>
            </div>

            <div className="border-t border-white/5 pt-4 space-y-4">
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Other
              </h3>
              <div className="flex items-center justify-between text-sm">
                <span>Sound Enabled</span>
                <Toggle
                  value={settings.soundEnabled}
                  onChange={() => handleToggle('soundEnabled')}
                />
              </div>
              <div>
                <label className="label">Cooldown (minutes)</label>
                <input
                  type="number"
                  value={settings.cooldownMinutes}
                  onChange={(e) =>
                    updateSettings({ cooldownMinutes: Number(e.target.value) })
                  }
                  className="input w-full"
                  min="1"
                  max="60"
                />
              </div>
              <div>
                <label className="label">Drawdown Threshold (%)</label>
                <input
                  type="number"
                  value={settings.drawdownThreshold}
                  onChange={(e) =>
                    updateSettings({ drawdownThreshold: Number(e.target.value) })
                  }
                  className="input w-full"
                  min="1"
                  max="50"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative w-10 h-5 rounded-full transition-colors ${
        value ? 'bg-profit' : 'bg-white/10'
      }`}
      type="button"
    >
      <div
        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
          value ? 'left-5' : 'left-0.5'
        }`}
      />
    </button>
  );
}
