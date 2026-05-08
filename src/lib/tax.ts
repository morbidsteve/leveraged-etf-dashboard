import { Trade, TradeEntry, TradeExit } from '@/types';

/**
 * Tax-aware lot accounting for closed positions. Pure functions; no I/O.
 *
 * Supports three cost-basis methods:
 *   - FIFO: first-in-first-out (default; required for IRA / non-broker
 *     reporting unless user designates otherwise)
 *   - LIFO: last-in-first-out (often more tax-efficient in rising markets)
 *   - AVERAGE: average cost across all shares (mutual-fund-style; simpler)
 *
 * Wash-sale rule: under §1091 of the IRS code, a loss is disallowed if
 * substantially identical securities are purchased within 30 days before
 * or after the sale (61-day window total). The disallowed loss is added
 * to the basis of the replacement shares. We flag wash-sale candidates
 * for the user; the actual reporting is the user's responsibility.
 *
 * Output: per-disposition records suitable for Form 8949 (IRS Schedule D
 * supporting form). Each record has acquired date, sold date, proceeds,
 * basis, gain/loss, and a wash-sale flag.
 */

export type CostBasisMethod = 'FIFO' | 'LIFO' | 'AVERAGE';

export interface DispositionLot {
  ticker: string;
  acquiredDate: Date;
  soldDate: Date;
  shares: number;
  costBasis: number;       // total $ basis for this lot's shares
  proceeds: number;        // total $ proceeds for this lot's shares
  gainLoss: number;        // proceeds - costBasis
  isLongTerm: boolean;     // held > 365 days
  isWashSale: boolean;     // loss disallowed under §1091
  washSaleAmount?: number; // disallowed loss amount (added to replacement basis)
}

/**
 * Tax year totals derived from a list of dispositions.
 */
export interface TaxYearSummary {
  year: number;
  shortTermGain: number;
  shortTermLoss: number;
  longTermGain: number;
  longTermLoss: number;
  netShortTerm: number;
  netLongTerm: number;
  netTotal: number;
  washSalesDetected: number;
  washSaleDisallowedTotal: number;
}

/** Work unit per shares-acquired-once event. */
interface OpenLot {
  ticker: string;
  acquiredDate: Date;
  shares: number;          // remaining shares in this lot
  costPerShare: number;
  /** True when this lot was acquired within ±30 days of a loss sale —
   * pending wash-sale basis adjustment. */
  pendingWashAdjustment?: number;
}

/**
 * Compute dispositions for a single ticker's trades, respecting cost-basis
 * method. Trades MUST share the same ticker; caller groups them.
 *
 * Wash-sale detection runs as a SECOND pass over the dispositions because
 * it needs the full picture (loss sales + nearby buys).
 */
export function computeDispositions(
  trades: Trade[],
  method: CostBasisMethod = 'FIFO'
): DispositionLot[] {
  if (trades.length === 0) return [];
  const ticker = trades[0].ticker;

  // Combine every entry + exit into a chronological event stream
  type Event =
    | { kind: 'buy'; date: Date; price: number; shares: number }
    | { kind: 'sell'; date: Date; price: number; shares: number };
  const events: Event[] = [];
  for (const t of trades) {
    for (const e of t.entries) {
      events.push({ kind: 'buy', date: new Date(e.date), price: e.price, shares: e.shares });
    }
    for (const x of t.exits) {
      events.push({ kind: 'sell', date: new Date(x.date), price: x.price, shares: x.shares });
    }
  }
  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Lot-tracking
  let lots: OpenLot[] = [];
  const dispositions: DispositionLot[] = [];

  for (const ev of events) {
    if (ev.kind === 'buy') {
      lots.push({
        ticker,
        acquiredDate: ev.date,
        shares: ev.shares,
        costPerShare: ev.price,
      });
      continue;
    }
    // Sell — pull shares from lots in the order chosen by the method
    let sharesToSell = ev.shares;
    while (sharesToSell > 0 && lots.length > 0) {
      const lotIdx = chooseLotIndex(lots, method);
      const lot = lots[lotIdx];
      const take = Math.min(sharesToSell, lot.shares);
      const proceeds = take * ev.price;
      const costBasis = take * lot.costPerShare;
      const gainLoss = proceeds - costBasis;
      const heldDays = (ev.date.getTime() - lot.acquiredDate.getTime()) / 86400_000;
      dispositions.push({
        ticker,
        acquiredDate: lot.acquiredDate,
        soldDate: ev.date,
        shares: take,
        costBasis,
        proceeds,
        gainLoss,
        isLongTerm: heldDays > 365,
        isWashSale: false, // second pass marks
      });

      lot.shares -= take;
      sharesToSell -= take;
      if (lot.shares <= 0) lots.splice(lotIdx, 1);
    }
    // If sharesToSell remains > 0, the user sold more than they owned
    // (data error). We silently skip the overage.
  }

  // Pass 2: wash-sale detection
  return markWashSales(dispositions, events);
}

