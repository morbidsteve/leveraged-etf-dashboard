'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { MainLayout } from '@/components/Layout';
import { useTradeStore } from '@/store';
import { usePriceData } from '@/hooks/usePriceData';
import {
  formatCurrency,
  formatPrice,
  formatShares,
  formatPercent,
  formatHoldTime,
  calculateHoldTime,
  getOpenPosition,
  calculateAvgCost,
  calculateTotalShares,
  calculateRealizedPnL,
} from '@/lib/calculations';
import { format } from 'date-fns';
import { TradeEntry, TradeExit } from '@/types';

export default function TradeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const tradeId = params.id as string;

  const trade = useTradeStore((state) => state.getTradeById(tradeId));
  const addEntry = useTradeStore((state) => state.addEntry);
  const addExit = useTradeStore((state) => state.addExit);
  const updateTrade = useTradeStore((state) => state.updateTrade);
  const deleteTrade = useTradeStore((state) => state.deleteTrade);

  const [showAddEntry, setShowAddEntry] = useState(false);
  const [showAddExit, setShowAddExit] = useState(false);
  const [newPrice, setNewPrice] = useState(0);
  const [newShares, setNewShares] = useState(0);
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 16));
  const [editNotes, setEditNotes] = useState(false);
  const [notes, setNotes] = useState('');

  // Edit mode states
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingExitId, setEditingExitId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState(0);
  const [editShares, setEditShares] = useState(0);
  const [editDate, setEditDate] = useState('');
  const [editTicker, setEditTicker] = useState(false);
  const [ticker, setTicker] = useState('');

  // Initialize ticker from trade
  useEffect(() => {
    if (trade) {
      setTicker(trade.ticker);
    }
  }, [trade]);

  const { priceData } = usePriceData({
    ticker: trade?.ticker || 'TQQQ',
    enabled: !!trade,
  });

  if (!trade) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-white mb-2">Trade Not Found</h1>
          <p className="text-gray-500 mb-4">The trade you&apos;re looking for doesn&apos;t exist.</p>
          <button onClick={() => router.push('/trades')} className="btn btn-primary">
            Back to Trades
          </button>
        </div>
      </MainLayout>
    );
  }

  const currentPrice = priceData?.price || trade.avgCost;
  const position = getOpenPosition(trade, currentPrice);
  const holdTime = calculateHoldTime(trade);

  const handleAddEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPrice > 0 && newShares > 0) {
      addEntry(tradeId, {
        date: new Date(newDate),
        price: newPrice,
        shares: newShares,
      });
      setNewPrice(0);
      setNewShares(0);
      setNewDate(new Date().toISOString().slice(0, 16));
      setShowAddEntry(false);
    }
  };

  const handleAddExit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPrice > 0 && newShares > 0 && newShares <= trade.totalShares) {
      addExit(tradeId, {
        date: new Date(newDate),
        price: newPrice,
        shares: newShares,
      });
      setNewPrice(0);
      setNewShares(0);
      setNewDate(new Date().toISOString().slice(0, 16));
      setShowAddExit(false);
    }
  };

  const handleUpdateNotes = () => {
    updateTrade(tradeId, { notes });
    setEditNotes(false);
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this trade?')) {
      deleteTrade(tradeId);
      router.push('/trades');
    }
  };

  const handleUpdateTicker = () => {
    if (ticker.trim()) {
      updateTrade(tradeId, { ticker: ticker.toUpperCase() });
      setEditTicker(false);
    }
  };

  const startEditEntry = (entry: TradeEntry) => {
    setEditingEntryId(entry.id);
    setEditPrice(entry.price);
    setEditShares(entry.shares);
    setEditDate(new Date(entry.date).toISOString().slice(0, 16));
  };

  const handleUpdateEntry = () => {
    if (!editingEntryId || !trade) return;

    const updatedEntries = trade.entries.map((e) =>
      e.id === editingEntryId
        ? { ...e, price: editPrice, shares: editShares, date: new Date(editDate) }
        : e
    );

    const avgCost = calculateAvgCost(updatedEntries);
    const totalShares = updatedEntries.reduce((sum, e) => sum + e.shares, 0) -
      trade.exits.reduce((sum, e) => sum + e.shares, 0);

    updateTrade(tradeId, {
      entries: updatedEntries,
      avgCost,
      totalShares,
    });
    setEditingEntryId(null);
  };

  const handleDeleteEntry = (entryId: string) => {
    if (!trade || trade.entries.length <= 1) {
      alert('Cannot delete the only entry. Delete the trade instead.');
      return;
    }
    if (confirm('Delete this entry?')) {
      const updatedEntries = trade.entries.filter((e) => e.id !== entryId);
      const avgCost = calculateAvgCost(updatedEntries);
      const totalShares = updatedEntries.reduce((sum, e) => sum + e.shares, 0) -
        trade.exits.reduce((sum, e) => sum + e.shares, 0);

      updateTrade(tradeId, {
        entries: updatedEntries,
        avgCost,
        totalShares,
      });
    }
  };

  const startEditExit = (exit: TradeExit) => {
    setEditingExitId(exit.id);
    setEditPrice(exit.price);
    setEditShares(exit.shares);
    setEditDate(new Date(exit.date).toISOString().slice(0, 16));
  };

  const handleUpdateExit = () => {
    if (!editingExitId || !trade) return;

    const updatedExits = trade.exits.map((e) =>
      e.id === editingExitId
        ? { ...e, price: editPrice, shares: editShares, date: new Date(editDate) }
        : e
    );

    const totalShares = trade.entries.reduce((sum, e) => sum + e.shares, 0) -
      updatedExits.reduce((sum, e) => sum + e.shares, 0);
    const updatedTrade = { ...trade, exits: updatedExits, totalShares };
    const realizedPnL = calculateRealizedPnL(updatedTrade);

    // Auto-close if no shares remaining
    const isClosed = totalShares <= 0;

    updateTrade(tradeId, {
      exits: updatedExits,
      totalShares,
      realizedPnL,
      status: isClosed ? 'closed' : trade.status,
      closedAt: isClosed && !trade.closedAt ? new Date() : trade.closedAt,
    });
    setEditingExitId(null);
  };

  const handleDeleteExit = (exitId: string) => {
    if (!trade) return;
    if (confirm('Delete this exit?')) {
      const updatedExits = trade.exits.filter((e) => e.id !== exitId);
      const totalShares = trade.entries.reduce((sum, e) => sum + e.shares, 0) -
        updatedExits.reduce((sum, e) => sum + e.shares, 0);
      const updatedTrade = { ...trade, exits: updatedExits, totalShares };
      const realizedPnL = calculateRealizedPnL(updatedTrade);

      updateTrade(tradeId, {
        exits: updatedExits,
        totalShares,
        realizedPnL,
        status: 'open', // Reopen if exits are deleted
        closedAt: undefined,
      });
    }
  };

  const handleReopenTrade = () => {
    if (confirm('Reopen this trade?')) {
      updateTrade(tradeId, {
        status: 'open',
        closedAt: undefined,
      });
    }
  };

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3">
              {editTicker ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                    className="input w-32 font-mono uppercase text-xl font-bold"
                  />
                  <button onClick={handleUpdateTicker} className="btn btn-primary btn-sm">Save</button>
                  <button onClick={() => { setEditTicker(false); setTicker(trade.ticker); }} className="btn btn-ghost btn-sm">Cancel</button>
                </div>
              ) : (
                <h1
                  className="text-2xl font-bold text-white cursor-pointer hover:text-blue-400"
                  onClick={() => setEditTicker(true)}
                  title="Click to edit ticker"
                >
                  {trade.ticker}
                </h1>
              )}
              <span className={`badge ${trade.status === 'open' ? 'badge-neutral' : 'bg-gray-700 text-gray-300'}`}>
                {trade.status}
              </span>
              {trade.status === 'closed' && (
                <button onClick={handleReopenTrade} className="text-xs text-blue-400 hover:text-blue-300">
                  Reopen
                </button>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Opened {format(new Date(trade.createdAt), 'MMM dd, yyyy HH:mm')}
              {trade.closedAt && ` | Closed ${format(new Date(trade.closedAt), 'MMM dd, yyyy HH:mm')}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => router.back()} className="btn btn-ghost">
              Back
            </button>
            <button onClick={handleDelete} className="btn btn-danger">
              Delete
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Position Summary */}
          <div className="card">
            <div className="card-header">
              <h2 className="font-medium text-white">Position Summary</h2>
            </div>
            <div className="card-body">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-500">Total Shares</div>
                  <div className="text-xl font-bold font-mono text-white">
                    {formatShares(trade.totalShares)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Avg Cost</div>
                  <div className="text-xl font-bold font-mono text-white">
                    {formatPrice(trade.avgCost)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Current Price</div>
                  <div className="text-xl font-bold font-mono text-white">
                    {formatPrice(currentPrice)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Hold Time</div>
                  <div className="text-xl font-bold font-mono text-white">
                    {formatHoldTime(holdTime)}
                  </div>
                </div>
              </div>

              {trade.status === 'open' && (
                <div className="mt-4 pt-4 border-t border-dark-border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-400">Unrealized P&L</span>
                    <span className={`text-xl font-bold font-mono ${position.unrealizedPnL >= 0 ? 'text-profit' : 'text-loss'}`}>
                      {formatCurrency(position.unrealizedPnL)} ({formatPercent(position.unrealizedPnLPercent)})
                    </span>
                  </div>
                </div>
              )}

              {trade.status === 'closed' && (
                <div className="mt-4 pt-4 border-t border-dark-border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-400">Realized P&L</span>
                    <span className={`text-xl font-bold font-mono ${trade.realizedPnL >= 0 ? 'text-profit' : 'text-loss'}`}>
                      {formatCurrency(trade.realizedPnL)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Profit Targets */}
          {trade.status === 'open' && (
            <div className="card">
              <div className="card-header">
                <h2 className="font-medium text-white">Profit Targets</h2>
              </div>
              <div className="card-body space-y-4">
                <div className="p-4 bg-profit/10 border border-profit/30 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-profit">1.5% Target</div>
                      <div className="text-xl font-bold font-mono text-white">
                        {formatPrice(position.target15)}
                      </div>
                    </div>
                    <div className="text-right">
                      {position.distanceToTarget15 > 0 ? (
                        <div className="text-sm text-neutral">
                          {formatPrice(position.distanceToTarget15)} away
                        </div>
                      ) : (
                        <div className="text-sm text-profit">Target reached!</div>
                      )}
                    </div>
                  </div>
                  <div className="progress-bar mt-2">
                    <div
                      className={`progress-bar-fill ${position.distanceToTarget15 <= 0 ? 'bg-profit' : 'bg-neutral'}`}
                      style={{
                        width: `${Math.min(100, Math.max(0, ((currentPrice - trade.avgCost) / (position.target15 - trade.avgCost)) * 100))}%`
                      }}
                    />
                  </div>
                </div>

                <div className="p-4 bg-profit/10 border border-profit/30 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-profit">2% Target</div>
                      <div className="text-xl font-bold font-mono text-white">
                        {formatPrice(position.target20)}
                      </div>
                    </div>
                    <div className="text-right">
                      {position.distanceToTarget20 > 0 ? (
                        <div className="text-sm text-neutral">
                          {formatPrice(position.distanceToTarget20)} away
                        </div>
                      ) : (
                        <div className="text-sm text-profit">Target reached!</div>
                      )}
                    </div>
                  </div>
                  <div className="progress-bar mt-2">
                    <div
                      className={`progress-bar-fill ${position.distanceToTarget20 <= 0 ? 'bg-profit' : 'bg-neutral'}`}
                      style={{
                        width: `${Math.min(100, Math.max(0, ((currentPrice - trade.avgCost) / (position.target20 - trade.avgCost)) * 100))}%`
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Entries */}
        <div className="card mt-6">
          <div className="card-header flex items-center justify-between">
            <h2 className="font-medium text-white">Entries ({trade.entries.length})</h2>
            {trade.status === 'open' && (
              <button
                onClick={() => setShowAddEntry(!showAddEntry)}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                + Add DCA Entry
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Price</th>
                  <th>Shares</th>
                  <th>Cost</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {trade.entries.map((entry) => (
                  <tr key={entry.id}>
                    {editingEntryId === entry.id ? (
                      <>
                        <td>
                          <input
                            type="datetime-local"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="input text-sm w-44"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            value={editPrice}
                            onChange={(e) => setEditPrice(Number(e.target.value))}
                            className="input font-mono w-24"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={editShares}
                            onChange={(e) => setEditShares(Number(e.target.value))}
                            className="input font-mono w-20"
                          />
                        </td>
                        <td className="font-mono">{formatCurrency(editPrice * editShares)}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <button onClick={handleUpdateEntry} className="text-profit hover:text-profit-light text-sm">Save</button>
                            <button onClick={() => setEditingEntryId(null)} className="text-gray-400 hover:text-white text-sm">Cancel</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="font-mono text-sm">
                          {format(new Date(entry.date), 'MMM dd, yyyy HH:mm')}
                        </td>
                        <td className="font-mono">{formatPrice(entry.price)}</td>
                        <td className="font-mono">{formatShares(entry.shares)}</td>
                        <td className="font-mono">{formatCurrency(entry.price * entry.shares)}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <button onClick={() => startEditEntry(entry)} className="text-blue-400 hover:text-blue-300 text-sm">Edit</button>
                            <button onClick={() => handleDeleteEntry(entry.id)} className="text-loss hover:text-loss-light text-sm">Delete</button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add Entry Form */}
          {showAddEntry && (
            <form onSubmit={handleAddEntry} className="p-4 border-t border-dark-border">
              <div className="flex items-end gap-4 flex-wrap">
                <div className="flex-1 min-w-[120px]">
                  <label className="label">Price</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      value={newPrice || ''}
                      onChange={(e) => setNewPrice(Number(e.target.value))}
                      className="input w-full font-mono"
                      placeholder="$0.00"
                      required
                    />
                    {priceData && (
                      <button
                        type="button"
                        onClick={() => setNewPrice(priceData.price)}
                        className="btn btn-ghost text-xs"
                      >
                        Market
                      </button>
                    )}
                  </div>
                </div>
                <div className="w-24">
                  <label className="label">Shares</label>
                  <input
                    type="number"
                    value={newShares || ''}
                    onChange={(e) => setNewShares(Number(e.target.value))}
                    className="input w-full font-mono"
                    placeholder="0"
                    required
                  />
                </div>
                <div className="w-44">
                  <label className="label">Date/Time</label>
                  <input
                    type="datetime-local"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="input w-full text-sm"
                  />
                </div>
                <button type="submit" className="btn btn-primary">
                  Add Entry
                </button>
                <button type="button" onClick={() => setShowAddEntry(false)} className="btn btn-ghost">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Exits */}
        <div className="card mt-6">
          <div className="card-header flex items-center justify-between">
            <h2 className="font-medium text-white">Exits ({trade.exits.length})</h2>
            {trade.status === 'open' && trade.totalShares > 0 && (
              <button
                onClick={() => setShowAddExit(!showAddExit)}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                + Add Exit
              </button>
            )}
          </div>
          {trade.exits.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Price</th>
                    <th>Shares</th>
                    <th>Proceeds</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {trade.exits.map((exit) => (
                    <tr key={exit.id}>
                      {editingExitId === exit.id ? (
                        <>
                          <td>
                            <input
                              type="datetime-local"
                              value={editDate}
                              onChange={(e) => setEditDate(e.target.value)}
                              className="input text-sm w-44"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              value={editPrice}
                              onChange={(e) => setEditPrice(Number(e.target.value))}
                              className="input font-mono w-24"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              value={editShares}
                              onChange={(e) => setEditShares(Number(e.target.value))}
                              className="input font-mono w-20"
                            />
                          </td>
                          <td className="font-mono">{formatCurrency(editPrice * editShares)}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <button onClick={handleUpdateExit} className="text-profit hover:text-profit-light text-sm">Save</button>
                              <button onClick={() => setEditingExitId(null)} className="text-gray-400 hover:text-white text-sm">Cancel</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="font-mono text-sm">
                            {format(new Date(exit.date), 'MMM dd, yyyy HH:mm')}
                          </td>
                          <td className="font-mono">{formatPrice(exit.price)}</td>
                          <td className="font-mono">{formatShares(exit.shares)}</td>
                          <td className="font-mono">{formatCurrency(exit.price * exit.shares)}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <button onClick={() => startEditExit(exit)} className="text-blue-400 hover:text-blue-300 text-sm">Edit</button>
                              <button onClick={() => handleDeleteExit(exit.id)} className="text-loss hover:text-loss-light text-sm">Delete</button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card-body text-center text-gray-500 py-4">
              No exits yet
            </div>
          )}

          {/* Add Exit Form */}
          {showAddExit && (
            <form onSubmit={handleAddExit} className="p-4 border-t border-dark-border">
              <div className="flex items-end gap-4 flex-wrap">
                <div className="flex-1 min-w-[120px]">
                  <label className="label">Price</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      value={newPrice || ''}
                      onChange={(e) => setNewPrice(Number(e.target.value))}
                      className="input w-full font-mono"
                      placeholder="$0.00"
                      required
                    />
                    {priceData && (
                      <button
                        type="button"
                        onClick={() => setNewPrice(priceData.price)}
                        className="btn btn-ghost text-xs"
                      >
                        Market
                      </button>
                    )}
                  </div>
                </div>
                <div className="w-24">
                  <label className="label">Shares (max: {trade.totalShares})</label>
                  <input
                    type="number"
                    max={trade.totalShares}
                    value={newShares || ''}
                    onChange={(e) => setNewShares(Number(e.target.value))}
                    className="input w-full font-mono"
                    placeholder="0"
                    required
                  />
                </div>
                <div className="w-44">
                  <label className="label">Date/Time</label>
                  <input
                    type="datetime-local"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="input w-full text-sm"
                  />
                </div>
                <button type="submit" className="btn btn-success">
                  Add Exit
                </button>
                <button type="button" onClick={() => setShowAddExit(false)} className="btn btn-ghost">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Notes */}
        <div className="card mt-6">
          <div className="card-header flex items-center justify-between">
            <h2 className="font-medium text-white">Notes</h2>
            <button
              onClick={() => {
                setNotes(trade.notes);
                setEditNotes(!editNotes);
              }}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              {editNotes ? 'Cancel' : 'Edit'}
            </button>
          </div>
          <div className="card-body">
            {editNotes ? (
              <div className="space-y-3">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="input w-full h-24 resize-none"
                  placeholder="Add notes..."
                />
                <button onClick={handleUpdateNotes} className="btn btn-primary">
                  Save Notes
                </button>
              </div>
            ) : (
              <p className="text-gray-400 whitespace-pre-wrap">
                {trade.notes || 'No notes yet.'}
              </p>
            )}
          </div>
        </div>

        {/* Tags */}
        {trade.tags.length > 0 && (
          <div className="mt-6 flex items-center gap-2">
            <span className="text-sm text-gray-500">Tags:</span>
            {trade.tags.map((tag) => (
              <span key={tag} className="badge badge-neutral">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
