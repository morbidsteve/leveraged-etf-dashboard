'use client';

import { useMemo, useState } from 'react';
import { useTradeStore, usePriceStore } from '@/store';
import { suggestHarvest } from '@/lib/tax';
import { formatCurrency, formatPrice } from '@/lib/calculations';

/**
 * Tax-loss harvesting suggestions card. Lives in Settings → Data
 * alongside the Tax Tools card.
 *
 * Surfaces open positions in unrealized loss above a configurable
 * threshold, flags wash-sale risk, recommends candidates to harvest.
 */
export default function TaxHarvestCard() {
  const trades = useTradeStore((s) => s.trades);
  const prices = usePriceStore((s) => s.prices);
  const [minLoss, setMinLoss] = useState(200);
  const [longTermOnly, setLongTermOnly] = useState(false);

  const suggestions = useMemo(
    () =>
      suggestHarvest({
        trades,
        prices: Object.fromEntries(
          Object.entries(prices).map(([t, p]) => [t, { price: p.price }])
        ),
        minLoss,
        longTermOnly,
      }),
    [trades, prices, minLoss, longTermOnly]
  );

  if (trades.filter((t) => t.status === 'open').length === 0) {
    return null;
  }

  const totalHarvestable = suggestions
    .filter((s) => s.recommended)
    .reduce((sum, s) => sum + Math.abs(s.unrealizedLoss), 0);

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="font-medium text-white">Tax-loss harvest suggestions</h2>
        <p className="text-[11px] text-gray-500 mt-1">
          Open positions in unrealized loss that could be harvested to
          offset gains. Warns when a wash-sale is likely (you bought
          within the past 30 days).
        </p>
      </div>
      <div className="card-body space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs flex items-center gap-2">
            <span className="text-gray-400">Min loss</span>
            <input
              type="number"
              value={minLoss}
              onChange={(e) => setMinLoss(Math.max(0, Number(e.target.value)))}
              className="input text-xs py-1 w-24 font-mono"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={longTermOnly}
              onChange={(e) => setLongTermOnly(e.target.checked)}
            />
            <span className="text-gray-300">Long-term only</span>
          </label>
          {suggestions.filter((s) => s.recommended).length > 0 && (
            <span className="text-[11px] text-amber-300 font-mono ml-auto">
              ${totalHarvestable.toFixed(2)} harvestable across{' '}
              {suggestions.filter((s) => s.recommended).length} positions
            </span>
          )}
        </div>

        {suggestions.length === 0 ? (
          <div className="text-xs text-gray-500 italic">
            No open positions in loss above the threshold.
          </div>
        ) : (
          <div className="space-y-2">
            {suggestions.map((s) => (
              <div
                key={s.ticker}
                className={`rounded-lg border p-2.5 ${
                  s.recommended
                    ? 'border-profit/30 bg-profit/5'
                    : 'border-amber-400/30 bg-amber-500/5'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{s.ticker}</span>
                      <span className="text-[9px] uppercase tracking-widest text-gray-500">
                        {s.longTerm ? 'LT' : 'ST'} · {Math.floor(s.daysHeld)}d held
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-300 font-mono mt-0.5">
                      {s.shares} shares · avg ${s.avgCost.toFixed(2)} → live $
                      {s.currentPrice.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-gray-300 mt-1">{s.reason}</div>
                    {s.warnings.map((w, i) => (
                      <div key={i} className="text-[10px] text-amber-300 mt-1">
                        ⚠ {w}
                      </div>
                    ))}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-loss font-mono font-semibold">
                      {formatCurrency(s.unrealizedLoss)}
                    </div>
                    <div className="text-[9px] uppercase tracking-widest text-gray-500">
                      {s.recommended ? 'recommended' : 'wait 30d'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
