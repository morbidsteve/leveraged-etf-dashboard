'use client';

import { useTradeStore, usePaperStore, useStrategyStore } from '@/store';
import { tradesToCsvRows, rowsToCsv, downloadCsv } from '@/lib/csvExport';
import { format } from 'date-fns';

/**
 * Single-button "export all closed trades" → CSV. Used in the
 * journal page header. Outputs a file named with today's date.
 */
export default function ExportTradesButton() {
  const manual = useTradeStore((s) => s.trades);
  const paperClosed = usePaperStore((s) => s.closed);
  const strategies = useStrategyStore((s) => s.strategies);

  const handleClick = () => {
    const stratNames = new Map<string, string>();
    for (const s of strategies) stratNames.set(s.id, s.name);
    const rows = tradesToCsvRows({
      manual,
      paper: paperClosed,
      strategyNameById: stratNames,
    });
    if (rows.length === 0) {
      alert('No closed trades to export.');
      return;
    }
    const csv = rowsToCsv(rows);
    const stamp = format(new Date(), 'yyyy-MM-dd');
    downloadCsv(csv, `trades-${stamp}.csv`);
  };

  return (
    <button
      onClick={handleClick}
      className="text-[10px] uppercase tracking-widest font-mono px-2 py-1 rounded border bg-white/[0.03] border-white/10 text-gray-400 hover:text-white"
      title="Download all closed trades as CSV (manual + paper)"
    >
      ⬇ CSV
    </button>
  );
}
