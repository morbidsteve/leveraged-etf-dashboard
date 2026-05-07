'use client';

import { useEffect, useState } from 'react';
import { Action, Strategy } from '@/types/strategy';
import { formatCurrency, formatPrice } from '@/lib/calculations';

interface PendingAction {
  action: Action;
  strategy: Strategy;
  livePrice: number;
}

interface Props {
  pending: PendingAction | null;
  onConfirm: (pa: PendingAction) => void;
  onCancel: (pa: PendingAction) => void;
}

const AUTO_DISMISS_MS = 30_000;

export default function StrategyConfirmModal({ pending, onConfirm, onCancel }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(AUTO_DISMISS_MS / 1000);

  useEffect(() => {
    if (!pending) return;
    setSecondsLeft(AUTO_DISMISS_MS / 1000);
    const start = Date.now();
    const t = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, AUTO_DISMISS_MS - elapsed);
      setSecondsLeft(Math.ceil(remaining / 1000));
      if (remaining <= 0) {
        clearInterval(t);
        onCancel(pending);
      }
    }, 200);
    return () => clearInterval(t);
  }, [pending, onCancel]);

  if (!pending) return null;
  const { action, strategy, livePrice } = pending;
  const isBuy = action.kind === 'enter';

  // ToS-paste-ready order ticket
  const ticket = buildTicket(action, livePrice);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(ticket);
    } catch {
      // best effort
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        className={`glass-strong rounded-2xl shadow-glow w-full max-w-lg overflow-hidden border-2 ${
          isBuy ? 'border-profit/60' : 'border-loss/60'
        }`}
      >
        <div
          className={`px-6 py-4 ${
            isBuy ? 'bg-profit/10' : 'bg-loss/10'
          } border-b border-white/10`}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                {strategy.name}
              </div>
              <div
                className={`mt-1 text-3xl font-bold tracking-tight ${
                  isBuy ? 'text-profit' : 'text-loss'
                }`}
              >
                {isBuy ? 'BUY' : 'SELL'} {action.ticker}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-gray-500 uppercase tracking-widest">
                Auto-cancel
              </div>
              <div className="font-mono text-2xl font-bold text-white">{secondsLeft}s</div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Row label="Shares" value={action.shares.toString()} />
            <Row label="Live price" value={formatPrice(livePrice)} />
            {action.kind === 'exit' && action.limitPrice !== undefined && (
              <Row
                label="Target limit"
                value={formatPrice(action.limitPrice)}
                accent={isBuy ? 'profit' : 'profit'}
              />
            )}
            <Row
              label="Notional"
              value={formatCurrency(livePrice * action.shares)}
            />
            <Row label="Mode" value={strategy.mode} />
            <Row label="Order type" value={action.orderType} />
          </div>

          <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
              Reason
            </div>
            <div className="text-sm text-gray-300">{action.reason}</div>
          </div>

          <div className="rounded-lg border border-white/5 bg-black/30 p-3 font-mono text-xs text-gray-300 whitespace-pre-wrap">
            {ticket}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex items-center gap-3">
          <button
            onClick={() => onCancel(pending)}
            className="btn btn-ghost flex-1"
          >
            Skip
          </button>
          <button onClick={handleCopy} className="btn btn-outline flex-1">
            Copy ticket
          </button>
          <button
            onClick={() => onConfirm(pending)}
            className={`btn flex-1 ${isBuy ? 'btn-success' : 'btn-danger'}`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'profit' | 'loss';
}) {
  const cls =
    accent === 'profit' ? 'text-profit' : accent === 'loss' ? 'text-loss' : 'text-white';
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-widest text-gray-500">{label}</span>
      <span className={`font-mono ${cls}`}>{value}</span>
    </div>
  );
}

function buildTicket(action: Action, livePrice: number): string {
  const side = action.kind === 'enter' ? 'BUY' : 'SELL';
  const limit =
    action.kind === 'exit' && action.orderType === 'resting_limit' && action.limitPrice
      ? action.limitPrice
      : action.kind === 'enter'
      ? livePrice * 1.002 // ask + ~0.2% buffer for marketable buy
      : livePrice * 0.998;

  return [
    `${side} ${action.shares} ${action.ticker}`,
    `LIMIT @ $${limit.toFixed(2)}`,
    `DAY  TIF`,
    `// reason: ${action.reason}`,
  ].join('\n');
}
