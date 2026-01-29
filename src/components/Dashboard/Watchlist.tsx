'use client';

import { RSIData, PriceData } from '@/types';
import { getRSIColor } from '@/lib/rsi';
import { formatPrice, formatPercent } from '@/lib/calculations';

interface WatchlistItem {
  ticker: string;
  priceData: PriceData | null;
  rsiData: RSIData | null;
  isLoading: boolean;
}

interface WatchlistProps {
  items: WatchlistItem[];
  selectedTicker: string;
  onSelect: (ticker: string) => void;
  onRemove?: (ticker: string) => void;
}

export function Watchlist({ items, selectedTicker, onSelect, onRemove }: WatchlistProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map((item) => {
        const isSelected = item.ticker === selectedTicker;
        const rsiColor = item.rsiData ? getRSIColor(item.rsiData.status) : '#6b7280';
        const changePercent = item.priceData?.changePercent ?? 0;
        const isPositive = changePercent >= 0;

        return (
          <button
            key={item.ticker}
            onClick={() => onSelect(item.ticker)}
            className={`card card-body p-3 text-left transition-all ${
              isSelected
                ? 'ring-2 ring-blue-500 bg-blue-500/10'
                : 'hover:bg-dark-hover'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-white">{item.ticker}</span>
              <div className="flex items-center gap-1">
                {item.rsiData && (
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded"
                    style={{
                      backgroundColor: `${rsiColor}20`,
                      color: rsiColor,
                    }}
                  >
                    {item.rsiData.status === 'buy'
                      ? 'BUY'
                      : item.rsiData.status === 'sell'
                      ? 'SELL'
                      : 'HOLD'}
                  </span>
                )}
                {onRemove && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(item.ticker);
                    }}
                    className="text-gray-500 hover:text-red-500 transition-colors p-0.5 rounded hover:bg-red-500/10"
                    title={`Remove ${item.ticker}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {item.isLoading ? (
              <div className="animate-pulse">
                <div className="h-6 bg-gray-700 rounded w-20 mb-1"></div>
                <div className="h-4 bg-gray-700 rounded w-16"></div>
              </div>
            ) : item.priceData ? (
              <>
                <div className="text-lg font-mono text-white">
                  ${formatPrice(item.priceData.price)}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className={isPositive ? 'text-profit' : 'text-loss'}>
                    {isPositive ? '+' : ''}
                    {formatPercent(changePercent)}
                  </span>
                  {item.rsiData && (
                    <span className="text-gray-500">
                      RSI: <span style={{ color: rsiColor }}>{item.rsiData.value.toFixed(1)}</span>
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="text-gray-500 text-sm">No data</div>
            )}
          </button>
        );
      })}
    </div>
  );
}
