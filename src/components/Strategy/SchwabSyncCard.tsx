'use client';

import { useState } from 'react';
import { useTradeStore } from '@/store';
import { showToast } from '@/components/UI';
import { format } from 'date-fns';
import { TradeEntry } from '@/types';

interface SchwabTransaction {
  id: string;
  time: string;
  symbol: string;
  amount: number;        // signed; + = buy/long, - = sell/short
  price: number;
  netAmount: number;
  type: string;
  status: string;
}

/**
 * Schwab transaction sync card. One-click "Pull yesterday's trades"
 * that hits /api/schwab/transactions and proposes new Trade entries
 * for any non-duplicates.
 *
 * Lives in Settings → Broker, below the Schwab connect card.
 */
export default function SchwabSyncCard() {
  const trades = useTradeStore((s) => s.trades);
  const addTrade = useTradeStore((s) => s.addTrade);
  const addEntry = useTradeStore((s) => s.addEntry);
  const addExit = useTradeStore((s) => s.addExit);

  const [loading, setLoading] = useState(false);
  const [txs, setTxs] = useState<SchwabTransaction[]>([]);
  const [days, setDays] = useState(7);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/schwab/transactions?days=${days}`);
      const data = await r.json();
      if (data.error) {
        showToast(`Schwab error: ${data.error}`, 'error', 5000);
        return;
      }
      setTxs(data.items ?? []);
      showToast(`Loaded ${(data.items ?? []).length} transactions`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Fetch failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const importTransaction = (tx: SchwabTransaction) => {
    if (tx.amount > 0) {
      // Buy — find existing open trade for this ticker, or create new
      const open = trades.find((t) => t.ticker === tx.symbol && t.status === 'open');
      const entry: Omit<TradeEntry, 'id'> = {
        date: new Date(tx.time),
        price: tx.price,
        shares: Math.abs(tx.amount),
      };
      if (open) {
        addEntry(open.id, entry);
      } else {
        addTrade({
          ticker: tx.symbol,
          status: 'open',
          entries: [{ ...entry, id: 'temp' }],
          exits: [],
          notes: `Imported from Schwab on ${format(new Date(), 'yyyy-MM-dd')}`,
          tags: ['schwab-import'],
        });
      }
      showToast(`Imported BUY ${tx.symbol} ×${Math.abs(tx.amount)}`);
    } else if (tx.amount < 0) {
      // Sell — find matching open trade
      const open = trades.find((t) => t.ticker === tx.symbol && t.status === 'open');
      if (!open) {
        showToast(`No open ${tx.symbol} trade to apply this sell to`, 'error');
        return;
      }
      addExit(open.id, {
        date: new Date(tx.time),
        price: tx.price,
        shares: Math.abs(tx.amount),
      });
      showToast(`Imported SELL ${tx.symbol} ×${Math.abs(tx.amount)}`);
    }
    // Mark this tx as done by removing from the list
    setTxs((ts) => ts.filter((t) => t.id !== tx.id));
  };

  const importAll = () => {
    if (!confirm(`Import all ${txs.length} transactions? This may match-merge with existing open trades.`)) return;
    for (const tx of [...txs]) importTransaction(tx);
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="font-medium text-white">Schwab transaction sync</h2>
        <p className="text-[11px] text-gray-500 mt-1">
          One-click pull of recent broker-side trades into the journal.
          Useful if you place trades outside the dashboard (mobile app,
          Schwab web) and want them tracked here for analytics + tax.
        </p>
      </div>
      <div className="card-body space-y-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400">Last</label>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="input text-xs py-1 w-20"
          >
            {[1, 3, 7, 14, 30].map((d) => (
              <option key={d} value={d}>{d} days</option>
            ))}
          </select>
          <button onClick={fetchTransactions} disabled={loading} className="btn btn-primary text-sm">
            {loading ? 'Loading…' : 'Fetch transactions'}
          </button>
          {txs.length > 0 && (
            <button onClick={importAll} className="btn btn-outline text-sm">
              Import all
            </button>
          )}
        </div>
        {txs.length === 0 ? (
          <div className="text-xs text-gray-500 italic">
            No transactions loaded yet. Click "Fetch transactions" to pull from Schwab.
          </div>
        ) : (
          <div className="space-y-1 font-mono text-[11px] max-h-64 overflow-y-auto">
            {txs.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center gap-2 p-1.5 rounded border border-white/10 bg-white/[0.04]"
              >
                <span className="text-gray-500 shrink-0">
                  {format(new Date(tx.time), 'MMM dd HH:mm')}
                </span>
                <span
                  className={`uppercase font-bold shrink-0 ${
                    tx.amount > 0 ? 'text-profit' : 'text-loss'
                  }`}
                >
                  {tx.amount > 0 ? 'BUY' : 'SELL'}
                </span>
                <span className="text-white shrink-0">{tx.symbol}</span>
                <span className="text-gray-400 shrink-0">
                  ×{Math.abs(tx.amount)} @ ${tx.price.toFixed(2)}
                </span>
                <span className="ml-auto text-gray-500 shrink-0">{tx.status}</span>
                <button
                  onClick={() => importTransaction(tx)}
                  className="text-[10px] text-accent-light uppercase tracking-widest hover:brightness-125"
                >
                  Import
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
