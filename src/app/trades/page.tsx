'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/Layout';
import { useTradeStore, usePriceStore } from '@/store';
import { Trade, TradeFilters } from '@/types';
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

export default function TradesPage() {
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

    // Filter by status
    if (filters.status !== 'all') {
      result = result.filter((t) => t.status === filters.status);
    }

    // Filter by outcome
    if (filters.outcome !== 'all') {
      result = result.filter((t) => {
        if (t.status === 'open') return false;
        return filters.outcome === 'win' ? isWinningTrade(t) : !isWinningTrade(t);
      });
    }

    // Filter by ticker
    if (filters.ticker) {
      result = result.filter((t) => t.ticker.toLowerCase().includes(filters.ticker!.toLowerCase()));
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'pnl':
          comparison = a.realizedPnL - b.realizedPnL;
          break;
        case 'ticker':
          comparison = a.ticker.localeCompare(b.ticker);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [trades, filters, sortBy, sortOrder]);

  const handleSort = (column: 'date' | 'pnl' | 'ticker') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this trade?')) {
      deleteTrade(id);
    }
  };

  return (
    <MainLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Trade History</h1>
        <Link href="/trades/new" className="btn btn-primary">
          + New Trade
        </Link>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="card-body">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label className="label">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value as 'all' | 'open' | 'closed' })}
                className="input"
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
                onChange={(e) => setFilters({ ...filters, outcome: e.target.value as 'all' | 'win' | 'loss' })}
                className="input"
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
                className="input"
              />
            </div>

            <div className="ml-auto">
              <button
                onClick={() => setFilters({
                  dateRange: { start: null, end: null },
                  ticker: null,
                  status: 'all',
                  outcome: 'all',
                  holdDuration: { min: null, max: null },
                })}
                className="btn btn-ghost"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Trade Table */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>
                  <button
                    onClick={() => handleSort('date')}
                    className="flex items-center gap-1 hover:text-white"
                  >
                    Date
                    {sortBy === 'date' && (
                      <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </button>
                </th>
                <th>
                  <button
                    onClick={() => handleSort('ticker')}
                    className="flex items-center gap-1 hover:text-white"
                  >
                    Ticker
                    {sortBy === 'ticker' && (
                      <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
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
                    P&L
                    {sortBy === 'pnl' && (
                      <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
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
                  const pnl = trade.status === 'closed'
                    ? trade.realizedPnL
                    : currentPrice
                      ? (currentPrice - trade.avgCost) * trade.totalShares
                      : 0;
                  const isProfit = pnl >= 0;
                  const holdTime = calculateHoldTime(trade);

                  return (
                    <tr key={trade.id}>
                      <td className="font-mono text-sm">
                        {format(new Date(trade.createdAt), 'MMM dd, yyyy HH:mm')}
                      </td>
                      <td className="font-medium text-white">{trade.ticker}</td>
                      <td>
                        <span className={`badge ${trade.status === 'open' ? 'badge-neutral' : 'bg-gray-700 text-gray-300'}`}>
                          {trade.status}
                        </span>
                      </td>
                      <td className="font-mono">{formatShares(trade.totalShares)}</td>
                      <td className="font-mono">{formatPrice(trade.avgCost)}</td>
                      <td className="font-mono">
                        {trade.status === 'closed'
                          ? trade.exits.length > 0
                            ? formatPrice(trade.exits.reduce((sum, e) => sum + e.price * e.shares, 0) / trade.exits.reduce((sum, e) => sum + e.shares, 0))
                            : '--'
                          : currentPrice
                            ? formatPrice(currentPrice)
                            : '--'
                        }
                      </td>
                      <td className={`font-mono ${isProfit ? 'text-profit' : 'text-loss'}`}>
                        <div>{formatCurrency(pnl)}</div>
                        {trade.avgCost > 0 && (
                          <div className="text-xs">
                            {formatPercent((pnl / (trade.avgCost * trade.totalShares)) * 100)}
                          </div>
                        )}
                      </td>
                      <td className="text-gray-400">{formatHoldTime(holdTime)}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/trades/${trade.id}`}
                            className="text-blue-400 hover:text-blue-300"
                          >
                            View
                          </Link>
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

      {/* Summary */}
      <div className="mt-6 text-sm text-gray-500">
        Showing {filteredTrades.length} of {trades.length} trades
      </div>
    </MainLayout>
  );
}
