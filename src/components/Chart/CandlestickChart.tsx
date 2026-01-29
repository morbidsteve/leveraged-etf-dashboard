'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
  LineData,
  Time,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  SeriesMarker,
  createSeriesMarkers,
  ISeriesMarkersPluginApi,
} from 'lightweight-charts';
import { Candle, RSIConfig, Trade } from '@/types';
import { calculateRSIWithTimestamps, DEFAULT_RSI_CONFIG } from '@/lib/rsi';

interface TradeMarker {
  time: number; // Unix timestamp in seconds
  type: 'buy' | 'sell';
  price: number;
  shares: number;
}

interface RSICrossing {
  time: number;
  type: 'oversold' | 'overbought';
  rsiValue: number;
}

interface CandlestickChartProps {
  candles: Candle[];
  trades?: Trade[];
  rsiConfig?: RSIConfig;
  showRSI?: boolean;
  showVolume?: boolean;
  showTradeMarkers?: boolean;
  showRSICrossings?: boolean;
  showOversoldCrossings?: boolean;
  showOverboughtCrossings?: boolean;
  height?: number; // If not provided, uses container height
  onCrosshairMove?: (price: number | null, time: Time | null) => void;
}

// Helper to extract trade markers from trades
function extractTradeMarkers(trades: Trade[]): TradeMarker[] {
  const markers: TradeMarker[] = [];

  for (const trade of trades) {
    // Add entry markers (buys)
    for (const entry of trade.entries) {
      const date = new Date(entry.date);
      markers.push({
        time: Math.floor(date.getTime() / 1000),
        type: 'buy',
        price: entry.price,
        shares: entry.shares,
      });
    }

    // Add exit markers (sells)
    for (const exit of trade.exits) {
      const date = new Date(exit.date);
      markers.push({
        time: Math.floor(date.getTime() / 1000),
        type: 'sell',
        price: exit.price,
        shares: exit.shares,
      });
    }
  }

  return markers.sort((a, b) => a.time - b.time);
}

// Helper to format volume for display
function formatVolume(volume: number): string {
  if (volume >= 1_000_000_000) {
    return (volume / 1_000_000_000).toFixed(2) + 'B';
  }
  if (volume >= 1_000_000) {
    return (volume / 1_000_000).toFixed(2) + 'M';
  }
  if (volume >= 1_000) {
    return (volume / 1_000).toFixed(1) + 'K';
  }
  return volume.toFixed(0);
}

// Helper to get RSI color based on value
function getRSIColor(rsi: number, config: RSIConfig): string {
  if (rsi <= config.oversold) {
    return 'text-profit';
  }
  if (rsi >= config.overbought) {
    return 'text-loss';
  }
  return 'text-yellow-400';
}

// Helper to detect RSI threshold crossings based on config
// Simple logic: mark when RSI crosses FROM above threshold TO below (oversold) or FROM below TO above (overbought)
function detectRSICrossings(
  rsiData: { time: number; value: number }[],
  config: RSIConfig,
  showOversoldCrossings: boolean = true,
  showOverboughtCrossings: boolean = false
): RSICrossing[] {
  const crossings: RSICrossing[] = [];

  if (rsiData.length < 2) return crossings;

  for (let i = 1; i < rsiData.length; i++) {
    const prev = rsiData[i - 1];
    const curr = rsiData[i];

    // OVERSOLD crossing: RSI drops from >= threshold to < threshold
    if (showOversoldCrossings) {
      if (prev.value >= config.oversold && curr.value < config.oversold) {
        crossings.push({
          time: curr.time,
          type: 'oversold',
          rsiValue: curr.value,
        });
      }
    }

    // OVERBOUGHT crossing: RSI rises from <= threshold to > threshold
    if (showOverboughtCrossings) {
      if (prev.value <= config.overbought && curr.value > config.overbought) {
        crossings.push({
          time: curr.time,
          type: 'overbought',
          rsiValue: curr.value,
        });
      }
    }
  }

  return crossings;
}

