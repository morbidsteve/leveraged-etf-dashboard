'use client';

import { useEffect, useState } from 'react';
import { useTradeStore, usePaperStore, usePriceStore } from '@/store';
import { showToast } from '@/components/UI';
import { formatCurrency, formatPrice, formatPercent } from '@/lib/calculations';

export type ManualPositionTarget = {
  kind: 'manual';
  tradeId: string;
};
export type PaperPositionTarget = {
  kind: 'paper';
  strategyId: string;
  ticker: string;
};

export type PositionActionTarget = ManualPositionTarget | PaperPositionTarget;

interface Props {
  target: PositionActionTarget | null;
  onClose: () => void;
}

/**
 * Shared modal for closing or adjusting a position. Triggered from any
 * surface that lists open positions (CompactPositions on the dashboard,
 * paper position rows in JournalPanel / StrategyMonitor / StrategiesPanel).
 *
 * Manual trades support partial closes (Close half / custom share count)
 * and broker-routed sells when Schwab is connected. Paper positions
 * close-all only — they're virtual and atomic.
 *
 * Broker safety: the "Send to broker" toggle starts off. When on, a
 * confirmation checkbox must be ticked before the SELL button is enabled.
 * Reuses /api/schwab/orders/place which has its own server-side guardrails
 * + audit log.
 */
