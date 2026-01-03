'use client';

import { RSIData, RSIConfig } from '@/types';
import { formatRSI, getRSIColor, DEFAULT_RSI_CONFIG } from '@/lib/rsi';

interface RSIGaugeProps {
  data: RSIData | null;
  config?: RSIConfig;
}

export default function RSIGauge({ data, config = DEFAULT_RSI_CONFIG }: RSIGaugeProps) {
  const value = data?.value ?? 50;
  const status = data?.status ?? 'neutral';

  // Calculate position on gauge (0-100 scale)
  const position = Math.min(100, Math.max(0, value));

  return (
    <div className="w-full">
      {/* RSI Value Display */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-400">RSI ({config.period})</span>
        <span
          className="font-mono text-xl font-bold"
          style={{ color: getRSIColor(status) }}
        >
          {data ? formatRSI(value) : '--'}
        </span>
      </div>

      {/* Gauge Bar */}
      <div className="relative h-4 bg-dark-border rounded-full overflow-hidden">
        {/* Zones */}
        <div
          className="absolute inset-y-0 left-0 bg-profit/30"
          style={{ width: `${config.oversold}%` }}
        />
        <div
          className="absolute inset-y-0 bg-neutral/30"
          style={{ left: `${config.oversold}%`, width: `${config.overbought - config.oversold}%` }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-loss/30"
          style={{ width: `${100 - config.overbought}%` }}
        />

        {/* Indicator */}
        {data && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow-lg transition-all duration-300"
            style={{
              left: `calc(${position}% - 6px)`,
              backgroundColor: getRSIColor(status),
            }}
          />
        )}
      </div>

      {/* Scale Labels */}
      <div className="flex justify-between mt-1 text-xs text-gray-500">
        <span>0</span>
        <span className="text-profit">{config.oversold}</span>
        <span className="text-neutral">{config.overbought}</span>
        <span>100</span>
      </div>

      {/* Status Text */}
      <div className="mt-2 text-center">
        <span
          className="text-sm font-medium"
          style={{ color: getRSIColor(status) }}
        >
          {getStatusText(status)}
        </span>
      </div>
    </div>
  );
}

function getStatusText(status: 'buy' | 'sell' | 'neutral'): string {
  switch (status) {
    case 'buy':
      return 'Oversold - Consider Buying';
    case 'sell':
      return 'Overbought - Consider Selling';
    case 'neutral':
      return 'Neutral Zone';
  }
}
