'use client';

import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/Layout';
import { CandlestickChart } from '@/components/Chart';
import { RSIIndicator } from '@/components/RSI';
import { PriceDisplay } from '@/components/Price';
import { usePriceData, useHydration, useStoreHydration } from '@/hooks';
import { useTradeStore, useSettingsStore } from '@/store';
import { ChartTimeframe, RSIConfig } from '@/types';

const TIMEFRAMES: ChartTimeframe[] = [
  { label: '1 min', value: '1m', minutes: 1 },
  { label: '5 min', value: '5m', minutes: 5 },
  { label: '15 min', value: '15m', minutes: 15 },
  { label: '1 hour', value: '1h', minutes: 60 },
  { label: 'Daily', value: '1d', minutes: 1440 },
];

const DEFAULT_TICKERS = ['TQQQ', 'SQQQ', 'UPRO', 'SPXU'];

export default function ChartPage() {
  const hydrated = useHydration();
  const storeHydrated = useStoreHydration();
  const trades = useTradeStore((state) => state.trades);
  const settings = useSettingsStore((state) => state.settings);
  const updateRSIConfig = useSettingsStore((state) => state.updateRSIConfig);

  const [selectedTicker, setSelectedTicker] = useState('TQQQ');
  const [selectedTimeframe, setSelectedTimeframe] = useState<ChartTimeframe>(TIMEFRAMES[0]);
  const [customTicker, setCustomTicker] = useState('');
  const [showRSISettings, setShowRSISettings] = useState(false);
  const [showTradeMarkers, setShowTradeMarkers] = useState(true);
  const [showRSICrossings, setShowRSICrossings] = useState(true);

  // Local RSI config state for editing
  const [localRSIConfig, setLocalRSIConfig] = useState<RSIConfig>({
    period: 250,
    overbought: 55,
    oversold: 50,
  });

  // Sync local RSI config with store when hydrated
  useEffect(() => {
    if (storeHydrated && settings.rsiConfig) {
      setLocalRSIConfig(settings.rsiConfig);
    }
  }, [storeHydrated, settings.rsiConfig]);

  const rsiConfig = storeHydrated ? settings.rsiConfig : localRSIConfig;

  const range = getRange(selectedTimeframe.value);

  const { priceData, candles, rsiData, isLoading, refresh } = usePriceData({
    ticker: selectedTicker,
    interval: selectedTimeframe.value,
    range,
    refreshInterval: selectedTimeframe.minutes <= 5 ? 10000 : 30000,
    enabled: hydrated,
    rsiConfig,
  });

  // Filter trades for the selected ticker
  const tickerTrades = trades.filter(
    (t) => t.ticker.toUpperCase() === selectedTicker.toUpperCase()
  );

  const handleCustomTickerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customTicker.trim()) {
      setSelectedTicker(customTicker.trim().toUpperCase());
      setCustomTicker('');
    }
  };

  const handleRSIConfigSave = () => {
    updateRSIConfig(localRSIConfig);
    setShowRSISettings(false);
  };

  if (!hydrated || !storeHydrated) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-[600px] text-gray-500">
          <span className="animate-pulse">Loading chart...</span>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      {/* Controls Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          {/* Ticker Selector */}
          <div className="flex items-center gap-2">
            {DEFAULT_TICKERS.map((ticker) => (
              <button
                key={ticker}
                onClick={() => setSelectedTicker(ticker)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  selectedTicker === ticker
                    ? 'bg-blue-600 text-white'
                    : 'bg-dark-card text-gray-400 hover:text-white hover:bg-dark-hover'
                }`}
              >
                {ticker}
              </button>
            ))}
          </div>

          {/* Custom Ticker Input */}
          <form onSubmit={handleCustomTickerSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={customTicker}
              onChange={(e) => setCustomTicker(e.target.value.toUpperCase())}
              placeholder="Custom ticker..."
              className="input w-32 text-sm font-mono uppercase"
            />
            <button
              type="submit"
              className="btn btn-ghost text-sm py-1.5"
              disabled={!customTicker.trim()}
            >
              Go
            </button>
          </form>

          {/* Show current custom ticker if not in defaults */}
          {!DEFAULT_TICKERS.includes(selectedTicker) && (
            <span className="px-3 py-1.5 bg-purple-600 text-white rounded-md text-sm font-medium">
              {selectedTicker}
            </span>
          )}

          {/* Timeframe Selector */}
          <div className="flex items-center gap-1 bg-dark-card rounded-lg p-1">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.value}
                onClick={() => setSelectedTimeframe(tf)}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  selectedTimeframe.value === tf.value
                    ? 'bg-dark-hover text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* RSI Indicator */}
          <RSIIndicator data={rsiData} size="sm" />

          {/* RSI Settings Toggle */}
          <button
            onClick={() => setShowRSISettings(!showRSISettings)}
            className={`btn btn-ghost ${showRSISettings ? 'text-blue-400' : ''}`}
            title="RSI Settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          {/* Refresh Button */}
          <button
            onClick={refresh}
            disabled={isLoading}
            className="btn btn-ghost"
          >
            <svg
              className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* RSI Settings Panel */}
      {showRSISettings && (
        <div className="card mb-4">
          <div className="card-header">
            <h3 className="font-medium text-white">RSI Settings</h3>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="label">Period</label>
                <input
                  type="number"
                  value={localRSIConfig.period}
                  onChange={(e) =>
                    setLocalRSIConfig({ ...localRSIConfig, period: parseInt(e.target.value) || 14 })
                  }
                  min={2}
                  max={500}
                  className="input w-full font-mono"
                />
              </div>
              <div>
                <label className="label">Overbought Threshold</label>
                <input
                  type="number"
                  value={localRSIConfig.overbought}
                  onChange={(e) =>
                    setLocalRSIConfig({ ...localRSIConfig, overbought: parseInt(e.target.value) || 70 })
                  }
                  min={50}
                  max={100}
                  className="input w-full font-mono"
                />
              </div>
              <div>
                <label className="label">Oversold Threshold</label>
                <input
                  type="number"
                  value={localRSIConfig.oversold}
                  onChange={(e) =>
                    setLocalRSIConfig({ ...localRSIConfig, oversold: parseInt(e.target.value) || 30 })
                  }
                  min={0}
                  max={50}
                  className="input w-full font-mono"
                />
              </div>
              <div className="flex items-end">
                <button onClick={handleRSIConfigSave} className="btn btn-primary w-full">
                  Save Settings
                </button>
              </div>
            </div>

            {/* Marker toggles */}
            <div className="flex items-center gap-6 mt-4 pt-4 border-t border-dark-border">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTradeMarkers}
                  onChange={(e) => setShowTradeMarkers(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 bg-dark-bg text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-300">Show Trade Markers</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showRSICrossings}
                  onChange={(e) => setShowRSICrossings(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 bg-dark-bg text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-300">Show RSI Crossing Markers</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Price Display */}
      <div className="card mb-4">
        <div className="card-body py-3">
          <div className="flex items-center justify-between">
            <PriceDisplay data={priceData} size="md" showVolume={true} />
            <div className="text-right">
              <div className="text-xs text-gray-500">RSI ({rsiConfig.period})</div>
              <div
                className="text-2xl font-bold font-mono"
                style={{ color: getRSIColor(rsiData?.status) }}
              >
                {rsiData ? rsiData.value.toFixed(2) : '--'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h3 className="font-medium text-white">
            {selectedTicker} - {selectedTimeframe.label} Chart
          </h3>
          <div className="flex items-center gap-4">
            {tickerTrades.length > 0 && (
              <span className="text-xs text-blue-400">
                {tickerTrades.length} trade{tickerTrades.length > 1 ? 's' : ''} for {selectedTicker}
              </span>
            )}
            <span className="text-xs text-gray-500">
              {candles.length} candles loaded
            </span>
          </div>
        </div>
        <div className="p-2">
          {candles.length > 0 ? (
            <CandlestickChart
              candles={candles}
              trades={tickerTrades}
              rsiConfig={rsiConfig}
              showRSI={true}
              showVolume={true}
              showTradeMarkers={showTradeMarkers}
              showRSICrossings={showRSICrossings}
              height={600}
            />
          ) : (
            <div className="h-[600px] flex items-center justify-center text-gray-500">
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Loading chart data...
                </div>
              ) : (
                'No chart data available'
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chart Legend */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-profit rounded" />
          <span>Bullish</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-loss rounded" />
          <span>Bearish</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-1 bg-profit" />
          <span>RSI &lt; {rsiConfig.oversold} (Oversold)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-1 bg-loss" />
          <span>RSI &gt; {rsiConfig.overbought} (Overbought)</span>
        </div>
        {showTradeMarkers && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-profit">▲</span>
              <span>Buy Entry</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-loss">▼</span>
              <span>Sell Exit</span>
            </div>
          </>
        )}
        {showRSICrossings && (
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-500" />
            <span>RSI Crossing</span>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

function getRange(interval: string): '1d' | '5d' | '1mo' | '3mo' {
  switch (interval) {
    case '1m':
      return '5d';
    case '5m':
      return '1mo';
    case '15m':
      return '1mo';
    case '1h':
      return '3mo';
    case '1d':
      return '3mo';
    default:
      return '5d';
  }
}

function getRSIColor(status?: 'buy' | 'sell' | 'neutral'): string {
  switch (status) {
    case 'buy':
      return '#22c55e';
    case 'sell':
      return '#ef4444';
    default:
      return '#eab308';
  }
}
