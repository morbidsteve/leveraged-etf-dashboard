import { describe, it, expect } from 'vitest';
import { getMarketSession, getPollIntervalMs, describeSession } from './marketHours';

/**
 * Convert a desired ET wall-clock to a UTC Date by adjusting for ET offset.
 * Tests assume EDT (UTC-4) for May 2026 — DST is active.
 * Note: actual offset depends on DST; in May the US east coast is EDT (UTC-4).
 */
function etDate(yyyy: number, mm: number, dd: number, hh: number, min: number = 0): Date {
  // Represent ET as UTC + 4 (EDT) — 14:00 ET = 18:00 UTC
  return new Date(Date.UTC(yyyy, mm - 1, dd, hh + 4, min));
}

describe('getMarketSession', () => {
  it('returns "open" during regular hours on a weekday', () => {
    expect(getMarketSession(etDate(2026, 5, 7, 14, 0))).toBe('open'); // Thu
  });

  it('returns "pre" during pre-market hours on a weekday', () => {
    expect(getMarketSession(etDate(2026, 5, 7, 6, 0))).toBe('pre');
  });

  it('returns "post" during after-hours', () => {
    expect(getMarketSession(etDate(2026, 5, 7, 18, 0))).toBe('post');
  });

  it('returns "closed" deep in the night', () => {
    expect(getMarketSession(etDate(2026, 5, 7, 2, 0))).toBe('closed');
  });

  it('returns "closed" on weekends', () => {
    // 2026-05-09 = Sat
    expect(getMarketSession(etDate(2026, 5, 9, 12, 0))).toBe('closed');
    // 2026-05-10 = Sun
    expect(getMarketSession(etDate(2026, 5, 10, 12, 0))).toBe('closed');
  });
});

describe('getPollIntervalMs', () => {
  it('returns shorter intervals when market is open', () => {
    const open = getPollIntervalMs(etDate(2026, 5, 7, 14, 0));
    const closed = getPollIntervalMs(etDate(2026, 5, 7, 2, 0));
    expect(open).toBeLessThan(closed);
  });
});

describe('describeSession', () => {
  it('returns human labels', () => {
    expect(describeSession('open')).toBe('Live');
    expect(describeSession('closed')).toBe('Closed');
  });
});
