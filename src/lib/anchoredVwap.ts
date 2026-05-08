/**
 * Anchored VWAP — running volume-weighted average price from a chosen
 * anchor bar forward. Differs from a session-VWAP in that the anchor
 * is user-chosen (e.g. earnings day, FOMC bar, swing low) so the
 * resulting line tracks "average price paid since that event."
 *
 * Pure: no I/O. Returns one VWAP value per candle from anchorTime
 * forward; bars before the anchor are not included.
 */

import { Candle } from '@/types';

export interface VwapPoint {
  time: number;
  value: number;
}

export function anchoredVwap(candles: Candle[], anchorTime: number): VwapPoint[] {
  const out: VwapPoint[] = [];
  let cumPV = 0;
  let cumV = 0;
  for (const c of candles) {
    if (c.time < anchorTime) continue;
    const typical = (c.high + c.low + c.close) / 3;
    const vol = c.volume ?? 0;
    cumPV += typical * vol;
    cumV += vol;
    if (cumV > 0) {
      out.push({ time: c.time, value: cumPV / cumV });
    }
  }
  return out;
}

/**
 * Volume profile — bucket trade volume by price level. Returns price→
 * total-volume pairs sorted by price (ascending). Optional bucket
 * count controls resolution.
 *
 * For each candle, volume is distributed evenly across the OHLC range
 * (a simple approximation; intraday tick data would be better but we
 * don't have it in the polled feed).
 */
export interface VolumeBucket {
  priceLow: number;
  priceHigh: number;
  volume: number;
}

export function volumeProfile(
  candles: Candle[],
  buckets = 30
): { bins: VolumeBucket[]; pointOfControl: VolumeBucket | null; valueAreaLow: number; valueAreaHigh: number } {
  if (candles.length === 0) {
    return { bins: [], pointOfControl: null, valueAreaLow: 0, valueAreaHigh: 0 };
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of candles) {
    if (c.low < lo) lo = c.low;
    if (c.high > hi) hi = c.high;
  }
  if (!isFinite(lo) || !isFinite(hi) || hi <= lo) {
    return { bins: [], pointOfControl: null, valueAreaLow: lo, valueAreaHigh: hi };
  }
  const bucketSize = (hi - lo) / buckets;
  const bins: VolumeBucket[] = Array.from({ length: buckets }, (_, i) => ({
    priceLow: lo + i * bucketSize,
    priceHigh: lo + (i + 1) * bucketSize,
    volume: 0,
  }));
  for (const c of candles) {
    const v = c.volume ?? 0;
    if (v <= 0 || c.high <= c.low) continue;
    const startBin = Math.max(0, Math.floor((c.low - lo) / bucketSize));
    const endBin = Math.min(buckets - 1, Math.floor((c.high - lo) / bucketSize));
    const span = Math.max(1, endBin - startBin + 1);
    const per = v / span;
    for (let b = startBin; b <= endBin; b++) bins[b].volume += per;
  }
  // Point of control: bucket with max volume
  let pocIdx = 0;
  for (let i = 1; i < bins.length; i++) {
    if (bins[i].volume > bins[pocIdx].volume) pocIdx = i;
  }
  const pointOfControl = bins[pocIdx];

  // Value area: smallest price range containing 70% of total volume,
  // expanding outward from the POC.
  const total = bins.reduce((s, b) => s + b.volume, 0);
  let lo2 = pocIdx;
  let hi2 = pocIdx;
  let cumVol = bins[pocIdx].volume;
  while (cumVol < total * 0.7 && (lo2 > 0 || hi2 < bins.length - 1)) {
    const upVol = hi2 < bins.length - 1 ? bins[hi2 + 1].volume : -1;
    const downVol = lo2 > 0 ? bins[lo2 - 1].volume : -1;
    if (upVol >= downVol && upVol >= 0) {
      hi2 += 1;
      cumVol += bins[hi2].volume;
    } else if (downVol >= 0) {
      lo2 -= 1;
      cumVol += bins[lo2].volume;
    } else break;
  }
  return {
    bins,
    pointOfControl,
    valueAreaLow: bins[lo2].priceLow,
    valueAreaHigh: bins[hi2].priceHigh,
  };
}
