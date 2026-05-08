/**
 * Execution algorithms — TWAP / VWAP / Iceberg. Pure helpers that
 * compute slice schedules; actual order placement is the broker
 * adapter's job.
 *
 * Use case: user wants to buy 1000 shares of TQQQ but doesn't want
 * to move the market. They configure the algo with a duration and
 * we slice it into N child orders to be placed over time.
 */

export type AlgoKind = 'TWAP' | 'VWAP' | 'ICEBERG';

export interface AlgoSlice {
  index: number;
  scheduledAt: Date;
  shares: number;
  /** Limit price hint — undefined means use the broker's marketable
   * default at fill time. */
  limitPriceHint?: number;
}

export interface AlgoSchedule {
  kind: AlgoKind;
  totalShares: number;
  startAt: Date;
  endAt: Date;
  slices: AlgoSlice[];
  /** Estimated participation rate (% of typical 1m volume per slice).
   * Caller should sanity-check this is below 10% to avoid market impact. */
  estParticipation: number | null;
}

/**
 * TWAP — Time-Weighted Average Price. Slice evenly across the duration.
 */
export function buildTwapSchedule(opts: {
  totalShares: number;
  startAt: Date;
  endAt: Date;
  slicesCount: number;
}): AlgoSchedule {
  const { totalShares, startAt, endAt, slicesCount } = opts;
  const totalDurationMs = endAt.getTime() - startAt.getTime();
  const sliceMs = totalDurationMs / slicesCount;
  const sharesPerSlice = Math.floor(totalShares / slicesCount);
  const remainder = totalShares - sharesPerSlice * slicesCount;
  const slices: AlgoSlice[] = [];
  for (let i = 0; i < slicesCount; i++) {
    slices.push({
      index: i,
      scheduledAt: new Date(startAt.getTime() + i * sliceMs),
      // Pour the rounding remainder into the first slice
      shares: sharesPerSlice + (i === 0 ? remainder : 0),
    });
  }
  return {
    kind: 'TWAP',
    totalShares,
    startAt,
    endAt,
    slices,
    estParticipation: null,
  };
}

/**
 * VWAP — Volume-Weighted Average Price. Slice in proportion to the
 * historical intraday volume profile. Caller passes the per-minute
 * volume profile (e.g. "average % of day's volume per minute" over
 * the last 20 sessions).
 */
export function buildVwapSchedule(opts: {
  totalShares: number;
  startAt: Date;
  endAt: Date;
  /** Volume weight per slice — array of N weights that sum to 1.0
   * (or anywhere; we normalize). One entry per minute (or however
   * the caller wants to discretize). */
  volumeProfile: number[];
}): AlgoSchedule {
  const { totalShares, startAt, endAt, volumeProfile } = opts;
  if (volumeProfile.length === 0) {
    return buildTwapSchedule({ totalShares, startAt, endAt, slicesCount: 10 });
  }
  const total = volumeProfile.reduce((s, x) => s + x, 0) || 1;
  const totalDurationMs = endAt.getTime() - startAt.getTime();
  const sliceMs = totalDurationMs / volumeProfile.length;
  const slices: AlgoSlice[] = [];
  let remaining = totalShares;
  for (let i = 0; i < volumeProfile.length; i++) {
    const pct = volumeProfile[i] / total;
    const isLast = i === volumeProfile.length - 1;
    const shares = isLast ? remaining : Math.floor(totalShares * pct);
    if (shares > 0) {
      slices.push({
        index: i,
        scheduledAt: new Date(startAt.getTime() + i * sliceMs),
        shares,
      });
      remaining -= shares;
    }
  }
  return {
    kind: 'VWAP',
    totalShares,
    startAt,
    endAt,
    slices,
    estParticipation: null,
  };
}

/**
 * Iceberg — only show a fraction of the order at any given time.
 * Total stays the same as TWAP but slice size is consistent + small.
 */
export function buildIcebergSchedule(opts: {
  totalShares: number;
  startAt: Date;
  endAt: Date;
  visibleShares: number;
  /** Min seconds between slices (rate limit). */
  minIntervalSec: number;
}): AlgoSchedule {
  const { totalShares, startAt, endAt, visibleShares, minIntervalSec } = opts;
  const slicesCount = Math.ceil(totalShares / visibleShares);
  const totalDurationSec = (endAt.getTime() - startAt.getTime()) / 1000;
  const intervalSec = Math.max(minIntervalSec, totalDurationSec / slicesCount);
  const slices: AlgoSlice[] = [];
  let remaining = totalShares;
  for (let i = 0; i < slicesCount; i++) {
    const shares = Math.min(visibleShares, remaining);
    if (shares <= 0) break;
    slices.push({
      index: i,
      scheduledAt: new Date(startAt.getTime() + i * intervalSec * 1000),
      shares,
    });
    remaining -= shares;
  }
  return {
    kind: 'ICEBERG',
    totalShares,
    startAt,
    endAt,
    slices,
    estParticipation: null,
  };
}

/**
 * Estimate participation rate across slices. Useful for risk-checking
 * whether the algo will move the market.
 *
 * `avgVolumePerMinute` is the typical 1m volume; we divide each slice's
 * size by the slice's duration in minutes × that volume.
 */
export function estimateParticipation(
  schedule: AlgoSchedule,
  avgVolumePerMinute: number
): number {
  if (avgVolumePerMinute <= 0 || schedule.slices.length === 0) return 0;
  const totalMs = schedule.endAt.getTime() - schedule.startAt.getTime();
  const sliceMin = totalMs / 60_000 / schedule.slices.length;
  const avgSliceShares = schedule.totalShares / schedule.slices.length;
  return (avgSliceShares / (avgVolumePerMinute * sliceMin)) * 100;
}
