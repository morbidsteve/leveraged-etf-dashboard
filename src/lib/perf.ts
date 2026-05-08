/**
 * Lightweight performance profiler. Maintains a per-name rolling
 * average of recent durations and exposes them via a global hook so
 * a debug overlay (or the browser devtools console) can read them.
 *
 * Usage:
 *   const t = perfStart('chart.render');
 *   // ... do work ...
 *   t.end();
 *
 * Or:
 *   measureSync('chart.render', () => { ... });
 *
 * Sampling: only records every Nth call (default 1) to keep overhead
 * negligible for hot paths.
 */

interface Sample {
  /** Most recent N durations in ms. */
  recent: number[];
  /** Lifetime total calls observed. */
  count: number;
  /** Last duration. */
  last: number;
}

const KEEP = 30;
const samples = new Map<string, Sample>();

export function perfRecord(name: string, ms: number): void {
  const s = samples.get(name) ?? { recent: [], count: 0, last: 0 };
  s.recent.push(ms);
  if (s.recent.length > KEEP) s.recent.shift();
  s.count += 1;
  s.last = ms;
  samples.set(name, s);

  // Expose to window for ad-hoc debugging
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__perf = samples;
  }
}

export function perfStart(name: string): { end: () => number } {
  const start = performance.now();
  return {
    end: () => {
      const ms = performance.now() - start;
      perfRecord(name, ms);
      return ms;
    },
  };
}

export function measureSync<T>(name: string, fn: () => T): T {
  const t = perfStart(name);
  try {
    return fn();
  } finally {
    t.end();
  }
}

export function perfStats(name: string): {
  count: number;
  last: number;
  p50: number;
  p95: number;
  mean: number;
} | null {
  const s = samples.get(name);
  if (!s || s.recent.length === 0) return null;
  const sorted = [...s.recent].sort((a, b) => a - b);
  const p = (q: number) => sorted[Math.floor(q * (sorted.length - 1))];
  const mean = sorted.reduce((acc, v) => acc + v, 0) / sorted.length;
  return {
    count: s.count,
    last: s.last,
    p50: p(0.5),
    p95: p(0.95),
    mean,
  };
}

export function perfAll(): Record<
  string,
  { count: number; last: number; p50: number; p95: number; mean: number }
> {
  const out: Record<string, ReturnType<typeof perfStats>> = {};
  samples.forEach((_, name) => {
    out[name] = perfStats(name)!;
  });
  return out as Record<
    string,
    { count: number; last: number; p50: number; p95: number; mean: number }
  >;
}