export default function CandlestickChart({
  candles,
  trades = [],
  rsiConfig = DEFAULT_RSI_CONFIG,
  showRSI = true,
  showVolume = true,
  showTradeMarkers = true,
  showRSICrossings = true,
  showOversoldCrossings = true,
  showOverboughtCrossings = true,
  height = 500,
  onCrosshairMove,
}: CandlestickChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candlestickSeriesRef = useRef<ISeriesApi<any> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const volumeSeriesRef = useRef<ISeriesApi<any> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rsiSeriesRef = useRef<ISeriesApi<any> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overboughtLineRef = useRef<ISeriesApi<any> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oversoldLineRef = useRef<ISeriesApi<any> | null>(null);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(height || 500);
  const [chartReady, setChartReady] = useState(false);
  const [tooltipData, setTooltipData] = useState<{
    visible: boolean;
    x: number;
    y: number;
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    rsi: number | null;
    change: number;
    changePercent: number;
  } | null>(null);

  // Use containerHeight which may come from prop or measured from parent
  const effectiveHeight = height || containerHeight;
  const mainChartHeight = showRSI ? Math.floor(effectiveHeight * 0.7) : effectiveHeight;
  const rsiChartHeight = showRSI ? Math.floor(effectiveHeight * 0.3) : 0;

  // Measure container dimensions
  useEffect(() => {
    if (!wrapperRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height: measuredHeight } = entry.contentRect;
        if (width > 0) {
          setContainerWidth(width);
        }
        // Only use measured height if no height prop is provided
        if (!height && measuredHeight > 0) {
          setContainerHeight(measuredHeight);
        }
      }
    });

    resizeObserver.observe(wrapperRef.current);

    // Initial measurement
    const initialWidth = wrapperRef.current.clientWidth;
    const initialHeight = wrapperRef.current.clientHeight;
    if (initialWidth > 0) {
      setContainerWidth(initialWidth);
    }
    if (!height && initialHeight > 0) {
      setContainerHeight(initialHeight);
    }

    return () => resizeObserver.disconnect();
  }, [height]);

  // Create charts when container has width
  useEffect(() => {
    if (containerWidth === 0 || !chartContainerRef.current) return;
    if (chartRef.current) return; // Already created

    // Create main chart
    const chart = createChart(chartContainerRef.current, {
      width: containerWidth,
      height: mainChartHeight,
      layout: {
        background: { color: '#1a1a1a' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: '#2a2a2a' },
        horzLines: { color: '#2a2a2a' },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: '#6b7280',
          width: 1,
          style: 2,
        },
        horzLine: {
          color: '#6b7280',
          width: 1,
          style: 2,
        },
      },
      rightPriceScale: {
        borderColor: '#2a2a2a',
      },
      localization: {
        // Use local timezone for time display
        timeFormatter: (time: number) => {
          const date = new Date(time * 1000);
          return date.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
        },
      },
      timeScale: {
        borderColor: '#2a2a2a',
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: number) => {
          const date = new Date(time * 1000);
          const hours = date.getHours().toString().padStart(2, '0');
          const minutes = date.getMinutes().toString().padStart(2, '0');
          return `${hours}:${minutes}`;
        },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    chartRef.current = chart;

    // Add candlestick series
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    candlestickSeriesRef.current = candlestickSeries;

    // Create markers plugin for the candlestick series
    markersPluginRef.current = createSeriesMarkers(candlestickSeries, []);

    // Add volume series
    if (showVolume) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: '#6b7280',
        priceFormat: {
          type: 'volume',
        },
        priceScaleId: '',
      });

      volumeSeries.priceScale().applyOptions({
        scaleMargins: {
          top: 0.85,
          bottom: 0,
        },
      });

      volumeSeriesRef.current = volumeSeries;
    }

    // Handle crosshair move for tooltip
    chart.subscribeCrosshairMove((param) => {
      if (onCrosshairMove) {
        if (param.time && param.seriesData.size > 0) {
          const candleData = param.seriesData.get(candlestickSeries) as CandlestickData;
          onCrosshairMove(candleData?.close ?? null, param.time);
        } else {
          onCrosshairMove(null, null);
        }
      }

      // Update tooltip
      if (!param.time || param.seriesData.size === 0 || !param.point) {
        setTooltipData(null);
        return;
      }

      const candleData = param.seriesData.get(candlestickSeries) as CandlestickData;
      if (!candleData) {
        setTooltipData(null);
        return;
      }

      // Find volume for this candle
      const volumeData = volumeSeriesRef.current
        ? param.seriesData.get(volumeSeriesRef.current)
        : null;

      // Find RSI for this time
      const rsiTimestamp = param.time as number;
      const rsiPoint = rsiSeriesRef.current
        ? param.seriesData.get(rsiSeriesRef.current)
        : null;

      const change = candleData.close - candleData.open;
      const changePercent = ((candleData.close - candleData.open) / candleData.open) * 100;

      // Format time
      const date = new Date(rsiTimestamp * 1000);
      const timeStr = date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      setTooltipData({
        visible: true,
        x: param.point.x,
        y: param.point.y,
        time: timeStr,
        open: candleData.open,
        high: candleData.high,
        low: candleData.low,
        close: candleData.close,
        volume: (volumeData as { value?: number } | null)?.value || 0,
        rsi: (rsiPoint as { value?: number } | null)?.value || null,
        change,
        changePercent,
      });
    });

    // Create RSI chart if enabled
    if (showRSI && rsiContainerRef.current) {
      const rsiChart = createChart(rsiContainerRef.current, {
        width: containerWidth,
        height: rsiChartHeight,
        layout: {
          background: { color: '#1a1a1a' },
          textColor: '#9ca3af',
        },
        grid: {
          vertLines: { color: '#2a2a2a' },
          horzLines: { color: '#2a2a2a' },
        },
        rightPriceScale: {
          borderColor: '#2a2a2a',
        },
        timeScale: {
          borderColor: '#2a2a2a',
          visible: false,
        },
        crosshair: {
          mode: 1,
        },
      });

      rsiChartRef.current = rsiChart;

      const rsiSeries = rsiChart.addSeries(LineSeries, {
        color: '#3b82f6',
        lineWidth: 2,
        priceScaleId: 'right',
      });

      const overboughtLine = rsiChart.addSeries(LineSeries, {
        color: '#ef4444',
        lineWidth: 1,
        lineStyle: 2,
        priceScaleId: 'right',
      });

      const oversoldLine = rsiChart.addSeries(LineSeries, {
        color: '#22c55e',
        lineWidth: 1,
        lineStyle: 2,
        priceScaleId: 'right',
      });

      rsiSeriesRef.current = rsiSeries;
      overboughtLineRef.current = overboughtLine;
      oversoldLineRef.current = oversoldLine;

      rsiChart.priceScale('right').applyOptions({
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      });

      // Sync time scales bidirectionally using TIME (not logical index)
      // This is critical because RSI data starts at index 250, not 0
      let isSyncingFromMain = false;
      let isSyncingFromRsi = false;

      chart.timeScale().subscribeVisibleTimeRangeChange(() => {
        if (isSyncingFromRsi) return;
        isSyncingFromMain = true;
        try {
          const timeRange = chart.timeScale().getVisibleRange();
          if (timeRange) {
            rsiChart.timeScale().setVisibleRange(timeRange);
          }
        } catch {
          // RSI chart may not have data for this time range, ignore
        }
        isSyncingFromMain = false;
      });

      rsiChart.timeScale().subscribeVisibleTimeRangeChange(() => {
        if (isSyncingFromMain) return;
        isSyncingFromRsi = true;
        try {
          const timeRange = rsiChart.timeScale().getVisibleRange();
          if (timeRange) {
            chart.timeScale().setVisibleRange(timeRange);
          }
        } catch {
          // Ignore errors during sync
        }
        isSyncingFromRsi = false;
      });

      // Sync crosshairs between charts
      chart.subscribeCrosshairMove((param) => {
        if (param.time) {
          rsiChart.setCrosshairPosition(0, param.time, rsiSeries);
        } else {
          rsiChart.clearCrosshairPosition();
        }
      });

      rsiChart.subscribeCrosshairMove((param) => {
        if (param.time) {
          chart.setCrosshairPosition(0, param.time, candlestickSeries);
        } else {
          chart.clearCrosshairPosition();
        }
      });
    }

    // Mark chart as ready
    setChartReady(true);

    return () => {
      chart.remove();
      rsiChartRef.current?.remove();
      chartRef.current = null;
      rsiChartRef.current = null;
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;
      rsiSeriesRef.current = null;
      overboughtLineRef.current = null;
      oversoldLineRef.current = null;
      markersPluginRef.current = null;
      setChartReady(false);
    };
  }, [containerWidth, mainChartHeight, rsiChartHeight, showRSI, showVolume, onCrosshairMove]);

  // Update chart size when dimensions change
  useEffect(() => {
    if (containerWidth === 0) return;

    if (chartRef.current) {
      chartRef.current.applyOptions({
        width: containerWidth,
        height: mainChartHeight,
      });
    }
    if (rsiChartRef.current) {
      rsiChartRef.current.applyOptions({
        width: containerWidth,
        height: rsiChartHeight,
      });
    }
  }, [containerWidth, mainChartHeight, rsiChartHeight]);

  // Update data when candles change OR when chart becomes ready
  useEffect(() => {
    // Wait for both chart and data to be ready
    if (!chartReady || !candlestickSeriesRef.current || candles.length === 0) return;

    const candleData: CandlestickData[] = candles.map((candle) => ({
      time: candle.time as Time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));

    candlestickSeriesRef.current.setData(candleData);

    // Update volume
    if (volumeSeriesRef.current && showVolume) {
      const volumeData: HistogramData[] = candles.map((candle) => ({
        time: candle.time as Time,
        value: candle.volume || 0,
        color: candle.close >= candle.open ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)',
      }));

      volumeSeriesRef.current.setData(volumeData);
    }

    // Calculate RSI data (needed for both RSI chart and crossing markers)
    const rsiData = calculateRSIWithTimestamps(candles, rsiConfig.period);

    // Update RSI
    if (rsiSeriesRef.current && showRSI && rsiData.length > 0) {
      const rsiLineData: LineData[] = rsiData.map((point) => ({
        time: point.time as Time,
        value: point.value,
      }));

      rsiSeriesRef.current.setData(rsiLineData);

      if (overboughtLineRef.current) {
        overboughtLineRef.current.setData(
          rsiData.map((point) => ({
            time: point.time as Time,
            value: rsiConfig.overbought,
          }))
        );
      }

      if (oversoldLineRef.current) {
        oversoldLineRef.current.setData(
          rsiData.map((point) => ({
            time: point.time as Time,
            value: rsiConfig.oversold,
          }))
        );
      }
    }

    // Build markers array for the price chart
    const markers: SeriesMarker<Time>[] = [];

    // Add trade markers (buy/sell)
    if (showTradeMarkers && trades.length > 0) {
      const tradeMarkers = extractTradeMarkers(trades);

      for (const marker of tradeMarkers) {
        markers.push({
          time: marker.time as Time,
          position: marker.type === 'buy' ? 'belowBar' : 'aboveBar',
          color: marker.type === 'buy' ? '#22c55e' : '#ef4444',
          shape: marker.type === 'buy' ? 'arrowUp' : 'arrowDown',
          text: `${marker.type === 'buy' ? 'B' : 'S'} ${marker.shares}@${marker.price.toFixed(2)}`,
        });
      }
    }

    // Add RSI crossing markers
    if (showRSICrossings && rsiData.length > 0) {
      const crossings = detectRSICrossings(rsiData, rsiConfig, showOversoldCrossings, showOverboughtCrossings);

      // Create a map of candle times for fast lookup
      const candleTimeSet = new Set(candles.map(c => c.time));

      for (const crossing of crossings) {
        // Verify this time exists in candle data (should always be true since RSI is derived from candles)
        if (candleTimeSet.has(crossing.time)) {
          markers.push({
            time: crossing.time as Time,
            position: crossing.type === 'oversold' ? 'belowBar' : 'aboveBar',
            color: crossing.type === 'oversold' ? '#22c55e' : '#ef4444',
            shape: 'circle',
            text: `RSI ${crossing.rsiValue.toFixed(1)}`,
          });
        }
      }
    }

    // Sort markers by time and apply using markers plugin
    if (markersPluginRef.current) {
      if (markers.length > 0) {
        markers.sort((a, b) => (a.time as number) - (b.time as number));
        markersPluginRef.current.setMarkers(markers);
      } else {
        markersPluginRef.current.setMarkers([]);
      }
    }

    // Only fit content on initial load, not on every update
    // This prevents the chart from resetting position when user has panned
  }, [candles, rsiConfig, showRSI, showVolume, showTradeMarkers, showRSICrossings, showOversoldCrossings, showOverboughtCrossings, trades, chartReady]);

  // Fit content and sync both charts when ready with data
  useEffect(() => {
    if (chartReady && candles.length > 0 && chartRef.current) {
      // Fit main chart content
      chartRef.current.timeScale().fitContent();

      // Sync RSI chart to main chart's visible TIME range (not logical)
      if (rsiChartRef.current) {
        try {
          const timeRange = chartRef.current.timeScale().getVisibleRange();
          if (timeRange) {
            rsiChartRef.current.timeScale().setVisibleRange(timeRange);
          }
        } catch {
          // RSI chart may not have data yet
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartReady]); // Only run when chartReady changes, not on every candle update

  // Also sync after data updates
  useEffect(() => {
    if (chartReady && chartRef.current && rsiChartRef.current && candles.length > 0) {
      // Small delay to ensure data is rendered
      const timer = setTimeout(() => {
        try {
          const timeRange = chartRef.current?.timeScale().getVisibleRange();
          if (timeRange && rsiChartRef.current) {
            rsiChartRef.current.timeScale().setVisibleRange(timeRange);
          }
        } catch {
          // RSI chart may not have data for this range
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [candles, chartReady]);

  return (
    <div ref={wrapperRef} className="w-full h-full relative">
      <div
        ref={chartContainerRef}
        className="w-full"
        style={{ height: mainChartHeight }}
      />
      {showRSI && (
        <div className="mt-1">
          <div className="text-xs text-gray-500 px-2">RSI ({rsiConfig.period})</div>
          <div
            ref={rsiContainerRef}
            className="w-full"
            style={{ height: rsiChartHeight }}
          />
        </div>
      )}

      {/* Tooltip */}
      {tooltipData && tooltipData.visible && (
        <div
          ref={tooltipRef}
          className="absolute pointer-events-none z-50 bg-dark-card border border-dark-border rounded-lg shadow-xl p-3 text-sm"
          style={{
            left: Math.min(tooltipData.x + 15, containerWidth - 200),
            top: Math.max(tooltipData.y - 100, 10),
          }}
        >
          <div className="text-gray-400 text-xs mb-2">{tooltipData.time}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-gray-500">Open:</span>
            <span className="text-white font-mono">${tooltipData.open.toFixed(2)}</span>
            <span className="text-gray-500">High:</span>
            <span className="text-white font-mono">${tooltipData.high.toFixed(2)}</span>
            <span className="text-gray-500">Low:</span>
            <span className="text-white font-mono">${tooltipData.low.toFixed(2)}</span>
            <span className="text-gray-500">Close:</span>
            <span className="text-white font-mono">${tooltipData.close.toFixed(2)}</span>
            <span className="text-gray-500">Change:</span>
            <span className={`font-mono ${tooltipData.change >= 0 ? 'text-profit' : 'text-loss'}`}>
              {tooltipData.change >= 0 ? '+' : ''}{tooltipData.change.toFixed(2)} ({tooltipData.changePercent >= 0 ? '+' : ''}{tooltipData.changePercent.toFixed(2)}%)
            </span>
            {tooltipData.volume > 0 && (
              <>
                <span className="text-gray-500">Volume:</span>
                <span className="text-white font-mono">{formatVolume(tooltipData.volume)}</span>
              </>
            )}
            {tooltipData.rsi !== null && (
              <>
                <span className="text-gray-500">RSI:</span>
                <span className={`font-mono ${getRSIColor(tooltipData.rsi, rsiConfig)}`}>
                  {tooltipData.rsi.toFixed(2)}
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
