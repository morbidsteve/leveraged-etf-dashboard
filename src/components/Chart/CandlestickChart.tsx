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
} from 'lightweight-charts';
import { Candle, RSIConfig } from '@/types';
import { calculateRSIWithTimestamps, DEFAULT_RSI_CONFIG } from '@/lib/rsi';

interface CandlestickChartProps {
  candles: Candle[];
  rsiConfig?: RSIConfig;
  showRSI?: boolean;
  showVolume?: boolean;
  height?: number;
  onCrosshairMove?: (price: number | null, time: Time | null) => void;
}

export default function CandlestickChart({
  candles,
  rsiConfig = DEFAULT_RSI_CONFIG,
  showRSI = true,
  showVolume = true,
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
  const [containerWidth, setContainerWidth] = useState(0);
  const [chartReady, setChartReady] = useState(false);

  const mainChartHeight = showRSI ? Math.floor(height * 0.7) : height;
  const rsiChartHeight = showRSI ? Math.floor(height * 0.3) : 0;

  // Measure container width
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width > 0) {
          setContainerWidth(width);
        }
      }
    });

    resizeObserver.observe(chartContainerRef.current);

    // Initial measurement
    const initialWidth = chartContainerRef.current.clientWidth;
    if (initialWidth > 0) {
      setContainerWidth(initialWidth);
    }

    return () => resizeObserver.disconnect();
  }, []);

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
      timeScale: {
        borderColor: '#2a2a2a',
        timeVisible: true,
        secondsVisible: false,
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

    // Handle crosshair move
    chart.subscribeCrosshairMove((param) => {
      if (onCrosshairMove) {
        if (param.time && param.seriesData.size > 0) {
          const candleData = param.seriesData.get(candlestickSeries) as CandlestickData;
          onCrosshairMove(candleData?.close ?? null, param.time);
        } else {
          onCrosshairMove(null, null);
        }
      }
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

      // Sync time scales
      chart.timeScale().subscribeVisibleTimeRangeChange(() => {
        const logicalRange = chart.timeScale().getVisibleLogicalRange();
        if (logicalRange) {
          rsiChart.timeScale().setVisibleLogicalRange(logicalRange);
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
      setChartReady(false);
    };
  }, [containerWidth, mainChartHeight, rsiChartHeight, showRSI, showVolume, onCrosshairMove]);

  // Update chart size when containerWidth changes
  useEffect(() => {
    if (containerWidth === 0) return;

    if (chartRef.current) {
      chartRef.current.applyOptions({ width: containerWidth });
    }
    if (rsiChartRef.current) {
      rsiChartRef.current.applyOptions({ width: containerWidth });
    }
  }, [containerWidth]);

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

    // Update RSI
    if (rsiSeriesRef.current && showRSI) {
      const rsiData = calculateRSIWithTimestamps(candles, rsiConfig.period);

      if (rsiData.length > 0) {
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
    }

    // Fit content
    chartRef.current?.timeScale().fitContent();
  }, [candles, rsiConfig, showRSI, showVolume, chartReady]); // chartReady triggers re-run when chart is created

  return (
    <div className="w-full">
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
    </div>
  );
}