function chooseLotIndex(lots: OpenLot[], method: CostBasisMethod): number {
  if (method === 'FIFO') {
    let best = 0;
    for (let i = 1; i < lots.length; i++) {
      if (lots[i].acquiredDate < lots[best].acquiredDate) best = i;
    }
    return best;
  }
  if (method === 'LIFO') {
    let best = 0;
    for (let i = 1; i < lots.length; i++) {
      if (lots[i].acquiredDate > lots[best].acquiredDate) best = i;
    }
    return best;
  }
  // AVERAGE: collapse all lots into one weighted-average lot in place
  // before returning index 0. We do this lazily by computing weighted
  // average each time.
  if (lots.length > 1) {
    const totalShares = lots.reduce((s, l) => s + l.shares, 0);
    const totalCost = lots.reduce((s, l) => s + l.shares * l.costPerShare, 0);
    const avgCost = totalShares > 0 ? totalCost / totalShares : 0;
    const earliest = lots.reduce((e, l) =>
      l.acquiredDate < e ? l.acquiredDate : e, lots[0].acquiredDate);
    lots.length = 0;
    lots.push({
      ticker: 'AVG',
      acquiredDate: earliest,
      shares: totalShares,
      costPerShare: avgCost,
    });
  }
  return 0;
}

/**
 * Mark wash-sale dispositions. A loss is a wash sale if substantially
 * identical securities (same ticker, in our model) are bought within
 * the 61-day window: 30 days before through 30 days after the sale.
 */
function markWashSales(
  dispositions: DispositionLot[],
  events: { kind: 'buy' | 'sell'; date: Date; shares: number }[]
): DispositionLot[] {
  const buys = events
    .filter((e): e is { kind: 'buy'; date: Date; price: number; shares: number } & typeof e => e.kind === 'buy')
    .map((e) => ({ date: e.date, shares: e.shares }));
  const result = dispositions.map((d) => ({ ...d }));
  for (const d of result) {
    if (d.gainLoss >= 0) continue; // only losses can be wash sales
    const windowStart = new Date(d.soldDate.getTime() - 30 * 86400_000);
    const windowEnd = new Date(d.soldDate.getTime() + 30 * 86400_000);
    const hasReplacement = buys.some(
      (b) =>
        b.date >= windowStart &&
        b.date <= windowEnd &&
        // exclude the original buy that we just sold
        b.date.getTime() !== d.acquiredDate.getTime()
    );
    if (hasReplacement) {
      d.isWashSale = true;
      d.washSaleAmount = -d.gainLoss; // disallowed loss is positive number
    }
  }
  return result;
}

/**
 * Aggregate dispositions across all tickers into per-year summaries.
 */