export default function PositionActionModal({ target, onClose }: Props) {
  const trades = useTradeStore((s) => s.trades);
  const addExit = useTradeStore((s) => s.addExit);
  const updateTrade = useTradeStore((s) => s.updateTrade);
  const closePosition = usePaperStore((s) => s.closePosition);
  const open = usePaperStore((s) => s.open);
  const prices = usePriceStore((s) => s.prices);

  const [shares, setShares] = useState('');
  const [stopDraft, setStopDraft] = useState('');
  const [useBroker, setUseBroker] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [schwabConnected, setSchwabConnected] = useState(false);

  // Resolve the underlying position
  const manualTrade =
    target?.kind === 'manual' ? trades.find((t) => t.id === target.tradeId) : null;
  const paperEntry =
    target?.kind === 'paper'
      ? open.find((p) => p.strategyId === target.strategyId && p.ticker === target.ticker)
      : null;

  const ticker = manualTrade?.ticker ?? paperEntry?.ticker ?? '';
  const totalShares = manualTrade?.totalShares ?? paperEntry?.shares ?? 0;
  const entryPrice = manualTrade?.avgCost ?? paperEntry?.entryPrice ?? 0;
  const livePrice = prices[ticker]?.price ?? entryPrice;

  const sharesNum = Number(shares) || 0;
  const validShares = sharesNum > 0 && sharesNum <= totalShares;
  const unrealizedPnL = (livePrice - entryPrice) * totalShares;
  const unrealizedPct = entryPrice > 0 ? ((livePrice - entryPrice) / entryPrice) * 100 : 0;
  const isProfit = unrealizedPnL >= 0;

  // Reset on open / target change
  useEffect(() => {
    if (target) {
      setShares(totalShares.toString());
      setStopDraft(manualTrade?.stopPrice?.toString() ?? '');
      setUseBroker(false);
      setConfirmed(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.kind, target?.kind === 'manual' ? target.tradeId : target?.kind === 'paper' ? `${target.strategyId}:${target.ticker}` : null]);

  // Schwab status check (only when modal opens for a manual trade)
  useEffect(() => {
    if (!target || target.kind !== 'manual') return;
    fetch('/api/schwab/status', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setSchwabConnected(!!d?.connected))
      .catch(() => setSchwabConnected(false));
  }, [target?.kind]);

  // Esc to close
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, onClose]);

  if (!target) return null;
  if (!manualTrade && !paperEntry) {
    // Position no longer exists (race) — auto-close
    setTimeout(() => onClose(), 0);
    return null;
  }

  const handleClose = async (closeShares: number, reason: string) => {
    if (closeShares <= 0) return;
    setSubmitting(true);
    try {
      if (target.kind === 'paper' && paperEntry) {
        const trade = closePosition(
          target.strategyId,
          target.ticker,
          livePrice,
          new Date(),
          reason
        );
        if (trade) {
          showToast(
            `Closed paper ${target.ticker} · ${formatCurrency(trade.realizedPnL)}`,
            trade.realizedPnL >= 0 ? 'success' : 'info'
          );
        }
      } else if (target.kind === 'manual' && manualTrade) {
        // Optional broker leg — submitted FIRST so we don't journal a fill
        // we never actually placed.
        if (useBroker) {
          const resp = await fetch('/api/schwab/orders/place', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'exit_signal',
              symbol: manualTrade.ticker,
              shares: closeShares,
              livePrice,
            }),
          });
          const data = await resp.json();
          if (!resp.ok) {
            showToast(
              `Broker rejected: ${data.error ?? 'unknown'}`,
              'error',
              5000
            );
            setSubmitting(false);
            return;
          }
          showToast(`Broker order submitted (#${data.orderId ?? 'pending'})`, 'success');
        }
        addExit(manualTrade.id, {
          date: new Date(),
          price: livePrice,
          shares: closeShares,
        });
        const partial = closeShares < totalShares;
        showToast(
          `${partial ? 'Partial close' : 'Closed'} ${manualTrade.ticker} · ${closeShares} @ ${formatPrice(livePrice)}`
        );
      }
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to close', 'error', 5000);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdjustStop = () => {
    if (target.kind !== 'manual' || !manualTrade) return;
    const v = stopDraft.trim();
    const parsed = v ? Number(v) : undefined;
    updateTrade(manualTrade.id, {
      stopPrice: parsed && parsed > 0 ? parsed : undefined,
    });
    showToast(parsed ? `Stop updated to ${formatPrice(parsed)}` : 'Stop cleared');
  };

  const brokerActive = target.kind === 'manual' && useBroker;
  const sellDisabled =
    submitting || !validShares || (brokerActive && !confirmed);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`glass-strong rounded-2xl w-full max-w-md shadow-glow overflow-hidden ${
          brokerActive ? 'border-2 border-loss/60' : 'border border-white/10'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-white/10 flex items-start justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500 font-mono">
              {target.kind === 'paper' ? 'Paper position' : 'Position'}
            </div>
            <div className="text-xl font-bold text-white tracking-tight">{ticker}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 -mr-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Position summary */}
        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <SummaryStat label="Shares" value={totalShares.toString()} />
            <SummaryStat label="Avg cost" value={formatPrice(entryPrice)} />
            <SummaryStat label="Current" value={formatPrice(livePrice)} />
            <SummaryStat
              label="Unrealized"
              value={`${formatCurrency(unrealizedPnL)} (${formatPercent(unrealizedPct)})`}
              color={isProfit ? 'profit' : 'loss'}
            />
          </div>

          {/* Share-count input (manual only — paper is atomic close-all) */}
          {target.kind === 'manual' && (
            <div>
              <label className="text-[10px] uppercase tracking-widest text-gray-500 block mb-1">
                Shares to close
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={totalShares}
                  step={1}
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                  className="input flex-1 text-sm py-1.5 font-mono"
                />
                <button
                  onClick={() => setShares(Math.floor(totalShares / 2).toString())}
                  className="btn btn-ghost text-xs"
                >
                  Half
                </button>
                <button
                  onClick={() => setShares(totalShares.toString())}
                  className="btn btn-ghost text-xs"
                >
                  All
                </button>
              </div>
              {!validShares && shares !== '' && (
                <div className="text-[10px] text-loss mt-1">
                  Must be 1–{totalShares}
                </div>
              )}
            </div>
          )}

          {/* Stop adjustment (manual only) */}
          {target.kind === 'manual' && manualTrade && (
            <div className="pt-2 border-t border-white/5">
              <label className="text-[10px] uppercase tracking-widest text-gray-500 block mb-1">
                Adjust stop
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  value={stopDraft}
                  onChange={(e) => setStopDraft(e.target.value)}
                  placeholder={manualTrade.stopPrice ? `${manualTrade.stopPrice}` : 'No stop set'}
                  className="input flex-1 text-sm py-1.5 font-mono text-loss"
                />
                <button onClick={handleAdjustStop} className="btn btn-outline text-xs">
                  Save stop
                </button>
              </div>
              <div className="text-[10px] text-gray-500 mt-1">
                Empty + Save clears the stop. This is a soft stop tracked in the
                journal; for a broker-side stop, use the strategy safety stop.
              </div>
            </div>
          )}

          {/* Broker toggle (manual + connected) */}
          {target.kind === 'manual' && (
            <div className="pt-2 border-t border-white/5 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useBroker}
                  disabled={!schwabConnected}
                  onChange={(e) => {
                    setUseBroker(e.target.checked);
                    if (!e.target.checked) setConfirmed(false);
                  }}
                />
                <span className={`text-sm ${schwabConnected ? 'text-white' : 'text-gray-500'}`}>
                  Send sell order to Schwab broker
                </span>
              </label>
              {!schwabConnected && (
                <div className="text-[10px] text-gray-500 ml-6">
                  Schwab not connected — close will only journal locally. Connect
                  in Settings → Broker to enable real orders.
                </div>
              )}
              {brokerActive && (
                <div className="rounded-lg p-2.5 bg-loss/10 border border-loss/40 ml-6 space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-loss">
                    Real money confirmation
                  </div>
                  <div className="text-[11px] text-gray-300">
                    A marketable LIMIT sell for{' '}
                    <strong className="font-mono text-white">{sharesNum} {ticker}</strong> will hit
                    Schwab. Server guardrails still apply (per-order cap,
                    daily count, allowlist).
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    <span className="text-[11px] text-loss">
                      I confirm submitting this real order
                    </span>
                  </label>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="px-5 py-3 bg-white/[0.02] border-t border-white/10 flex items-center gap-2">
          <button
            onClick={onClose}
            className="btn btn-ghost text-sm"
            disabled={submitting}
          >
            Cancel
          </button>
          <div className="flex-1" />
          {target.kind === 'paper' ? (
            <button
              onClick={() => handleClose(totalShares, 'Manual paper close')}
              disabled={submitting}
              className="btn btn-primary text-sm"
            >
              {submitting ? 'Closing…' : 'Close paper position'}
            </button>
          ) : (
            <>
              <button
                onClick={() =>
                  handleClose(
                    Math.floor(totalShares / 2),
                    'Manual partial close'
                  )
                }
                disabled={submitting || totalShares < 2}
                className="btn btn-outline text-sm"
              >
                Close half
              </button>
              <button
                onClick={() => handleClose(sharesNum, 'Manual close')}
                disabled={sellDisabled}
                className={`btn text-sm ${
                  brokerActive ? 'btn-danger' : 'btn-primary'
                }`}
              >
                {submitting
                  ? 'Selling…'
                  : sharesNum === totalShares
                  ? 'Close all'
                  : `Sell ${sharesNum}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: 'profit' | 'loss';
}) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-widest text-gray-500">{label}</div>
      <div
        className={`font-mono text-sm font-semibold mt-0.5 ${
          color === 'profit'
            ? 'text-profit'
            : color === 'loss'
            ? 'text-loss'
            : 'text-white'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
