'use client';

import { useState } from 'react';
import { MainLayout } from '@/components/Layout';
import { CandlestickChart } from '@/components/Chart';
import { RSIIndicator } from '@/components/RSI';
import { PriceDisplay } from '@/components/Price';
import { usePriceData } from '@/hooks/usePriceData';
import { DEFAULT_RSI_CONFIG } from '@/lib/rsi';
import { ChartTimeframe } from '@/types';

const TIMEFRAMES: ChartTimeframe[] = [
  { label: '1 min', value: '1m', minutes: 1 },
  { label: '5 min', value: '5m', minutes: 5 },
  { label: '15 min', value: '15m', minutes: 15 },
  { label: '1 hour', value: '1h', minutes: 60 },
  { label: 'Daily', value: '1d', minutes: 1440 },
];

const TICKERS = ['TQQQ', 'SQQQ', 'UPRO', 'SPXU'];

export default function ChartPage() {
  const [selectedTicker, setSelectedTicker] = useState('TQQQ');
  const [selectedTimeframe, setSelectedTimeframe] = useState<ChartTimeframe>(TIMEFRAMES[0]);

  const range = getRange(selectedTimeframe.value);

  const { priceData, candles, rsiData, isLoading, refresh } = usePriceData({
    ticker: selectedTicker,
    interval: selectedTimeframe.value,
    range,
    refreshInterval: selectedTimeframe.minutes <= 5 ? 10000 : 30000,
  });

  return (
    <MainLayout>
      {/* Controls Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          {/* Ticker Selector */}
          <div className="flex items-center gap-2">
            {TICKERS.map((ticker) => (
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

      {/* Price Display */}
      <div className="card mb-4">
        <div className="card-body py-3">
          <div className="flex items-center justify-between">
            <PriceDisplay data={priceData} size="md" showVolume={true} />
            <div className="text-right">
              <div className="text-xs text-gray-500">RSI ({DEFAULT_RSI_CONFIG.period})</div>
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
          <span className="text-xs text-gray-500">
            {candles.length} candles loaded
          </span>
        </div>
        <div className="p-2">
          {candles.length > 0 ? (
            <CandlestickChart
              candles={candles}
              rsiConfig={DEFAULT_RSI_CONFIG}
              showRSI={true}
              showVolume={true}
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
      <div className="mt-4 flex items-center justify-center gap-6 text-sm text-gray-500">
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
          <span>RSI &lt; 50 (Oversold)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-1 bg-loss" />
          <span>RSI &gt; 55 (Overbought)</span>
        </div>
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
