/**
 * CSV serialization for trade history. Pure: takes data, returns a
 * CSV string. The download trigger is in the caller because that
 * needs DOM access.
 *
 * Format follows the rough convention of TaxAct / TurboTax import:
 *   Date Acquired,Date Sold,Symbol,Side,Quantity,Cost Basis,Proceeds,
 *   Realized P&L,Hold Days,Source,Strategy,Notes,Tags
 */

import { Trade } from '@/types';
import { PaperTrade } from '@/store/paperStore';

export interface CsvRow {
  dateAcquired: string;
  dateSold: string;
  symbol: string;
  side: 'long' | 'short';
  quantity: number;
  costBasis: number;
  proceeds: number;
  realizedPnL: number;
  holdDays: number;
  source: 'manual' | 'paper';
  strategy: string;
  notes: string;
  tags: string;
}

const isoDate = (d: Date | string | undefined): string => {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const csvEscape = (s: string | number): string => {
  const str = String(s ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export function tradesToCsvRows(opts: {
  manual: Trade[];
  paper: PaperTrade[];
  strategyNameById?: Map<string, string>;
}): CsvRow[] {
  const rows: CsvRow[] = [];
  const strategyName = opts.strategyNameById ?? new Map<string, string>();
  for (const t of opts.manual) {
    if (t.status !== 'closed') continue;
    // Sum costs and proceeds
    const costBasis = t.entries.reduce((s, e) => s + e.price * e.shares, 0);
    const proceeds = t.exits.reduce((s, e) => s + e.price * e.shares, 0);
    const lastEntry = t.entries[t.entries.length - 1];
    const firstEntry = t.entries[0];
    const lastExit = t.exits[t.exits.length - 1];
    const acquiredAt = firstEntry?.date ?? t.createdAt;
    const soldAt = lastExit?.date ?? t.closedAt ?? t.createdAt;
    const ms = new Date(soldAt).getTime() - new Date(acquiredAt).getTime();
    const holdDays = Math.max(0, Math.round(ms / 86400_000));
    rows.push({
      dateAcquired: isoDate(acquiredAt),
      dateSold: isoDate(soldAt),
      symbol: t.ticker,
      side: 'long',
      quantity: t.totalShares,
      costBasis,
      proceeds,
      realizedPnL: t.realizedPnL,
      holdDays,
      source: 'manual',
      strategy: '',
      notes: t.notes ?? '',
      tags: (t.tags ?? []).join(';'),
    });
    void lastEntry;
  }
  for (const t of opts.paper) {
    const costBasis = t.entryPrice * t.shares;
    const proceeds = t.exitPrice * t.shares;
    const ms = new Date(t.exitAt).getTime() - new Date(t.entryAt).getTime();
    const holdDays = Math.max(0, Math.round(ms / 86400_000));
    rows.push({
      dateAcquired: isoDate(t.entryAt),
      dateSold: isoDate(t.exitAt),
      symbol: t.ticker,
      side: 'long',
      quantity: t.shares,
      costBasis,
      proceeds,
      realizedPnL: t.realizedPnL,
      holdDays,
      source: 'paper',
      strategy: strategyName.get(t.strategyId) ?? '',
      notes: t.notes ?? '',
      tags: (t.tags ?? []).join(';'),
    });
  }
  rows.sort((a, b) => a.dateSold.localeCompare(b.dateSold));
  return rows;
}

export function rowsToCsv(rows: CsvRow[]): string {
  const headers = [
    'Date Acquired',
    'Date Sold',
    'Symbol',
    'Side',
    'Quantity',
    'Cost Basis',
    'Proceeds',
    'Realized P&L',
    'Hold Days',
    'Source',
    'Strategy',
    'Notes',
    'Tags',
  ];
  const out: string[] = [headers.map(csvEscape).join(',')];
  for (const r of rows) {
    out.push(
      [
        r.dateAcquired,
        r.dateSold,
        r.symbol,
        r.side,
        r.quantity,
        r.costBasis.toFixed(2),
        r.proceeds.toFixed(2),
        r.realizedPnL.toFixed(2),
        r.holdDays,
        r.source,
        r.strategy,
        r.notes,
        r.tags,
      ]
        .map(csvEscape)
        .join(',')
    );
  }
  return out.join('\n');
}

/** Trigger a download of `csv` as a file named `filename`. Browser-only. */
export function downloadCsv(csv: string, filename: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
