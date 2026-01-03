'use client';

import { useMemo } from 'react';
import { Trade, PriceData } from '@/types';
import { getOpenPosition, formatCurrency, formatPercent, formatPrice, formatShares } from '@/lib/calculations';

interface OpenPositionsProps {
  trades: Trade[];
  prices: Record<string, PriceData>;
}

export default function OpenPositions({ trades, prices }: OpenPositionsProps) {
  const openTrades = useMemo(() => {
    return trades.filter(t => t.status === 'open');
  }, [trades]);

  if (openTrades.length === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <h3 className="font-medium text-white">Open Positions</h3>
        </div>
        <div className="card-body">
          <p className="text-gray-500 text-center py-8">No open positions</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="font-medium text-white">Open Positions</h3>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Shares</th>
              <th>Avg Cost</th>
              <th>Current</th>
              <th>P&L</th>
              <th>Target 1.5%</th>
              <th>Target 2%</th>
            </tr>
          </thead>
          <tbody>
            {openTrades.map((trade) => {
              const currentPrice = prices[trade.ticker]?.price || trade.avgCost;
              const position = getOpenPosition(trade, currentPrice);
              const isProfit = position.unrealizedPnL >= 0;

              return (
                <tr key={trade.id}>
                  <td className="font-medium text-white">{trade.ticker}</td>
                  <td className="font-mono">{formatShares(trade.totalShares)}</td>
                  <td className="font-mono">{formatPrice(trade.avgCost)}</td>
                  <td className="font-mono">{formatPrice(currentPrice)}</td>
                  <td className={`font-mono ${isProfit ? 'text-profit' : 'text-loss'}`}>
                    <div>{formatCurrency(position.unrealizedPnL)}</div>
                    <div className="text-xs">{formatPercent(position.unrealizedPnLPercent)}</div>
                  </td>
                  <td>
                    <div className="font-mono">{formatPrice(position.target15)}</div>
                    <div className="text-xs text-gray-500">
                      {position.distanceToTarget15 > 0 ? (
                        <span className="text-neutral">
                          {formatPrice(position.distanceToTarget15)} away
                        </span>
                      ) : (
                        <span className="text-profit">Target reached!</span>
                      )}
                    </div>
                    <ProgressBar
                      current={currentPrice}
                      start={trade.avgCost}
                      end={position.target15}
                    />
                  </td>
                  <td>
                    <div className="font-mono">{formatPrice(position.target20)}</div>
                    <div className="text-xs text-gray-500">
                      {position.distanceToTarget20 > 0 ? (
                        <span className="text-neutral">
                          {formatPrice(position.distanceToTarget20)} away
                        </span>
                      ) : (
                        <span className="text-profit">Target reached!</span>
                      )}
                    </div>
                    <ProgressBar
                      current={currentPrice}
                      start={trade.avgCost}
                      end={position.target20}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden p-4 space-y-4">
        {openTrades.map((trade) => {
          const currentPrice = prices[trade.ticker]?.price || trade.avgCost;
          const position = getOpenPosition(trade, currentPrice);
          const isProfit = position.unrealizedPnL >= 0;

          return (
            <div key={trade.id} className="bg-dark-bg rounded-lg p-4 space-y-3">
              {/* Header with ticker and P&L */}
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-white">{trade.ticker}</span>
                <div className={`text-right ${isProfit ? 'text-profit' : 'text-loss'}`}>
                  <div className="font-mono font-bold">{formatCurrency(position.unrealizedPnL)}</div>
                  <div className="text-xs">{formatPercent(position.unrealizedPnLPercent)}</div>
                </div>
              </div>

              {/* Position details */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-gray-500">Shares</div>
                  <div className="font-mono text-white">{formatShares(trade.totalShares)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Avg Cost</div>
                  <div className="font-mono text-white">{formatPrice(trade.avgCost)}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-xs text-gray-500">Current Price</div>
                  <div className="font-mono text-white text-lg">{formatPrice(currentPrice)}</div>
                </div>
              </div>

              {/* Targets */}
              <div className="space-y-2 pt-2 border-t border-dark-border">
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <span className="text-xs text-gray-500">Target 1.5%: </span>
                    <span className="font-mono text-profit">{formatPrice(position.target15)}</span>
                  </div>
                  <span className="text-xs text-neutral">
                    {position.distanceToTarget15 > 0 ? `${formatPrice(position.distanceToTarget15)} away` : 'Reached!'}
                  </span>
                </div>
                <ProgressBar
                  current={currentPrice}
                  start={trade.avgCost}
                  end={position.target15}
                />

                <div className="flex items-center justify-between text-sm mt-2">
                  <div>
                    <span className="text-xs text-gray-500">Target 2%: </span>
                    <span className="font-mono text-profit">{formatPrice(position.target20)}</span>
                  </div>
                  <span className="text-xs text-neutral">
                    {position.distanceToTarget20 > 0 ? `${formatPrice(position.distanceToTarget20)} away` : 'Reached!'}
                  </span>
                </div>
                <ProgressBar
                  current={currentPrice}
                  start={trade.avgCost}
                  end={position.target20}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ProgressBarProps {
  current: number;
  start: number;
  end: number;
}

function ProgressBar({ current, start, end }: ProgressBarProps) {
  const range = end - start;
  const progress = range > 0 ? Math.min(100, Math.max(0, ((current - start) / range) * 100)) : 0;

  let color = 'bg-gray-500';
  if (progress >= 100) {
    color = 'bg-profit';
  } else if (progress >= 50) {
    color = 'bg-neutral';
  }

  return (
    <div className="progress-bar mt-1">
      <div
        className={`progress-bar-fill ${color}`}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
