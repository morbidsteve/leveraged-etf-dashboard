'use client';

import { useMemo, useState } from 'react';
import { useTradeStore } from '@/store';
import {
  computeDispositions,
  summarizeByTaxYear,
  generateForm8949CSV,
  CostBasisMethod,
  DispositionLot,
} from '@/lib/tax';
import { showToast } from '@/components/UI';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/calculations';

/**
 * Tax tools card — wash-sale detection + cost-basis method picker +
 * Form 8949 CSV export. Lives in Settings → Data.
 */
export default function TaxToolsCard() {
  const trades = useTradeStore((s) => s.trades);
  const [method, setMethod] = useState<CostBasisMethod>('FIFO');

  // Compute dispositions per ticker, then merge — pure
  const dispositions = useMemo<DispositionLot[]>(() => {
    if (trades.length === 0) return [];
    const byTicker = new Map<string, typeof trades>();
    for (const t of trades) {
      if (t.status !== 'closed') continue;
      if (!byTicker.has(t.ticker)) byTicker.set(t.ticker, []);
      byTicker.get(t.ticker)!.push(t);
    }
    const all: DispositionLot[] = [];
    const groups = Array.from(byTicker.values());
    for (const group of groups) {
      all.push(...computeDispositions(group, method));
    }
    return all.sort((a, b) => b.soldDate.getTime() - a.soldDate.getTime());
  }, [trades, method]);

  const yearSummary = useMemo(() => summarizeByTaxYear(dispositions), [dispositions]);
  const washCount = dispositions.filter((d) => d.isWashSale).length;

  const handleDownload = () => {
    if (dispositions.length === 0) {
      showToast('No closed trades to export', 'info');
      return;
    }
    const csv = generateForm8949CSV(dispositions);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `form-8949-${method.toLowerCase()}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Form 8949 (${method}) downloaded · ${dispositions.length} dispositions`);
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="font-medium text-white">Tax tools</h2>
        <p className="text-[11px] text-gray-500 mt-1">
          Lot-level cost-basis tracking + wash-sale detection (§1091) +
          Form 8949 CSV export. The dashboard uses the method you pick here
          for ALL classified dispositions; consult your CPA before using
          for actual filing.
        </p>
      </div>
      <div className="card-body space-y-4">
        {/* Method picker */}
        <div>
          <label className="label">Cost-basis method</label>
          <div className="flex gap-2 flex-wrap">
            {(['FIFO', 'LIFO', 'AVERAGE'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`text-xs px-3 py-1.5 rounded border ${
                  method === m
                    ? 'bg-accent/20 border-accent/40 text-accent-light'
                    : 'bg-white/[0.03] border-white/10 text-gray-400 hover:text-white'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-500 mt-1">
            FIFO is the default for non-broker reporting. LIFO often more
            tax-efficient in rising markets. AVERAGE is mutual-fund-style.
          </p>
        </div>

        {/* Year-by-year summary */}
        {yearSummary.length === 0 ? (
          <div className="text-xs text-gray-500 italic">
            No closed positions yet. Tax summary becomes available after
            you close some trades.
          </div>
        ) : (
          <div className="space-y-2">
            <h3 className="text-[10px] uppercase tracking-widest text-gray-500">
              Year-by-year summary
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-left text-[9px] uppercase tracking-widest text-gray-500 border-b border-white/10">
                    <th className="px-2 py-1.5 font-normal">Year</th>
                    <th className="px-2 py-1.5 font-normal text-right">ST gain</th>
                    <th className="px-2 py-1.5 font-normal text-right">ST loss</th>
                    <th className="px-2 py-1.5 font-normal text-right">LT gain</th>
                    <th className="px-2 py-1.5 font-normal text-right">LT loss</th>
                    <th className="px-2 py-1.5 font-normal text-right">Net</th>
                    <th className="px-2 py-1.5 font-normal text-right">Wash</th>
                  </tr>
                </thead>
                <tbody>
                  {yearSummary.map((y) => (
                    <tr key={y.year} className="border-b border-white/5">
                      <td className="px-2 py-1.5 text-white">{y.year}</td>
                      <td className="px-2 py-1.5 text-right text-profit">
                        {formatCurrency(y.shortTermGain)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-loss">
                        {formatCurrency(y.shortTermLoss)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-profit">
                        {formatCurrency(y.longTermGain)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-loss">
                        {formatCurrency(y.longTermLoss)}
                      </td>
                      <td
                        className={`px-2 py-1.5 text-right font-semibold ${
                          y.netTotal >= 0 ? 'text-profit' : 'text-loss'
                        }`}
                      >
                        {formatCurrency(y.netTotal)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-amber-300">
                        {y.washSalesDetected > 0 ? (
                          <span title={`Disallowed total: ${formatCurrency(y.washSaleDisallowedTotal)}`}>
                            {y.washSalesDetected} ⚠
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Wash-sale alert */}
        {washCount > 0 && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 space-y-1">
            <div className="text-amber-300 text-xs font-semibold">
              ⚠ {washCount} wash-sale{washCount === 1 ? '' : 's'} detected
            </div>
            <div className="text-[11px] text-amber-100/80">
              §1091 disallows losses when substantially identical securities
              are repurchased within 30 days before/after the sale. The
              disallowed amount adds to the basis of the replacement
              shares (your CPA will adjust for filing).
            </div>
          </div>
        )}

        {/* Recent dispositions */}
        {dispositions.length > 0 && (
          <div>
            <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">
              Recent dispositions ({dispositions.length} total)
            </h3>
            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-[11px] font-mono">
                <thead className="sticky top-0 bg-ink-surface">
                  <tr className="text-left text-[9px] uppercase tracking-widest text-gray-500 border-b border-white/10">
                    <th className="px-2 py-1 font-normal">Sold</th>
                    <th className="px-2 py-1 font-normal">Ticker</th>
                    <th className="px-2 py-1 font-normal text-right">Shares</th>
                    <th className="px-2 py-1 font-normal text-right">Basis</th>
                    <th className="px-2 py-1 font-normal text-right">Proceeds</th>
                    <th className="px-2 py-1 font-normal text-right">G/L</th>
                    <th className="px-2 py-1 font-normal text-right">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {dispositions.slice(0, 50).map((d, i) => (
                    <tr key={i} className="border-b border-white/5">
                      <td className="px-2 py-1 text-gray-300">
                        {format(d.soldDate, 'yyyy-MM-dd')}
                      </td>
                      <td className="px-2 py-1 text-white">{d.ticker}</td>
                      <td className="px-2 py-1 text-right">{d.shares}</td>
                      <td className="px-2 py-1 text-right text-gray-300">
                        {formatCurrency(d.costBasis)}
                      </td>
                      <td className="px-2 py-1 text-right text-gray-300">
                        {formatCurrency(d.proceeds)}
                      </td>
                      <td
                        className={`px-2 py-1 text-right font-semibold ${
                          d.gainLoss >= 0 ? 'text-profit' : 'text-loss'
                        }`}
                      >
                        {formatCurrency(d.gainLoss)}
                        {d.isWashSale && <span className="text-amber-300 ml-1">W</span>}
                      </td>
                      <td className="px-2 py-1 text-right text-gray-400">
                        {d.isLongTerm ? 'LT' : 'ST'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Download */}
        <div className="flex items-center gap-2 pt-2 border-t border-white/5">
          <button
            onClick={handleDownload}
            disabled={dispositions.length === 0}
            className="btn btn-primary text-sm disabled:opacity-40"
          >
            Download Form 8949 CSV
          </button>
          <span className="text-[10px] text-gray-500">
            Paste into TurboTax / your tax software
          </span>
        </div>
      </div>
    </div>
  );
}
