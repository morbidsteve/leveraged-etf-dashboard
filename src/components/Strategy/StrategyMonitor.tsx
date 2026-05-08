'use client';

import { useMemo } from 'react';
import { useStrategyStore, usePaperStore, usePriceStore } from '@/store';
import { runtimeKey, StrategyRuntime } from '@/types/strategy';
import { formatCurrency, formatPrice } from '@/lib/calculations';
import { format } from 'date-fns';
import { EmptyState } from '@/components/UI';
import { describeCondition } from '@/lib/strategy/conditions';

/**
 * Live cross-strategy monitor — answers the user's question:
 * "where do I see live situations with my strategies?"
 *
 * Renders a row per (strategy, ticker) with the current state, RSI value,
 * live price, open P&L, last fired event, and any in-progress paper position.
 * Sorted with hottest situations on top: in_position > armed-near-threshold >
 * armed > cooldown > idle.
 */
export default function StrategyMonitor() {
  const strategies = useStrategyStore((s) => s.strategies);
  const runtimes = useStrategyStore((s) => s.runtimes);
  const events = useStrategyStore((s) => s.events);
  const paperOpen = usePaperStore((s) => s.open);
  const paperClosed = usePaperStore((s) => s.closed);
  const prices = usePriceStore((s) => s.prices);
  const rsiData = usePriceStore((s) => s.rsiData);

  const rows = useMemo(() => {
    const out: Array<{
      strategyId: string;
      strategyName: string;
      mode: string;
      ticker: string;
      enabled: boolean;
      runtime: StrategyRuntime;
      rsi: number | null;
      rsiOversold: number;
      rsiOverbought: number;
      price: number | null;
      openEntryPrice: number | null;
      openShares: number | null;
      openPnL: number;
      paperClosedCount: number;
      paperClosedPnL: number;
      lastEventAt: Date | null;
      lastEventDetail: string | null;
    }> = [];

    for (const strategy of strategies) {
      const rsiCfg = strategy.rsiConfig ?? { period: 250, oversold: 50, overbought: 55 };
      for (const ticker of strategy.tickers) {
        const rt = runtimes[runtimeKey(strategy.id, ticker)];
        if (!rt) continue;
        const open = paperOpen.find((p) => p.strategyId === strategy.id && p.ticker === ticker);
        const closedForPair = paperClosed.filter(
          (t) => t.strategyId === strategy.id && t.ticker === ticker
        );
        const live = prices[ticker];
        const rsi = rsiData[ticker]?.value ?? null;
        const openPnL = open && live ? (live.price - open.entryPrice) * open.shares : 0;
        const lastEvent = [...events]
          .reverse()
          .find((e) => e.strategyId === strategy.id && e.detail.includes(`[${ticker}]`));

        out.push({
          strategyId: strategy.id,
          strategyName: strategy.name,
          mode: strategy.mode,
          ticker,
          enabled: strategy.enabled,
          runtime: rt,
          rsi,
          rsiOversold: rsiCfg.oversold,
          rsiOverbought: rsiCfg.overbought,
          price: live?.price ?? null,
          openEntryPrice: open?.entryPrice ?? null,
          openShares: open?.shares ?? null,
          openPnL,
          paperClosedCount: closedForPair.length,
          paperClosedPnL: closedForPair.reduce((s, t) => s + t.realizedPnL, 0),
          lastEventAt: lastEvent ? new Date(lastEvent.timestamp) : null,
          lastEventDetail: lastEvent?.detail ?? null,
        });
      }
    }

    // Sort: hottest first. in_position > armed (close to threshold) > armed > cooldown > idle.
    out.sort((a, b) => {
      const score = (r: typeof a) => {
        if (!r.enabled) return 99;
        if (r.runtime.state === 'in_position') return 0;
        if (r.runtime.state === 'armed') {
          // Closer to oversold = higher priority (lower score)
          if (r.rsi != null) {
            const dist = Math.min(
              Math.abs(r.rsi - r.rsiOversold),
              Math.abs(r.rsi - r.rsiOverbought)
            );
            return 1 + dist / 100;
          }
          return 1.5;
        }
        if (r.runtime.state === 'cooldown') return 2;
        return 3;
      };
      return score(a) - score(b);
    });

    return out;
  }, [strategies, runtimes, paperOpen, paperClosed, prices, rsiData, events]);

  if (strategies.length === 0) {
    return (
      <EmptyState
        icon="strategies"
        title="No strategies to monitor"
        description="Create a strategy first, then this view shows you live state across every (strategy, ticker) combination."
      />
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon="strategies"
        title="No strategies are enabled"
        description="Toggle a strategy on in the Strategies drawer to see it here."
      />
    );
  }

  // Aggregate stats at the top
  const livePositions = rows.filter((r) => r.runtime.state === 'in_position').length;
  const armed = rows.filter((r) => r.runtime.state === 'armed' && r.enabled).length;
  const totalOpenPnL = rows.reduce((s, r) => s + r.openPnL, 0);
  const totalClosedPnL = rows.reduce((s, r) => s + r.paperClosedPnL, 0);

  return (
    <div className="space-y-4">
      {/* Aggregate */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Active rows" value={`${rows.length}`} />
        <Stat
          label="In position"
          value={`${livePositions}`}
          tone={livePositions > 0 ? 'profit' : undefined}
        />
        <Stat label="Armed" value={`${armed}`} />
        <Stat
          label="Open + closed paper P&L"
          value={formatCurrency(totalOpenPnL + totalClosedPnL)}
          tone={totalOpenPnL + totalClosedPnL >= 0 ? 'profit' : 'loss'}
        />
      </div>

      <p className="text-xs text-gray-500">
        One row per (strategy × ticker). Sorted with hottest first — in-position trades and
        armed strategies near their RSI threshold rise to the top. Live values refresh with
        the polling cadence shown in the top bar.
      </p>

      {/* Rows */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>State</th>
                <th>Strategy</th>
                <th>Ticker</th>
                <th>Price</th>
                <th>RSI</th>
                <th>Open position</th>
                <th>Closed paper</th>
                <th>Last event</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const stateColor =
                  !r.enabled
                    ? 'text-gray-500'
                    : r.runtime.state === 'in_position'
                    ? 'text-profit'
                    : r.runtime.state === 'armed'
                    ? 'text-accent-light'
                    : r.runtime.state === 'cooldown'
                    ? 'text-neutral'
                    : 'text-gray-500';
                const rsiTone =
                  r.rsi == null
                    ? 'text-gray-500'
                    : r.rsi < r.rsiOversold
                    ? 'text-profit'
                    : r.rsi > r.rsiOverbought
                    ? 'text-loss'
                    : 'text-neutral';
                return (
                  <tr key={`${r.strategyId}-${r.ticker}`}>
                    <td className={`text-xs uppercase tracking-wider font-semibold ${stateColor}`}>
                      {r.enabled ? r.runtime.state.replace('_', ' ') : 'disabled'}
                      {r.mode === 'auto' && (
                        <span className="ml-1.5 badge badge-loss text-[9px]">AUTO</span>
                      )}
                    </td>
                    <td className="text-xs text-white truncate max-w-[200px]">
                      {r.strategyName}
                    </td>
                    <td className="font-mono text-sm text-white">{r.ticker}</td>
                    <td className="font-mono text-xs text-gray-200">
                      {r.price != null ? `$${formatPrice(r.price)}` : '—'}
                    </td>
                    <td className={`font-mono text-xs ${rsiTone}`}>
                      {r.rsi != null ? r.rsi.toFixed(1) : '—'}
                      <span className="text-[9px] text-gray-600 ml-1">
                        / {r.rsiOversold}-{r.rsiOverbought}
                      </span>
                    </td>
                    <td className="font-mono text-xs">
                      {r.openShares != null && r.openEntryPrice != null ? (
                        <div className="flex items-center gap-2">
                          <div>
                            <div>
                              {r.openShares} @ {formatPrice(r.openEntryPrice)}
                            </div>
                            <div className={r.openPnL >= 0 ? 'text-profit' : 'text-loss'}>
                              {r.openPnL >= 0 ? '+' : ''}
                              {formatCurrency(r.openPnL)}
                            </div>
                          </div>
                          <button
                            onClick={() =>
                              window.dispatchEvent(
                                new CustomEvent('etf-open-position-modal', {
                                  detail: {
                                    kind: 'paper',
                                    strategyId: r.strategyId,
                                    ticker: r.ticker,
                                  },
                                })
                              )
                            }
                            className="text-[9px] uppercase tracking-widest text-gray-500 hover:text-white px-1.5 py-0.5 rounded border border-white/10 hover:border-accent/40 transition shrink-0"
                            title="Close paper position"
                          >
                            Close
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="font-mono text-xs">
                      <div className={r.paperClosedPnL >= 0 ? 'text-profit' : 'text-loss'}>
                        {formatCurrency(r.paperClosedPnL)}
                      </div>
                      <div className="text-[9px] text-gray-500">
                        {r.paperClosedCount} trade{r.paperClosedCount === 1 ? '' : 's'}
                      </div>
                    </td>
                    <td className="text-[10px] text-gray-400 max-w-[260px] truncate">
                      {r.lastEventAt ? (
                        <>
                          <span className="text-gray-500 mr-1.5 font-mono">
                            {format(r.lastEventAt, 'HH:mm:ss')}
                          </span>
                          {r.lastEventDetail?.replace(`[${r.ticker}]`, '').trim()}
                        </>
                      ) : (
                        <span className="text-gray-600">no events yet</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'profit' | 'loss';
}) {
  const cls =
    tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-white';
  return (
    <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/5">
      <div className="text-[9px] text-gray-500 uppercase tracking-widest">{label}</div>
      <div className={`text-base font-bold font-mono mt-0.5 ${cls}`}>{value}</div>
    </div>
  );
}

// Imported here so the file is self-contained (we don't actually use it but
// avoid pruning if some tooling expects it)
export { describeCondition };
