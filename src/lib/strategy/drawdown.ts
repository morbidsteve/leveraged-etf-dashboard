/**
 * Drawdown statistics + Monte Carlo bootstrap of equity curves.
 *
 * Pure: pass in a list of trade returns, get numbers back.
 *
 * Monte Carlo approach: bootstrap-resample the realized return series
 * with replacement, run M simulations, return the P10 / P50 / P90
 * cumulative-equity envelopes. This is honest about future
 * performance variance: a strategy with mean +$50 / trade and
 * std $200 will look very different at the 10th vs 90th percentile
 * even if the mean is unchanged.
 */

export interface DrawdownStats {
  maxDrawdown: number;          // dollars
  maxDrawdownPct: number;       // percent of peak equity
  ulcerIndex: number;           // RMS of pct drawdowns; 0 = no DD
  longestDrawdownTrades: number; // trades from peak to recovery
  recovered: boolean;           // did the curve hit a new high after the worst DD?
}

export function drawdownStats(returns: number[], startingEquity = 0): DrawdownStats {
  if (returns.length === 0) {
    return {
      maxDrawdown: 0,
      maxDrawdownPct: 0,
      ulcerIndex: 0,
      longestDrawdownTrades: 0,
      recovered: false,
    };
  }
  let equity = startingEquity;
  let peak = startingEquity;
  let maxDD = 0;
  let maxDDPct = 0;
  let curDDStart = -1;
  let longestDD = 0;
  const ddPcts: number[] = [];
  let recovered = true;
  let inDD = false;

  for (let i = 0; i < returns.length; i++) {
    equity += returns[i];
    if (equity > peak) {
      if (inDD) {
        // Recovered from this drawdown
        const len = i - curDDStart;
        if (len > longestDD) longestDD = len;
        inDD = false;
      }
      peak = equity;
      curDDStart = i;
      ddPcts.push(0);
      continue;
    }
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
    if (peak > 0) {
      const ddPct = (dd / peak) * 100;
      if (ddPct > maxDDPct) maxDDPct = ddPct;
      ddPcts.push(ddPct);
    } else {
      ddPcts.push(0);
    }
    if (!inDD) {
      inDD = true;
      curDDStart = i - 1;
    }
  }
  if (inDD) {
    recovered = false;
    const len = returns.length - 1 - curDDStart;
    if (len > longestDD) longestDD = len;
  }
  const ulcer = Math.sqrt(
    ddPcts.reduce((s, x) => s + x * x, 0) / Math.max(1, ddPcts.length)
  );
  return {
    maxDrawdown: maxDD,
    maxDrawdownPct: maxDDPct,
    ulcerIndex: ulcer,
    longestDrawdownTrades: longestDD,
    recovered,
  };
}

export interface MonteCarloResult {
  /** P10/P50/P90 final equity values across simulations. */
  finalP10: number;
  finalP50: number;
  finalP90: number;
  /** Probability of any negative final equity (ruin-ish proxy). */
  probNegative: number;
  /** Probability of >= 20% drawdown at some point. */
  probLargeDD: number;
  /** Per-step P10/P50/P90 envelope for plotting. */
  envelope: Array<{ step: number; p10: number; p50: number; p90: number }>;
  simulations: number;
}

export function monteCarloBootstrap(
  returns: number[],
  opts: { simulations?: number; horizon?: number; startingEquity?: number } = {}
): MonteCarloResult {
  const simulations = opts.simulations ?? 500;
  const horizon = opts.horizon ?? returns.length;
  const startingEquity = opts.startingEquity ?? 0;
  if (returns.length === 0 || horizon === 0) {
    return {
      finalP10: 0,
      finalP50: 0,
      finalP90: 0,
      probNegative: 0,
      probLargeDD: 0,
      envelope: [],
      simulations: 0,
    };
  }
  // Pre-compute curves
  const curves: number[][] = [];
  let negativeCount = 0;
  let largeDDCount = 0;
  for (let s = 0; s < simulations; s++) {
    const path: number[] = [];
    let eq = startingEquity;
    let peak = startingEquity;
    let hadLargeDD = false;
    for (let t = 0; t < horizon; t++) {
      const r = returns[Math.floor(Math.random() * returns.length)];
      eq += r;
      if (eq > peak) peak = eq;
      const ddPct = peak > 0 ? ((peak - eq) / peak) * 100 : 0;
      if (ddPct >= 20) hadLargeDD = true;
      path.push(eq);
    }
    if (eq < startingEquity) negativeCount++;
    if (hadLargeDD) largeDDCount++;
    curves.push(path);
  }
  // Per-step percentiles
  const envelope: Array<{ step: number; p10: number; p50: number; p90: number }> = [];
  for (let t = 0; t < horizon; t++) {
    const col = curves.map((c) => c[t]).sort((a, b) => a - b);
    const at = (q: number) => col[Math.floor(q * (col.length - 1))];
    envelope.push({ step: t, p10: at(0.1), p50: at(0.5), p90: at(0.9) });
  }
  const finals = curves.map((c) => c[c.length - 1]).sort((a, b) => a - b);
  const at = (q: number) => finals[Math.floor(q * (finals.length - 1))];
  return {
    finalP10: at(0.1),
    finalP50: at(0.5),
    finalP90: at(0.9),
    probNegative: negativeCount / simulations,
    probLargeDD: largeDDCount / simulations,
    envelope,
    simulations,
  };
}
