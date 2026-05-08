'use client';

import dynamic from 'next/dynamic';
import { Candle, RSIConfig, Trade } from '@/types';
import { Time } from 'lightweight-charts';

const CandlestickChart = dynamic(() => import('./CandlestickChart'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[500px] text-gray-500">
      <span className="animate-pulse">Loading chart...</span>
    </div>
  ),
});

interface DynamicChartProps {
  candles: Candle[];
  trades?: Trade[];
  rsiConfig?: RSIConfig;
  showRSI?: boolean;
  showVolume?: boolean;
  showTradeMarkers?: boolean;
  showRSICrossings?: boolean;
  showOversoldCrossings?: boolean;
  showOverboughtCrossings?: boolean;
  height?: number;
  onCrosshairMove?: (price: number | null, time: Time | null) => void;
  showEMA20?: boolean;
  showEMA50?: boolean;
  showVWAP?: boolean;
  showBollinger?: boolean;
  stopLines?: Array<{ ticker: string; price: number; tradeId: string }>;
  entryLines?: Array<{ ticker: string; price: number; tradeId: string }>;
  showPatterns?: boolean;
  onStopDrag?: (tradeId: string, newPrice: number) => void;
  showSessionBands?: boolean;
}

export default function DynamicChart(props: DynamicChartProps) {
  return <CandlestickChart {...props} />;
}
