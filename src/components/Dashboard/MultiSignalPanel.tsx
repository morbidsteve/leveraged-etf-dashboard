'use client';

import { useMemo } from 'react';
import { usePriceStore, useSettingsStore } from '@/store';
import { getRSIStatus } from '@/lib/rsi';
import { calculateRSI } from '@/lib/rsi';

/**
 * Multi-ticker signal panel for the dashboard top-right. Replaces the
 * single-ticker SignalBadge that only ever showed the currently
 * selected chart ticker's status.
 *
 * Shows EVERY watchlist ticker's RSI signal at a glance. The currently-
 * selected ticker is highlighted at the top; others are listed below
 * with sortable BUY → SELL → NEUTRAL ordering so actionable signals
 * float to the top.
 */
export default function MultiSignalPanel({
  onSelectTicker,
}: {
  onSelectTicker: (t: string) => void;
}) {
  const candles = usePriceStore((s) => s.candles);
  const prices = usePriceStore((s) => s.prices);
  const selectedTicker = usePriceStore((s) => s.selectedTicker);
  const rsiConfig = useSettingsStore((s) => s.settings.rsiConfig);
  const watchlist = useSettingsStore((s) => s.settings.watchlist) ?? [];

  const items = useMemo(() => {
    return watchlist.map((ticker) => {
      const tickerCandles = candles[ticker];
      const tickerPrice = prices[ticker];
      let rsiValue: number | null = null;
      let status: 'buy' | 'sell' | 'neutral' = 'neutral';
      if (tickerCandles && tickerCandles.length >= rsiConfig.period + 1) {
        const rsi = calculateRSI(tickerCandles, rsiConfig.period);
        if (rsi.length > 0) {
          rsiValue = rsi[rsi.length - 1];
          status = getRSIStatus(rsiValue, rsiConfig);
        }
      }
      return {
        ticker,
        rsiValue,
        status,
        price: tickerPrice?.price,
        change: tickerPrice?.changePercent,
      };
    });
  }, [watchlist, candles, prices, rsiConfig]);

  // Sort: selected first, then BUY > SELL > NEUTRAL, then by ticker name
  const sorted = useMemo(() => {
    const order: Record<'buy' | 'sell' | 'neutral', number> = {
      buy: 0,
      sell: 1,
      neutral: 2,
    };
    return [...items].sort((a, b) => {
      if (a.ticker === selectedTicker) return -1;
      if (b.ticker === selectedTicker) return 1;
      return order[a.status] - order[b.status] || a.ticker.localeCompare(b.ticker);
    });
  }, [items, selectedTicker]);

  const buyCount = items.filter((i) => i.status === 'buy').length;
  const sellCount = items.filter((i) => i.status === 'sell').length;

  return (
    <div className="card">
      <div className="card-body">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            Signals · all watchlist
          </div>
          <div className="text-[9px] font-mono text-gray-500">
            {buyCount > 0 && <span className="text-profit mr-2">{buyCount} BUY</span>}
            {sellCount > 0 && <span className="text-loss">{sellCount} SELL</span>}
          </div>
        </div>
        {sorted.length === 0 ? (
          <div className="text-xs text-gray-500 italic py-2">No watchlist tickers</div>
        ) : (
          <div className="space-y-1">
            {sorted.map((item) => (
              <SignalRow
                key={item.ticker}
                {...item}
                isSelected={item.ticker === selectedTicker}
                onClick={() => onSelectTicker(item.ticker)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SignalRow({
  ticker,
  rsiValue,
  status,
  price,
  change,
  isSelected,
  onClick,
}: {
  ticker: string;
  rsiValue: number | null;
  status: 'buy' | 'sell' | 'neutral';
  price?: number;
  change?: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const statusColor =
    status === 'buy'
      ? 'text-profit bg-profit/10 border-profit/30'
      : status === 'sell'
      ? 'text-loss bg-loss/10 border-loss/30'
      : 'text-gray-500 bg-white/[0.03] border-white/10';

  const statusLabel =
    status === 'buy' ? 'BUY' : status === 'sell' ? 'SELL' : '—';

  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded border transition ${
        isSelected
          ? 'bg-accent/10 border-accent/40'
          : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04] hover:border-white/15'
      }`}
    >
      <span
        className={`text-[9px] font-mono font-bold tracking-widest px-1.5 py-0.5 rounded border min-w-[36px] text-center ${statusColor}`}
      >
        {statusLabel}
      </span>
      <span
        className={`text-xs font-bold ${
          isSelected ? 'text-accent-light' : 'text-white'
        }`}
      >
        {ticker}
      </span>
      <span className="text-[10px] font-mono text-gray-400 ml-auto">
        {rsiValue != null ? rsiValue.toFixed(1) : '—'}
      </span>
      {price != null && (
        <span className="text-[10px] font-mono text-gray-300 min-w-[60px] text-right">
          ${price.toFixed(2)}
        </span>
      )}
      {change != null && (
        <span
          className={`text-[10px] font-mono min-w-[44px] text-right ${
            change >= 0 ? 'text-profit' : 'text-loss'
          }`}
        >
          {change >= 0 ? '+' : ''}
          {change.toFixed(2)}%
        </span>
      )}
    </button>
  );
}
