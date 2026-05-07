'use client';

import { useState, useMemo } from 'react';
import { calculateDCA, formatCurrency, formatPrice, formatShares } from '@/lib/calculations';
import { usePriceData, useStoreHydration } from '@/hooks';
import { useTradeStore } from '@/store';

const QUICK_SHARES = [100, 250, 500, 1000];

interface CalculatorPanelProps {
  defaultTicker?: string;
}

export default function CalculatorPanel({ defaultTicker = 'SOXL' }: CalculatorPanelProps) {
  const storeHydrated = useStoreHydration();
  const [currentShares, setCurrentShares] = useState<number>(0);
  const [currentAvgCost, setCurrentAvgCost] = useState<number>(0);
  const [newShares, setNewShares] = useState<number>(0);
  const [newPrice, setNewPrice] = useState<number>(0);

  const { priceData } = usePriceData({
    ticker: defaultTicker,
    refreshInterval: 1000,
    enabled: storeHydrated,
  });

  const trades = useTradeStore((state) => state.trades);
  const openTrades = useMemo(() => trades.filter((t) => t.status === 'open'), [trades]);

  const result = useMemo(() => {
    if (currentShares === 0 && newShares === 0) return null;
    return calculateDCA({ currentShares, currentAvgCost, newShares, newPrice });
  }, [currentShares, currentAvgCost, newShares, newPrice]);

  const useMarketPrice = () => {
    if (priceData?.price) setNewPrice(priceData.price);
  };

  const loadFromPosition = (tradeId: string) => {
    const trade = openTrades.find((t) => t.id === tradeId);
    if (trade) {
      setCurrentShares(trade.totalShares);
      setCurrentAvgCost(trade.avgCost);
    }
  };

  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-header">
            <h2 className="font-medium text-white">Calculate New Average</h2>
          </div>
          <div className="card-body space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Current Position
                </h3>
                {openTrades.length > 0 && (
                  <select
                    onChange={(e) => loadFromPosition(e.target.value)}
                    className="input text-xs py-1"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Load from position
                    </option>
                    {openTrades.map((trade) => (
                      <option key={trade.id} value={trade.id}>
                        {trade.ticker} - {trade.totalShares}@{formatPrice(trade.avgCost)}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Current Shares</label>
                  <input
                    type="number"
                    value={currentShares || ''}
                    onChange={(e) => setCurrentShares(Number(e.target.value))}
                    className="input w-full font-mono"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="label">Avg Cost</label>
                  <input
                    type="number"
                    step="0.01"
                    value={currentAvgCost || ''}
                    onChange={(e) => setCurrentAvgCost(Number(e.target.value))}
                    className="input w-full font-mono"
                    placeholder="$0.00"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-white/5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  New Purchase
                </h3>
                {priceData && (
                  <button
                    onClick={useMarketPrice}
                    className="text-xs text-accent-light hover:brightness-125"
                  >
                    Use market ({formatPrice(priceData.price)})
                  </button>
                )}
              </div>

              <div>
                <label className="label">New Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={newPrice || ''}
                  onChange={(e) => setNewPrice(Number(e.target.value))}
                  className="input w-full font-mono"
                  placeholder="$0.00"
                />
              </div>

              <div>
                <label className="label">New Shares</label>
                <input
                  type="number"
                  value={newShares || ''}
                  onChange={(e) => setNewShares(Number(e.target.value))}
                  className="input w-full font-mono"
                  placeholder="0"
                />
                <div className="flex gap-2 mt-2">
                  {QUICK_SHARES.map((qty) => (
                    <button
                      key={qty}
                      onClick={() => setNewShares(qty)}
                      className="btn btn-ghost text-xs py-1 px-2"
                    >
                      {qty}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setCurrentShares(0);
                setCurrentAvgCost(0);
                setNewShares(0);
                setNewPrice(0);
              }}
              className="btn btn-ghost w-full"
            >
              Reset Calculator
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="font-medium text-white">Results</h2>
          </div>
          <div className="card-body">
            {result ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-white/[0.03] border border-white/5 rounded-lg">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                      Total Shares
                    </div>
                    <div className="text-xl font-bold font-mono text-white">
                      {formatShares(result.resultShares)}
                    </div>
                  </div>
                  <div className="p-3 bg-white/[0.03] border border-white/5 rounded-lg">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                      Total Invested
                    </div>
                    <div className="text-xl font-bold font-mono text-white">
                      {formatCurrency(result.totalInvested)}
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-accent/10 border border-accent/30 rounded-lg">
                  <div className="text-xs text-accent-light mb-1 uppercase tracking-wider">
                    New Average Cost
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold font-mono text-white">
                      {formatPrice(result.resultAvgCost)}
                    </span>
                    <button
                      onClick={() => copyToClipboard(result.resultAvgCost.toFixed(2))}
                      className="btn btn-ghost p-1.5"
                      title="Copy"
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
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Profit Targets
                  </h3>

                  {[
                    { label: '1.5% Target', target: result.resultTarget15 },
                    { label: '2% Target', target: result.resultTarget20 },
                  ].map(({ label, target }) => (
                    <div
                      key={label}
                      className="p-4 bg-profit/10 border border-profit/30 rounded-lg"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[10px] text-profit uppercase tracking-wider">
                            {label}
                          </div>
                          <div className="text-xl font-bold font-mono text-white">
                            {formatPrice(target)}
                          </div>
                        </div>
                        <button
                          onClick={() => copyToClipboard(target.toFixed(2))}
                          className="btn btn-ghost p-1.5"
                          title="Copy"
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
                              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                          </svg>
                        </button>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Profit:{' '}
                        {formatCurrency(result.resultShares * (target - result.resultAvgCost))}
                      </div>
                    </div>
                  ))}
                </div>

                {currentAvgCost > 0 && newShares > 0 && (
                  <div className="pt-4 border-t border-white/5">
                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                      Cost Basis Change
                    </h3>
                    <div className="flex items-center gap-2 font-mono text-sm">
                      <span>{formatPrice(currentAvgCost)}</span>
                      <svg
                        className="w-4 h-4 text-gray-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 7l5 5m0 0l-5 5m5-5H6"
                        />
                      </svg>
                      <span>{formatPrice(result.resultAvgCost)}</span>
                      <span
                        className={
                          result.resultAvgCost < currentAvgCost ? 'text-profit' : 'text-loss'
                        }
                      >
                        ({result.resultAvgCost < currentAvgCost ? '-' : '+'}
                        {formatPrice(Math.abs(result.resultAvgCost - currentAvgCost))})
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 text-sm">
                Enter position details to calculate
              </div>
            )}
          </div>
        </div>
      </div>

      {currentShares > 0 && currentAvgCost > 0 && priceData?.price && (
        <div className="card">
          <div className="card-header">
            <h2 className="font-medium text-white">What-If Scenarios</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Add Shares</th>
                  <th>At Price</th>
                  <th>New Avg Cost</th>
                  <th>1.5% Target</th>
                  <th>2% Target</th>
                  <th>Total Investment</th>
                </tr>
              </thead>
              <tbody>
                {QUICK_SHARES.map((shares) => {
                  const scenario = calculateDCA({
                    currentShares,
                    currentAvgCost,
                    newShares: shares,
                    newPrice: priceData.price,
                  });
                  return (
                    <tr key={shares}>
                      <td className="font-mono">{formatShares(shares)}</td>
                      <td className="font-mono">{formatPrice(priceData.price)}</td>
                      <td className="font-mono">{formatPrice(scenario.resultAvgCost)}</td>
                      <td className="font-mono text-profit">
                        {formatPrice(scenario.resultTarget15)}
                      </td>
                      <td className="font-mono text-profit">
                        {formatPrice(scenario.resultTarget20)}
                      </td>
                      <td className="font-mono">{formatCurrency(scenario.totalInvested)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
