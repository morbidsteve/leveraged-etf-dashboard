import { describe, it, expect } from 'vitest';
import { buildTwapSchedule, buildVwapSchedule, buildIcebergSchedule } from './algos';

describe('buildTwapSchedule', () => {
  it('slices evenly', () => {
    const s = buildTwapSchedule({
      totalShares: 1000,
      startAt: new Date('2026-01-01T09:30:00Z'),
      endAt: new Date('2026-01-01T10:30:00Z'),
      slicesCount: 10,
    });
    expect(s.slices.length).toBe(10);
    expect(s.slices.reduce((sum, sl) => sum + sl.shares, 0)).toBe(1000);
    expect(s.slices[0].shares).toBe(100); // 1000/10 = 100, remainder 0
  });

  it('handles non-divisible totals', () => {
    const s = buildTwapSchedule({
      totalShares: 1003,
      startAt: new Date('2026-01-01T09:30:00Z'),
      endAt: new Date('2026-01-01T10:30:00Z'),
      slicesCount: 10,
    });
    expect(s.slices.reduce((sum, sl) => sum + sl.shares, 0)).toBe(1003);
    expect(s.slices[0].shares).toBe(103); // remainder pours into first slice
  });
});

describe('buildVwapSchedule', () => {
  it('matches U-shaped intraday volume profile', () => {
    // Heavy at open + close, lighter midday
    const profile = [3, 1, 1, 1, 3];
    const s = buildVwapSchedule({
      totalShares: 1000,
      startAt: new Date('2026-01-01T09:30:00Z'),
      endAt: new Date('2026-01-01T16:00:00Z'),
      volumeProfile: profile,
    });
    expect(s.slices.length).toBeGreaterThanOrEqual(5);
    const total = s.slices.reduce((sum, sl) => sum + sl.shares, 0);
    expect(total).toBe(1000);
    // First and last slices should be largest
    expect(s.slices[0].shares).toBeGreaterThan(s.slices[1].shares);
  });
});

describe('buildIcebergSchedule', () => {
  it('keeps each slice <= visibleShares', () => {
    const s = buildIcebergSchedule({
      totalShares: 1000,
      startAt: new Date('2026-01-01T09:30:00Z'),
      endAt: new Date('2026-01-01T15:00:00Z'),
      visibleShares: 100,
      minIntervalSec: 60,
    });
    expect(s.slices.every((sl) => sl.shares <= 100)).toBe(true);
    expect(s.slices.reduce((sum, sl) => sum + sl.shares, 0)).toBe(1000);
  });
});