export function summarizeByTaxYear(dispositions: DispositionLot[]): TaxYearSummary[] {
  const byYear = new Map<number, DispositionLot[]>();
  for (const d of dispositions) {
    const y = d.soldDate.getFullYear();
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(d);
  }
  const out: TaxYearSummary[] = [];
  const yearEntries = Array.from(byYear.entries());
  for (const [year, list] of yearEntries) {
    let stG = 0, stL = 0, ltG = 0, ltL = 0, washCount = 0, washTotal = 0;
    for (const d of list) {
      const realized = d.isWashSale ? 0 : d.gainLoss; // wash-sale losses don't count
      if (d.isLongTerm) {
        if (realized >= 0) ltG += realized;
        else ltL += realized;
      } else {
        if (realized >= 0) stG += realized;
        else stL += realized;
      }
      if (d.isWashSale) {
        washCount++;
        washTotal += d.washSaleAmount ?? 0;
      }
    }
    out.push({
      year,
      shortTermGain: stG,
      shortTermLoss: stL,
      longTermGain: ltG,
      longTermLoss: ltL,
      netShortTerm: stG + stL,
      netLongTerm: ltG + ltL,
      netTotal: stG + stL + ltG + ltL,
      washSalesDetected: washCount,
      washSaleDisallowedTotal: washTotal,
    });
  }
  out.sort((a, b) => b.year - a.year); // newest first
  return out;
}

/**
 * Generate Form 8949 CSV — IRS Schedule D supporting form. Each row is
 * one disposition. Columns match the official Form 8949 layout so the
 * user can paste straight into TurboTax / their tax software.
 */
export function generateForm8949CSV(dispositions: DispositionLot[]): string {
  const rows: string[][] = [];
  rows.push([
    'Description (a)',
    'Date acquired (b)',
    'Date sold (c)',
    'Proceeds (d)',
    'Cost basis (e)',
    'Code (f)',
    'Adjustment (g)',
    'Gain/loss (h)',
    'Long-term?',
  ]);
  for (const d of dispositions) {
    rows.push([
      `${d.shares} shares ${d.ticker}`,
      formatDate(d.acquiredDate),
      formatDate(d.soldDate),
      d.proceeds.toFixed(2),
      d.costBasis.toFixed(2),
      d.isWashSale ? 'W' : '',
      d.washSaleAmount ? d.washSaleAmount.toFixed(2) : '0.00',
      (d.isWashSale ? 0 : d.gainLoss).toFixed(2),
      d.isLongTerm ? 'Y' : 'N',
    ]);
  }
  return rows.map((r) => r.map(csvEscape).join(',')).join('\n');
}

function formatDate(d: Date): string {
  // MM/DD/YYYY for IRS
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function csvEscape(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ── Tax-loss harvesting ───────────────────────────────────────────────

export interface HarvestSuggestion {
  ticker: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  unrealizedLoss: number;
  daysHeld: number;
  longTerm: boolean;
  recommended: boolean;
  reason: string;
  warnings: string[];
}

export function suggestHarvest(opts: {
  trades: Trade[];
  prices: Record<string, { price: number }>;
  minLoss?: number;
  longTermOnly?: boolean;
}): HarvestSuggestion[] {
  const { trades, prices, minLoss = 200, longTermOnly = false } = opts;
  const out: HarvestSuggestion[] = [];

  for (const t of trades) {
    if (t.status !== 'open' || t.totalShares <= 0) continue;
    const live = prices[t.ticker]?.price;
    if (!live || !t.avgCost) continue;
    const unrealized = (live - t.avgCost) * t.totalShares;
    if (unrealized >= 0) continue;
    const daysHeld = (Date.now() - new Date(t.createdAt).getTime()) / 86400_000;
    const longTerm = daysHeld > 365;
    if (longTermOnly && !longTerm) continue;
    if (Math.abs(unrealized) < minLoss) continue;

    const warnings: string[] = [];
    const cutoff = new Date(Date.now() - 30 * 86400_000);
    const recentBuy = t.entries.some((e) => new Date(e.date) > cutoff);
    if (recentBuy) {
      warnings.push('You bought this within the past 30 days — selling at a loss now triggers §1091 wash-sale.');
    }

    const recommended = !recentBuy && Math.abs(unrealized) >= minLoss;

    out.push({
      ticker: t.ticker,
      shares: t.totalShares,
      avgCost: t.avgCost,
      currentPrice: live,
      unrealizedLoss: unrealized,
      daysHeld,
      longTerm,
      recommended,
      reason: longTerm
        ? `Long-term loss of ${unrealized.toFixed(2)} — offsets short-term and long-term gains.`
        : `Short-term loss of ${unrealized.toFixed(2)} — offsets short-term gains first.`,
      warnings,
    });
  }
  return out.sort((a, b) => a.unrealizedLoss - b.unrealizedLoss);
}
