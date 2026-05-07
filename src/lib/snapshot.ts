import { Candle, RSIConfig } from '@/types';
import { calculateRSIWithTimestamps } from '@/lib/rsi';
import { TradeSnapshot } from '@/store/paperStore';

const DEFAULT_WINDOW = 60; // bars before the marker

/**
 * Capture a compact, stored-as-data snapshot of the chart context at a
 * given moment. Used to attach an at-a-glance "what was I looking at when
 * this fired?" thumbnail to every paper trade.
 *
 * Pure function — feed in candles + config, get a snapshot back. The
 * snapshot is small (~120 numbers), persisted in localStorage, rendered
 * as inline SVG (no canvas / image bytes).
 */
export function captureSnapshot(opts: {
  ticker: string;
  candles: Candle[];
  rsiConfig: RSIConfig;
  markerTime: number;     // unix seconds — the candle this snapshot is anchored to
  windowBars?: number;
}): TradeSnapshot {
  const { ticker, candles, rsiConfig, markerTime } = opts;
  const window = opts.windowBars ?? DEFAULT_WINDOW;

  // Find the candle index closest to markerTime (within the available data)
  let markerIdx = -1;
  for (let i = candles.length - 1; i >= 0; i--) {
    if (candles[i].time <= markerTime) {
      markerIdx = i;
      break;
    }
  }
  if (markerIdx === -1) markerIdx = candles.length - 1;

  const start = Math.max(0, markerIdx - window + 1);
  const end = Math.min(candles.length, markerIdx + 5);
  const slice = candles.slice(start, end);

  const closes = slice.map((c) => ({ time: c.time, close: c.close }));

  // Compute RSI series for the slice. Need at least period+1 bars for the
  // first RSI value, but we still want to show what we have.
  let rsi: { time: number; value: number }[] = [];
  if (slice.length >= rsiConfig.period + 1) {
    rsi = calculateRSIWithTimestamps(slice, rsiConfig.period);
  } else if (candles.length >= rsiConfig.period + 1) {
    // Compute on the full candle series and slice down
    const full = calculateRSIWithTimestamps(candles, rsiConfig.period);
    rsi = full.filter(
      (p) => p.time >= (slice[0]?.time ?? 0) && p.time <= (slice[slice.length - 1]?.time ?? 0)
    );
  }

  return {
    ticker,
    capturedAt: new Date(),
    closes,
    rsi,
    markerTime: candles[markerIdx]?.time ?? markerTime,
    oversold: rsiConfig.oversold,
    overbought: rsiConfig.overbought,
  };
}
