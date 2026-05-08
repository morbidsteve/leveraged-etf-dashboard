'use client';

import { useEffect, useState } from 'react';
import { useTradeStore } from '@/store';
import { usePriceData, useStoreHydration } from '@/hooks';
import { formatPrice } from '@/lib/calculations';
import { TradeEntry } from '@/types';

interface NewTradePanelProps {
  defaultTicker?: string;
  onCreated?: (tradeId: string) => void;
}

export default function NewTradePanel({ defaultTicker = 'SOXL', onCreated }: NewTradePanelProps) {
  const storeHydrated = useStoreHydration();
  const addTrade = useTradeStore((state) => state.addTrade);

  const [ticker, setTicker] = useState(defaultTicker);
  const [entries, setEntries] = useState<Omit<TradeEntry, 'id'>[]>([
    { date: new Date(), price: 0, shares: 0 },
  ]);
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');

  // Cmd+K palette can pre-fill the ticker
  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<string>;
      if (ev.detail) setTicker(ev.detail.toUpperCase());
    };
    window.addEventListener('etf-new-trade-ticker', handler);
    return () => window.removeEventListener('etf-new-trade-ticker', handler);
  }, []);

  const { priceData } = usePriceData({ ticker, refreshInterval: 1000, enabled: storeHydrated });

  const addEntry = () =>
    setEntries([...entries, { date: new Date(), price: 0, shares: 0 }]);
  const removeEntry = (index: number) =>
    entries.length > 1 && setEntries(entries.filter((_, i) => i !== index));
  const updateEntry = (
    index: number,
    field: keyof Omit<TradeEntry, 'id'>,
    value: number | Date
  ) => {
    const updated = [...entries];
    updated[index] = { ...updated[index], [field]: value };
    setEntries(updated);
  };
  const useMarketPrice = (index: number) => {
    if (priceData?.price) updateEntry(index, 'price', priceData.price);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validEntries = entries.filter((entry) => entry.price > 0 && entry.shares > 0);
    if (validEntries.length === 0) {
      alert('Please add at least one valid entry');
      return;
    }
    const trade = addTrade({
      ticker: ticker.toUpperCase(),
      status: 'open',
      entries: validEntries.map((e, i) => ({ ...e, id: `entry-${i}` })),
      exits: [],
      notes,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    });
    if (onCreated) onCreated(trade.id);
  };

  const totalShares = entries.reduce((sum, e) => sum + e.shares, 0);
  const totalCost = entries.reduce((sum, e) => sum + e.price * e.shares, 0);
  const avgCost = totalShares > 0 ? totalCost / totalShares : 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="card">
        <div className="card-body space-y-6">
          <div>
            <label className="label">Ticker Symbol</label>
            <div className="flex items-center gap-4">
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                className="input w-32 font-mono uppercase"
                placeholder="SOXL"
                required
              />
              {priceData && (
                <span className="text-gray-400 text-sm">
                  Current:{' '}
                  <span className="font-mono text-white">{formatPrice(priceData.price)}</span>
                </span>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Entry Positions</label>
              <button
                type="button"
                onClick={addEntry}
                className="text-xs text-accent-light hover:brightness-125 transition"
              >
                + Add DCA Entry
              </button>
            </div>

            <div className="space-y-3">
              {entries.map((entry, index) => (
                <div
                  key={index}
                  className="flex flex-wrap items-end gap-3 p-3 bg-white/[0.03] border border-white/5 rounded-lg"
                >
                  <div className="flex-1 min-w-[160px]">
                    <label className="text-[10px] text-gray-500 uppercase tracking-wide">
                      Price
                    </label>
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
                  <div className="w-28">
                    <label className="text-[10px] text-gray-500 uppercase tracking-wide">
                      Shares
                    </label>
                    <input
                      type="number"
                      value={entry.shares || ''}
                      onChange={(e) => updateEntry(index, 'shares', Number(e.target.value))}
                      className="input w-full font-mono"
                      placeholder="0"
                      required
                    />
                  </div>
                  <div className="w-44">
                    <label className="text-[10px] text-gray-500 uppercase tracking-wide">
                      Date/Time
                    </label>
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
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {totalShares > 0 && (
            <div className="p-4 bg-white/[0.03] border border-white/5 rounded-lg">
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
                Position Summary
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-[10px] text-gray-500 uppercase">Total Shares</div>
                  <div className="font-mono text-white text-lg">{totalShares}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 uppercase">Total Cost</div>
                  <div className="font-mono text-white text-lg">{formatPrice(totalCost)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 uppercase">Avg Cost</div>
                  <div className="font-mono text-white text-lg">{formatPrice(avgCost)}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4 pt-3 border-t border-white/5">
                <div>
                  <div className="text-[10px] text-profit uppercase tracking-wide">
                    1.5% Target
                  </div>
                  <div className="font-mono text-profit text-lg">{formatPrice(avgCost * 1.015)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-profit uppercase tracking-wide">2% Target</div>
                  <div className="font-mono text-profit text-lg">{formatPrice(avgCost * 1.02)}</div>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="label">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input w-full h-24 resize-none"
              placeholder="Trade notes, rationale, observations..."
            />
          </div>

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

      <div className="flex items-center justify-end gap-3">
        <button type="submit" className="btn btn-success">
          Create Trade
        </button>
      </div>
    </form>
  );
}
