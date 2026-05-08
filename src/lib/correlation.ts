/**
 * Pairwise return correlation + portfolio concentration helpers.
 *
 * For a leveraged-ETF day trader, the biggest hidden risk isn't any
 * single position — it's silent correlation. SOXL + TQQQ + UPRO looks
 * like 3 names but acts like one big tech-beta-3 bet, and a sector
 * rotation drops them all together.
 *
 * Pure: pass in candle history, get numbers back. No I/O.
 */

import { Candle } from '@/types';

/** Pearson correlation of two equal-length number arrays. */
export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  let sa = 0,
    sb = 0;
  for (let i = 0; i < n; i++) {
    sa += a[i];
    sb += b[i];
  }
  const ma = sa / n;
  const mb = sb / n;
  let num = 0,
    da = 0,
    db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  if (den === 0) return 0;
  return num / den;
}

/** Compute log-returns from a candle series. */
export function logReturns(candles: Candle[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const a = candles[i - 1].close;
    const b = candles[i].close;
    if (a > 0 && b > 0) out.push(Math.log(b / a));
  }
  return out;
}

export interface CorrPair {
  a: string;
  b: string;
  corr: number;
}

/**
 * Build a NxN correlation matrix for a set of tickers given their
 * candle histories. Tickers with too little history are dropped.
 */
export function correlationMatrix(
  candlesByTicker: Record<string, Candle[]>,
  minBars = 30
): { tickers: string[]; matrix: number[][]; pairs: CorrPair[] } {
  const tickers = Object.keys(candlesByTicker).filter(
    (t) => (candlesByTicker[t]?.length ?? 0) >= minBars
  );
  const N = tickers.length;
  const returnsByTicker: Record<string, number[]> = {};
  for (const t of tickers) returnsByTicker[t] = logReturns(candlesByTicker[t]);

  // Align return series by tail length — take the last L bars where L
  // is the minimum across all tickers. This handles tickers with
  // different available history without requiring time-axis alignment.
  let minLen = Infinity;
  for (const t of tickers) minLen = Math.min(minLen, returnsByTicker[t].length);
  if (!isFinite(minLen)) minLen = 0;
  const aligned: Record<string, number[]> = {};
  for (const t of tickers) aligned[t] = returnsByTicker[t].slice(-minLen);

  const matrix: number[][] = Array.from({ length: N }, () => new Array(N).fill(1));
  const pairs: CorrPair[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const c = pearson(aligned[tickers[i]], aligned[tickers[j]]);
      matrix[i][j] = c;
      matrix[j][i] = c;
      pairs.push({ a: tickers[i], b: tickers[j], corr: c });
    }
  }
  pairs.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));
  return { tickers, matrix, pairs };
}

export interface ConcentrationResult {
  /** Herfindahl index, 0–1. Higher = more concentrated. */
  hhi: number;
  /** Effective N — reciprocal of HHI; "this many independent names". */
  effectiveN: number;
  /** Largest single position as fraction of portfolio dollar exposure. */
  largestShare: number;
  /** Most-correlated pair within the portfolio (|corr|). */
  topCorr: CorrPair | null;
  /** Average pairwise |corr| weighted by joint position size. */
  avgCorr: number;
  /** Plain-English risk label. */
  riskLabel: 'low' | 'moderate' | 'high' | 'extreme';
  riskNote: string;
}

/**
 * Compute portfolio concentration for a position list. Uses dollar
 * exposure (shares × current price) as the weight, then folds in
 * pairwise correlation to penalize "look like 3 names but act like 1".
 */
export function computeConcentration(
  positions: Array<{ ticker: string; dollar: number }>,
  pairs: CorrPair[]
): ConcentrationResult {
  const total = positions.reduce((s, p) => s + Math.max(0, p.dollar), 0);
  if (total <= 0 || positions.length === 0) {
    return {
      hhi: 0,
      effectiveN: 0,
      largestShare: 0,
      topCorr: null,
      avgCorr: 0,
      riskLabel: 'low',
      riskNote: 'No open positions.',
    };
  }
  const weights = new Map<string, number>();
  for (const p of positions) {
    weights.set(p.ticker, (weights.get(p.ticker) ?? 0) + Math.max(0, p.dollar) / total);
  }
  let hhi = 0;
  let largestShare = 0;
  weights.forEach((w) => {
    hhi += w * w;
    if (w > largestShare) largestShare = w;
  });
  const effectiveN = hhi > 0 ? 1 / hhi : 0;

  // Average correlation weighted by joint weight in portfolio
  let weightedCorrSum = 0;
  let weightedDenom = 0;
  let topCorr: CorrPair | null = null;
  for (const pair of pairs) {
    const wa = weights.get(pair.a) ?? 0;
    const wb = weights.get(pair.b) ?? 0;
    if (wa <= 0 || wb <= 0) continue;
    const joint = wa * wb;
    weightedCorrSum += joint * Math.abs(pair.corr);
    weightedDenom += joint;
    if (!topCorr || Math.abs(pair.corr) > Math.abs(topCorr.corr)) {
      topCorr = pair;
    }
  }
  const avgCorr = weightedDenom > 0 ? weightedCorrSum / weightedDenom : 0;

  // Composite risk: penalize HHI and avg correlation together. A
  // single 100% position scores 1.0; two perfectly-uncorrelated 50/50
  // positions score 0.5 + 0 corr = ~0.25.
  const composite = hhi * 0.6 + avgCorr * 0.4;
  let riskLabel: ConcentrationResult['riskLabel'];
  let riskNote: string;
  if (composite < 0.3) {
    riskLabel = 'low';
    riskNote = 'Diversified across uncorrelated names.';
  } else if (composite < 0.5) {
    riskLabel = 'moderate';
    riskNote = 'Some concentration; watch the largest position.';
  } else if (composite < 0.75) {
    riskLabel = 'high';
    riskNote = 'High effective concentration — a single sector move hits everything.';
  } else {
    riskLabel = 'extreme';
    riskNote = 'Effectively one bet. A bad day on the underlying is unmitigated.';
  }

  return {
    hhi,
    effectiveN,
    largestShare,
    topCorr,
    avgCorr,
    riskLabel,
    riskNote,
  };
}
