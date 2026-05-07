'use client';

import { useState, useMemo } from 'react';
import { useTradeStore, usePriceStore } from '@/store';
import { useStoreHydration } from '@/hooks';
import { TradeFilters } from '@/types';
import {
  formatCurrency,
  formatPercent,
  formatPrice,
  formatShares,
  formatHoldTime,
  calculateHoldTime,
  isWinningTrade,
} from '@/lib/calculations';
import { format } from 'date-fns';
import { EmptyState } from '@/components/UI';

interface TradesPanelProps {
  onSelectTrade?: (id: string) => void;
}

export default function TradesPanel({ onSelectTrade }: TradesPanelProps) {
  const storeHydrated = useStoreHydration();
  const trades = useTradeStore((state) => state.trades);
  const deleteTrade = useTradeStore((state) => state.deleteTrade);
  const prices = usePriceStore((state) => state.prices);

  const [filters, setFilters] = useState<TradeFilters>({
    dateRange: { start: null, end: null },
    ticker: null,
    status: 'all',
    outcome: 'all',
    holdDuration: { min: null, max: null },
  });

  const [sortBy, setSortBy] = useState<'date' | 'pnl' | 'ticker'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const filteredTrades = useMemo(() => {
    let result = [...trades];
    if (filters.status !== 'all') result = result.filter((t) => t.status === filters.status);
    if (filters.outcome !== 'all') {
      result = result.filter((t) => {
        if (t.status === 'open') return false;
        return filters.outcome === 'win' ? isWinningTrade(t) : !isWinningTrade(t);
      });
    }
    if (filters.ticker)
      result = result.filter((t) =>
        t.ticker.toLowerCase().includes(filters.ticker!.toLowerCase())
      );

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'date':
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'pnl':
          cmp = a.realizedPnL - b.realizedPnL;
          break;
        case 'ticker':
          cmp = a.ticker.localeCompare(b.ticker);
          break;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [trades, filters, sortBy, sortOrder]);

  const handleSort = (col: 'date' | 'pnl' | 'ticker') => {
    if (sortBy === col) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else {
      setSortBy(col);
      setSortOrder('desc');
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this trade?')) deleteTrade(id);
  };

  if (!storeHydrated) {
    return (
      <div className="flex items-center justify-center h-[300px] text-gray-500">
        <span className="animate-pulse">Loading trades...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="card-body">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="label">Status</label>
              <select
                value={filters.status}
                onChange={(e) =>
                  setFilters({ ...filters, status: e.target.value as 'all' | 'open' | 'closed' })
                }
                className="input w-full"
              >
                <option value="all">All</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div>
              <label className="label">Outcome</label>
              <select
                value={filters.outcome}
                onChange={(e) =>
                  setFilters({ ...filters, outcome: e.target.value as 'all' | 'win' | 'loss' })
                }
                className="input w-full"
              >
                <option value="all">All</option>
                <option value="win">Winners</option>
                <option value="loss">Losers</option>
              </select>
            </div>
            <div>
              <label className="label">Ticker</label>
              <input
                type="text"
                placeholder="Search..."
                value={filters.ticker || ''}
                onChange={(e) => setFilters({ ...filters, ticker: e.target.value || null })}
                className="input w-full"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() =>
                  setFilters({
                    dateRange: { start: null, end: null },
                    ticker: null,
                    status: 'all',
                    outcome: 'all',
                    holdDuration: { min: null, max: null },
                  })
                }
                className="btn btn-ghost w-full"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card hidden md:block">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>
                  <button
                    onClick={() => handleSort('date')}
                    className="flex items-center gap-1 hover:text-white"
                  >
                    Date {sortBy === 'date' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </button>
                </th>
                <th>
                  <button
                    onClick={() => handleSort('ticker')}
                    className="flex items-center gap-1 hover:text-white"
                  >
                    Ticker {sortBy === 'ticker' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </button>
                </th>
                <th>Status</th>
                <th>Shares</th>
                <th>Avg Cost</th>
                <th>Current / Exit</th>
                <th>
                  <button
                    onClick={() => handleSort('pnl')}
                    className="flex items-center gap-1 hover:text-white"
                  >
                    P&L {sortBy === 'pnl' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </button>
                </th>
                <th>Hold Time</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrades.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-gray-500">
                    No trades found
                  </td>
                </tr>
              ) : (
                filteredTrades.map((trade) => {
                  const currentPrice = prices[trade.ticker]?.price;
                  const pnl =
                    trade.status === 'closed'
                      ? trade.realizedPnL
                      : currentPrice
                      ? (currentPrice - trade.avgCost) * trade.totalShares
                      : 0;
                  const isProfit = pnl >= 0;
                  const holdTime = calculateHoldTime(trade);

                  return (
                    <tr key={trade.id}>
                      <td className="font-mono text-xs">
                        {format(new Date(trade.createdAt), 'MMM dd, yyyy HH:mm')}
                      </td>
                      <td className="font-medium text-white">{trade.ticker}</td>
                      <td>
                        <span
                          className={`badge ${
                            trade.status === 'open' ? 'badge-accent' : 'badge-neutral'
                          }`}
                        >
                          {trade.status}
                        </span>
                      </td>
                      <td className="font-mono">{formatShares(trade.totalShares)}</td>
                      <td className="font-mono">{formatPrice(trade.avgCost)}</td>
                      <td className="font-mono">
                        {trade.status === 'closed'
                          ? trade.exits.length > 0
                            ? formatPrice(
                                trade.exits.reduce((s, e) => s + e.price * e.shares, 0) /
                                  trade.exits.reduce((s, e) => s + e.shares, 0)
                              )
                            : '--'
                          : currentPrice
                          ? formatPrice(currentPrice)
                          : '--'}
                      </td>
                      <td
                        className={`font-mono ${isProfit ? 'text-profit' : 'text-loss'}`}
                      >
                        <div>{formatCurrency(pnl)}</div>
                        {trade.avgCost > 0 && (
                          <div className="text-xs">
                            {formatPercent((pnl / (trade.avgCost * trade.totalShares)) * 100)}
                          </div>
                        )}
                      </td>
                      <td className="text-gray-400 text-xs">{formatHoldTime(holdTime)}</td>
                      <td>
                        <div className="flex items-center gap-3 text-xs">
                          {onSelectTrade ? (
                            <button
                              onClick={() => onSelectTrade(trade.id)}
                              className="text-accent-light hover:brightness-125"
                            >
                              View
                            </button>
                          ) : (
                            <a
                              href={`/trades/${trade.id}`}
                              className="text-accent-light hover:brightness-125"
                            >
                              View
                            </a>
                          )}
                          <button
                            onClick={() => handleDelete(trade.id)}
                            className="text-loss hover:text-loss-light"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="md:hidden space-y-3">
        {filteredTrades.length === 0 ? (
          <div className="card card-body text-center py-8 text-gray-500">No trades found</div>
        ) : (
          filteredTrades.map((trade) => {
            const currentPrice = prices[trade.ticker]?.price;
            const pnl =
              trade.status === 'closed'
                ? trade.realizedPnL
                : currentPrice
                ? (currentPrice - trade.avgCost) * trade.totalShares
                : 0;
            const isProfit = pnl >= 0;
            return (
              <div key={trade.id} className="card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{trade.ticker}</span>
                    <span
                      className={`badge ${
                        trade.status === 'open' ? 'badge-accent' : 'badge-neutral'
                      }`}
                    >
                      {trade.status}
                    </span>
                  </div>
                  <div className={`text-right ${isProfit ? 'text-profit' : 'text-loss'}`}>
                    <div className="font-mono font-bold">{formatCurrency(pnl)}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase">Shares</div>
                    <div className="font-mono">{formatShares(trade.totalShares)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase">Avg Cost</div>
                    <div className="font-mono">{formatPrice(trade.avgCost)}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-white/5 text-xs">
                  <span className="text-gray-500">
                    {format(new Date(trade.createdAt), 'MMM dd HH:mm')}
                  </span>
                  <div className="flex items-center gap-3">
                    {onSelectTrade ? (
                      <button
                        onClick={() => onSelectTrade(trade.id)}
                        className="text-accent-light"
                      >
                        View
                      </button>
                    ) : (
                      <a href={`/trades/${trade.id}`} className="text-accent-light">
                        View
                      </a>
                    )}
                    <button onClick={() => handleDelete(trade.id)} className="text-loss">
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="text-xs text-gray-500">
        Showing {filteredTrades.length} of {trades.length} trades
      </div>
    </div>
  );
}
