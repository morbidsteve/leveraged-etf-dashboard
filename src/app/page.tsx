'use client';

import { useMemo } from 'react';
import { MainLayout } from '@/components/Layout';
import { PriceDisplay } from '@/components/Price';
import { RSIIndicator, RSIGauge } from '@/components/RSI';
import { CandlestickChart } from '@/components/Chart';
import { QuickStats, OpenPositions } from '@/components/Dashboard';
import { usePriceData, useHydration, useStoreHydration, useKeyboardShortcuts } from '@/hooks';
import { useTradeStore, usePriceStore, useSettingsStore } from '@/store';
import { calculatePortfolioSummary } from '@/lib/calculations';
import { DEFAULT_RSI_CONFIG } from '@/lib/rsi';

export default function DashboardPage() {
  const hydrated = useHydration();
  const storeHydrated = useStoreHydration();
  const settings = useSettingsStore((state) => state.settings);

  // Use stored RSI config or default if not hydrated
  const rsiConfig = storeHydrated ? settings.rsiConfig : DEFAULT_RSI_CONFIG;

  const { priceData, candles, rsiData, isLoading, error, refresh } = usePriceData({
    ticker: 'TQQQ',
    interval: '1m',
    range: '5d',
    refreshInterval: 10000,
    enabled: hydrated,
    rsiConfig,
  });

  const trades = useTradeStore((state) => state.trades);
  const prices = usePriceStore((state) => state.prices);

  // Keyboard shortcuts
  useKeyboardShortcuts({ onRefresh: refresh });

  const portfolioSummary = useMemo(() => {
    return calculatePortfolioSummary(trades);
  }, [trades]);

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
      {/* Header with Price and RSI */}
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

        {/* RSI Card */}
        <div className="card w-full lg:w-80">
          <div className="card-body">
            <RSIGauge data={rsiData} config={rsiConfig} />
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="mb-6">
        <QuickStats summary={portfolioSummary} />
      </div>

      {/* Chart Section */}
      <div className="card mb-6">
        <div className="card-header flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h3 className="font-medium text-white">TQQQ Chart</h3>
            <div className="flex items-center gap-2">
              <RSIIndicator data={rsiData} size="sm" showLabel={false} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">1-min candles</span>
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
                trades={trades.filter((t) => t.ticker === 'TQQQ')}
                rsiConfig={rsiConfig}
                showRSI={true}
                showVolume={true}
                showTradeMarkers={true}
                showRSICrossings={true}
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
