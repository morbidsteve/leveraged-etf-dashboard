// Augmented marketHours tests covering the schwabOrderSession mapping
// added in the extended-hours sweep. Co-located in the same package
// as the existing marketHours.test.ts so vitest picks it up.
import { describe, it, expect } from 'vitest';
import { schwabOrderSession } from './marketHours';

describe('schwabOrderSession', () => {
  it('maps regular hours to NORMAL', () => {
    expect(schwabOrderSession('open')).toBe('NORMAL');
  });
  it('maps pre-market to AM', () => {
    expect(schwabOrderSession('pre')).toBe('AM');
  });
  it('maps after-hours to PM', () => {
    expect(schwabOrderSession('post')).toBe('PM');
  });
  it('returns null when markets are closed', () => {
    expect(schwabOrderSession('closed')).toBeNull();
  });
});
