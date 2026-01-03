'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/Layout';
import { useTradeStore } from '@/store';
import { usePriceData } from '@/hooks/usePriceData';
import { formatPrice } from '@/lib/calculations';
import { TradeEntry } from '@/types';

export default function NewTradePage() {
  const router = useRouter();
  const addTrade = useTradeStore((state) => state.addTrade);

  const [ticker, setTicker] = useState('TQQQ');
  const [entries, setEntries] = useState<Omit<TradeEntry, 'id'>[]>([
    { date: new Date(), price: 0, shares: 0 },
  ]);
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');

  const { priceData } = usePriceData({
    ticker,
    refreshInterval: 10000,
  });

  const addEntry = () => {
    setEntries([...entries, { date: new Date(), price: 0, shares: 0 }]);
  };

  const removeEntry = (index: number) => {
    if (entries.length > 1) {
      setEntries(entries.filter((_, i) => i !== index));
    }
  };

  const updateEntry = (index: number, field: keyof Omit<TradeEntry, 'id'>, value: number | Date) => {
    const updated = [...entries];
    updated[index] = { ...updated[index], [field]: value };
    setEntries(updated);
  };

  const useMarketPrice = (index: number) => {
    if (priceData?.price) {
      updateEntry(index, 'price', priceData.price);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate entries
    const validEntries = entries.filter((entry) => entry.price > 0 && entry.shares > 0);
    if (validEntries.length === 0) {
      alert('Please add at least one valid entry');
      return;
    }

    // Create trade
    const trade = addTrade({
      ticker: ticker.toUpperCase(),
      status: 'open',
      entries: validEntries.map((e, i) => ({
        ...e,
        id: `entry-${i}`,
      })),
      exits: [],
      notes,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    });

    router.push(`/trades/${trade.id}`);
  };

  const totalShares = entries.reduce((sum, e) => sum + e.shares, 0);
  const totalCost = entries.reduce((sum, e) => sum + e.price * e.shares, 0);
  const avgCost = totalShares > 0 ? totalCost / totalShares : 0;

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">Log New Trade</h1>

        <form onSubmit={handleSubmit}>
          <div className="card">
            <div className="card-header">
              <h2 className="font-medium text-white">Trade Details</h2>
            </div>
            <div className="card-body space-y-6">
              {/* Ticker */}
              <div>
                <label className="label">Ticker Symbol</label>
                <div className="flex items-center gap-4">
                  <input
                    type="text"
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                    className="input w-32 font-mono uppercase"
                    placeholder="TQQQ"
                    required
                  />
                  {priceData && (
                    <span className="text-gray-400">
                      Current: <span className="font-mono text-white">{formatPrice(priceData.price)}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Entries */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Entry Positions</label>
                  <button
                    type="button"
                    onClick={addEntry}
                    className="text-sm text-blue-400 hover:text-blue-300"
                  >
                    + Add DCA Entry
                  </button>
                </div>

                <div className="space-y-3">
                  {entries.map((entry, index) => (
                    <div key={index} className="flex items-end gap-3 p-3 bg-dark-bg rounded-lg">
                      <div className="flex-1">
                        <label className="text-xs text-gray-500">Price</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.01"
                            value={entry.price || ''}
                            onChange={(e) => updateEntry(index, 'price', Number(e.target.value))}
                            className="input w-full font-mono"
                            placeholder="$0.00"
                            required
                          />
                          {priceData && (
                            <button
                              type="button"
                              onClick={() => useMarketPrice(index)}
                              className="btn btn-ghost text-xs py-1 px-2 whitespace-nowrap"
                            >
                              Use Market
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="w-32">
                        <label className="text-xs text-gray-500">Shares</label>
                        <input
                          type="number"
                          value={entry.shares || ''}
                          onChange={(e) => updateEntry(index, 'shares', Number(e.target.value))}
                          className="input w-full font-mono"
                          placeholder="0"
                          required
                        />
                      </div>
                      <div className="w-40">
                        <label className="text-xs text-gray-500">Date/Time</label>
                        <input
                          type="datetime-local"
                          value={new Date(entry.date).toISOString().slice(0, 16)}
                          onChange={(e) => updateEntry(index, 'date', new Date(e.target.value))}
                          className="input w-full text-sm"
                        />
                      </div>
                      {entries.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeEntry(index)}
                          className="btn btn-ghost text-loss p-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary */}
              {totalShares > 0 && (
                <div className="p-4 bg-dark-bg rounded-lg">
                  <h3 className="text-sm font-medium text-gray-400 mb-2">Position Summary</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-xs text-gray-500">Total Shares</div>
                      <div className="font-mono text-white">{totalShares}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Total Cost</div>
                      <div className="font-mono text-white">{formatPrice(totalCost)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Avg Cost</div>
                      <div className="font-mono text-white">{formatPrice(avgCost)}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-dark-border">
                    <div>
                      <div className="text-xs text-profit">1.5% Target</div>
                      <div className="font-mono text-profit">{formatPrice(avgCost * 1.015)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-profit">2% Target</div>
                      <div className="font-mono text-profit">{formatPrice(avgCost * 1.02)}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="label">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="input w-full h-24 resize-none"
                  placeholder="Trade notes, rationale, observations..."
                />
              </div>

              {/* Tags */}
              <div>
                <label className="label">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="input w-full"
                  placeholder="scalp, dca, breakout..."
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-4 mt-6">
            <button
              type="button"
              onClick={() => router.back()}
              className="btn btn-ghost"
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-success">
              Create Trade
            </button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}
