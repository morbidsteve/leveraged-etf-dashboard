'use client';

import { RSIData, RSIConfig } from '@/types';
import { formatRSI, getRSIColor, DEFAULT_RSI_CONFIG } from '@/lib/rsi';

interface RSIIndicatorProps {
  data: RSIData | null;
  config?: RSIConfig;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export default function RSIIndicator({
  data,
  config = DEFAULT_RSI_CONFIG,
  size = 'md',
  showLabel = true,
}: RSIIndicatorProps) {
  if (!data) {
    return (
      <div className="flex flex-col items-center">
        {showLabel && <span className="text-xs text-gray-500 mb-1">RSI ({config.period})</span>}
        <div className={`rsi-indicator rsi-neutral ${getSizeClasses(size)}`}>
          <span className="animate-pulse">--</span>
        </div>
      </div>
    );
  }

  const statusClass = getStatusClass(data.status);
  const statusLabel = getStatusLabel(data.status);

  return (
    <div className="flex flex-col items-center">
      {showLabel && (
        <span className="text-xs text-gray-500 mb-1">RSI ({config.period})</span>
      )}
      <div
        className={`rsi-indicator ${statusClass} ${getSizeClasses(size)}`}
        style={{ borderColor: getRSIColor(data.status) }}
      >
        <span className="font-mono">{formatRSI(data.value)}</span>
      </div>
      <span
        className="text-xs mt-1 font-medium"
        style={{ color: getRSIColor(data.status) }}
      >
        {statusLabel}
      </span>
    </div>
  );
}

function getSizeClasses(size: 'sm' | 'md' | 'lg'): string {
  switch (size) {
    case 'sm':
      return 'px-3 py-1 text-sm';
    case 'md':
      return 'px-4 py-2 text-lg';
    case 'lg':
      return 'px-6 py-3 text-2xl';
  }
}

function getStatusClass(status: 'buy' | 'sell' | 'neutral'): string {
  switch (status) {
    case 'buy':
      return 'rsi-buy';
    case 'sell':
      return 'rsi-sell';
    case 'neutral':
      return 'rsi-neutral';
  }
}

function getStatusLabel(status: 'buy' | 'sell' | 'neutral'): string {
  switch (status) {
    case 'buy':
      return 'OVERSOLD - BUY SIGNAL';
    case 'sell':
      return 'OVERBOUGHT';
    case 'neutral':
      return 'NEUTRAL';
  }
}
