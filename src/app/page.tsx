'use client';

import { useState, useMemo, useEffect } from 'react';
import { MainLayout } from '@/components/Layout';
import { PriceDisplay } from '@/components/Price';
import { RSIIndicator, RSIGauge } from '@/components/RSI';
import { CandlestickChart } from '@/components/Chart';
import { QuickStats, OpenPositions, Watchlist } from '@/components/Dashboard';
import { usePriceData, useHydration, useStoreHydration, useKeyboardShortcuts } from '@/hooks';
import { useTradeStore, usePriceStore, useSettingsStore } from '@/store';
import { calculatePortfolioSummary } from '@/lib/calculations';
import { DEFAULT_RSI_CONFIG } from '@/lib/rsi';

const INTERVALS = [
  { label: '1m', value: '1m' as const },
  { label: '5m', value: '5m' as const },
  { label: '15m', value: '15m' as const },
  { label: '1h', value: '1h' as const },
  { label: '1D', value: '1d' as const },
];

const RANGES = [
  { label: '1D', value: '1d' as const },
  { label: '5D', value: '5d' as const },
  { label: '1M', value: '1mo' as const },
  { label: '3M', value: '3mo' as const },
];

export default function DashboardPage() {
  const hydrated = useHydration();
  const storeHydrated = useStoreHydration();
  const settings = useSettingsStore((state) => state.settings);
  const updateRSIConfig = useSettingsStore((state) => state.updateRSIConfig);
  const addToWatchlist = useSettingsStore((state) => state.addToWatchlist);
  const removeFromWatchlist = useSettingsStore((state) => state.removeFromWatchlist);
  const updateChartSettings = useSettingsStore((state) => state.updateChartSettings);

  const [selectedTicker, setSelectedTicker] = useState('TQQQ');
  const [showBuySignals, setShowBuySignals] = useState(true);
  const [showAddTicker, setShowAddTicker] = useState(false);
  const [newTicker, setNewTicker] = useState('');
  const [showRSISettings, setShowRSISettings] = useState(false);

  // Use stored settings or defaults
  const rsiConfig = storeHydrated ? settings.rsiConfig : DEFAULT_RSI_CONFIG;
  const watchlist = storeHydrated ? settings.watchlist : ['TQQQ', 'SQQQ', 'UPRO', 'SPXU'];
  const chartInterval = storeHydrated ? settings.chartSettings?.interval || '1m' : '1m';
  const chartRange = storeHydrated ? settings.chartSettings?.range || '5d' : '5d';
  const refreshInterval = storeHydrated ? settings.refreshInterval : 1000;

  // Dynamic data fetching for watchlist tickers
  const tickerDataHooks: Record<string, ReturnType<typeof usePriceData>> = {};

  // We need to call hooks unconditionally, so we'll fetch for all potential tickers
  const tqqq = usePriceData({ ticker: 'TQQQ', interval: chartInterval, range: chartRange, refreshInterval, enabled: hydrated && watchlist.includes('TQQQ'), rsiConfig });
  const sqqq = usePriceData({ ticker: 'SQQQ', interval: chartInterval, range: chartRange, refreshInterval, enabled: hydrated && watchlist.includes('SQQQ'), rsiConfig });
  const upro = usePriceData({ ticker: 'UPRO', interval: chartInterval, range: chartRange, refreshInterval, enabled: hydrated && watchlist.includes('UPRO'), rsiConfig });
  const spxu = usePriceData({ ticker: 'SPXU', interval: chartInterval, range: chartRange, refreshInterval, enabled: hydrated && watchlist.includes('SPXU'), rsiConfig });
  const tna = usePriceData({ ticker: 'TNA', interval: chartInterval, range: chartRange, refreshInterval, enabled: hydrated && watchlist.includes('TNA'), rsiConfig });
  const tza = usePriceData({ ticker: 'TZA', interval: chartInterval, range: chartRange, refreshInterval, enabled: hydrated && watchlist.includes('TZA'), rsiConfig });
  const labu = usePriceData({ ticker: 'LABU', interval: chartInterval, range: chartRange, refreshInterval, enabled: hydrated && watchlist.includes('LABU'), rsiConfig });
  const labd = usePriceData({ ticker: 'LABD', interval: chartInterval, range: chartRange, refreshInterval, enabled: hydrated && watchlist.includes('LABD'), rsiConfig });
  const soxl = usePriceData({ ticker: 'SOXL', interval: chartInterval, range: chartRange, refreshInterval, enabled: hydrated && watchlist.includes('SOXL'), rsiConfig });
  const soxs = usePriceData({ ticker: 'SOXS', interval: chartInterval, range: chartRange, refreshInterval, enabled: hydrated && watchlist.includes('SOXS'), rsiConfig });
  const tecl = usePriceData({ ticker: 'TECL', interval: chartInterval, range: chartRange, refreshInterval, enabled: hydrated && watchlist.includes('TECL'), rsiConfig });
  const tecs = usePriceData({ ticker: 'TECS', interval: chartInterval, range: chartRange, refreshInterval, enabled: hydrated && watchlist.includes('TECS'), rsiConfig });
  const fngu = usePriceData({ ticker: 'FNGU', interval: chartInterval, range: chartRange, refreshInterval, enabled: hydrated && watchlist.includes('FNGU'), rsiConfig });
  const fngd = usePriceData({ ticker: 'FNGD', interval: chartInterval, range: chartRange, refreshInterval, enabled: hydrated && watchlist.includes('FNGD'), rsiConfig });
  const custom = usePriceData({ ticker: selectedTicker, interval: chartInterval, range: chartRange, refreshInterval, enabled: hydrated && !['TQQQ','SQQQ','UPRO','SPXU','TNA','TZA','LABU','LABD','SOXL','SOXS','TECL','TECS','FNGU','FNGD'].includes(selectedTicker), rsiConfig });

  // Map ticker data
  const tickerDataMap: Record<string, ReturnType<typeof usePriceData>> = {
    TQQQ: tqqq, SQQQ: sqqq, UPRO: upro, SPXU: spxu,
    TNA: tna, TZA: tza, LABU: labu, LABD: labd,
    SOXL: soxl, SOXS: soxs, TECL: tecl, TECS: tecs,
    FNGU: fngu, FNGD: fngd,
  };

  // Get selected ticker's data
  const selectedData = tickerDataMap[selectedTicker] || custom;
  const { priceData, candles, rsiData, isLoading, error, refresh } = selectedData;

  const trades = useTradeStore((state) => state.trades);
  const prices = usePriceStore((state) => state.prices);

  // Keyboard shortcuts
  useKeyboardShortcuts({ onRefresh: refresh });

  const portfolioSummary = useMemo(() => {
    return calculatePortfolioSummary(trades);
  }, [trades]);

  // Build watchlist items
  const watchlistItems = watchlist.map((ticker) => {
    const data = tickerDataMap[ticker] || { priceData: null, rsiData: null, isLoading: true };
    return {
      ticker,
      priceData: data.priceData,
      rsiData: data.rsiData,
      isLoading: data.isLoading,
    };
  });

  const handleAddTicker = () => {
    if (newTicker.trim()) {
      addToWatchlist(newTicker.trim());
      setNewTicker('');
      setShowAddTicker(false);
    }
  };

  if (!hydrated || !storeHydrated) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-[500px] text-gray-500">
          <span className="animate-pulse">Loading dashboard...</span>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      {/* Watchlist - Multi-ticker overview */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide">Watchlist</h2>
          <div className="flex items-center gap-2">
            {showAddTicker ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newTicker}
                  onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTicker()}
                  placeholder="TICKER"
                  className="w-24 px-2 py-1 text-xs bg-dark-card border border-gray-600 rounded text-white"
                  autoFocus
                />
                <button
                  onClick={handleAddTicker}
                  className="text-xs px-2 py-1 bg-profit/20 text-profit rounded hover:bg-profit/30"
                >
                  Add
                </button>
                <button
                  onClick={() => { setShowAddTicker(false); setNewTicker(''); }}
                  className="text-xs px-2 py-1 bg-gray-700 text-gray-400 rounded hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAddTicker(true)}
                className="text-xs px-2 py-1 bg-gray-700/50 text-gray-400 rounded hover:bg-gray-600 hover:text-white transition-colors"
              >
                + Add Ticker
              </button>
            )}
          </div>
        </div>
        <Watchlist
          items={watchlistItems}
          selectedTicker={selectedTicker}
          onSelect={setSelectedTicker}
          onRemove={removeFromWatchlist}
        />
      </div>

      {/* Selected Ticker Details + RSI Settings */}
      <div className="flex flex-col lg:flex-row gap-6 mb-6">
        {/* Price Card */}
        <div className="card flex-1">
          <div className="card-body">
            <div className="flex items-start justify-between">
              <PriceDisplay data={priceData} />
              <button
                onClick={refresh}
                className="btn btn-ghost p-2"
                title="Refresh"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
            {error && (
              <div className="mt-2 text-sm text-loss">{error}</div>
            )}
          </div>
        </div>

        {/* RSI Card with Settings */}
        <div className="card w-full lg:w-96">
          <div className="card-body">
            <div className="flex items-center justify-between mb-2">
              <RSIGauge data={rsiData} config={rsiConfig} />
              <button
                onClick={() => setShowRSISettings(!showRSISettings)}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                title="RSI Settings"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>

            {/* RSI Settings Panel */}
            {showRSISettings && (
              <div className="mt-3 pt-3 border-t border-gray-700 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-400">Oversold (Buy)</label>
                  <input
                    type="number"
                    value={rsiConfig.oversold}
                    onChange={(e) => updateRSIConfig({ oversold: Number(e.target.value) })}
                    className="w-16 px-2 py-1 text-xs bg-dark-card border border-gray-600 rounded text-white text-right"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-400">Overbought (Sell)</label>
                  <input
                    type="number"
                    value={rsiConfig.overbought}
                    onChange={(e) => updateRSIConfig({ overbought: Number(e.target.value) })}
                    className="w-16 px-2 py-1 text-xs bg-dark-card border border-gray-600 rounded text-white text-right"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-400">Period</label>
                  <input
                    type="number"
                    value={rsiConfig.period}
                    onChange={(e) => updateRSIConfig({ period: Number(e.target.value) })}
                    className="w-16 px-2 py-1 text-xs bg-dark-card border border-gray-600 rounded text-white text-right"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="mb-6">
        <QuickStats summary={portfolioSummary} />
      </div>

      {/* Chart Section */}
      <div className="card mb-6">
        <div className="card-header flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <h3 className="font-medium text-white">{selectedTicker} Chart</h3>
            <div className="flex items-center gap-2">
              <RSIIndicator data={rsiData} size="sm" showLabel={false} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Chart Interval */}
            <div className="flex items-center gap-1 bg-gray-800/50 rounded p-0.5">
              {INTERVALS.map((int) => (
                <button
                  key={int.value}
                  onClick={() => updateChartSettings({ interval: int.value })}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    chartInterval === int.value
                      ? 'bg-blue-500/30 text-blue-400'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {int.label}
                </button>
              ))}
            </div>
            {/* Chart Range */}
            <div className="flex items-center gap-1 bg-gray-800/50 rounded p-0.5">
              {RANGES.map((rng) => (
                <button
                  key={rng.value}
                  onClick={() => updateChartSettings({ range: rng.value })}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    chartRange === rng.value
                      ? 'bg-purple-500/30 text-purple-400'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {rng.label}
                </button>
              ))}
            </div>
            {/* Buy Signal Toggle */}
            <button
              onClick={() => setShowBuySignals(!showBuySignals)}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                showBuySignals
                  ? 'bg-profit/20 text-profit border border-profit/30'
                  : 'bg-gray-700/50 text-gray-400 border border-gray-600'
              }`}
              title="Toggle RSI buy signal markers"
            >
              RSI Buy Signals {showBuySignals ? 'ON' : 'OFF'}
            </button>
            {isLoading && (
              <span className="text-xs text-gray-500 animate-pulse">Updating...</span>
            )}
          </div>
        </div>
        <div className="p-2">
          {candles.length > 0 ? (
            <div className="h-[300px] sm:h-[400px] lg:h-[500px]">
              <CandlestickChart
                candles={candles}
                trades={trades.filter((t) => t.ticker === selectedTicker)}
                rsiConfig={rsiConfig}
                showRSI={true}
                showVolume={true}
                showTradeMarkers={true}
                showRSICrossings={showBuySignals}
                showOversoldCrossings={showBuySignals}
                showOverboughtCrossings={false}
              />
            </div>
          ) : (
            <div className="h-[300px] sm:h-[400px] lg:h-[500px] flex items-center justify-center text-gray-500">
              {isLoading ? 'Loading chart data...' : 'No chart data available'}
            </div>
          )}
        </div>
      </div>

      {/* Open Positions */}
      <div className="mb-6">
        <OpenPositions trades={trades} prices={prices} />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <a href="/trades/new" className="card card-body hover:bg-dark-hover transition-colors cursor-pointer">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-profit/20 rounded-lg">
              <svg className="w-5 h-5 text-profit" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <div>
              <div className="font-medium text-white">New Trade</div>
              <div className="text-xs text-gray-500">Log entry</div>
            </div>
          </div>
        </a>

        <a href="/calculator" className="card card-body hover:bg-dark-hover transition-colors cursor-pointer">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <div className="font-medium text-white">DCA Calculator</div>
              <div className="text-xs text-gray-500">Plan entries</div>
            </div>
          </div>
        </a>

        <a href="/chart" className="card card-body hover:bg-dark-hover transition-colors cursor-pointer">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
            </div>
            <div>
              <div className="font-medium text-white">Full Chart</div>
              <div className="text-xs text-gray-500">Advanced view</div>
            </div>
          </div>
        </a>

        <a href="/analytics" className="card card-body hover:bg-dark-hover transition-colors cursor-pointer">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500/20 rounded-lg">
              <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <div className="font-medium text-white">Analytics</div>
              <div className="text-xs text-gray-500">Performance</div>
            </div>
          </div>
        </a>
      </div>
    </MainLayout>
  );
}
