'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAlertStore } from '@/store';
import { format } from 'date-fns';

/**
 * Floating toast that surfaces the most recent unacknowledged alert.
 * Auto-dismisses after 12s; user can click to dismiss sooner or open the alerts panel.
 */
export default function AlertToast({ onOpenPanel }: { onOpenPanel?: () => void }) {
  const alerts = useAlertStore((s) => s.alerts);
  const acknowledgeAlert = useAlertStore((s) => s.acknowledgeAlert);
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  const latest = useMemo(() => {
    return [...alerts]
      .filter((a) => !a.acknowledged && a.id !== dismissedId)
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )[0];
  }, [alerts, dismissedId]);

  // Auto-dismiss after 12s
  useEffect(() => {
    if (!latest) return;
    const t = setTimeout(() => setDismissedId(latest.id), 12_000);
    return () => clearTimeout(t);
  }, [latest]);

  if (!latest) return null;

  const isBuy = latest.type === 'rsi_oversold' || latest.type === 'price_target_15' || latest.type === 'price_target_20';
  const accent = isBuy ? 'border-profit/50 bg-profit/10' : 'border-loss/50 bg-loss/10';
  const dotColor = isBuy ? 'bg-profit' : 'bg-loss';

  return (
    <div className="fixed top-20 right-4 lg:right-6 z-40 max-w-sm">
      <div
        className={`glass-strong border ${accent} rounded-xl shadow-glow p-4 space-y-2 animate-pulse-slow`}
        style={{ animationDuration: '2s' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <span className={`mt-1.5 inline-block w-2 h-2 rounded-full ${dotColor}`} />
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                {isBuy ? 'Buy signal' : 'Sell signal'}
              </div>
              <div className="font-bold text-white text-base tracking-tight">{latest.ticker}</div>
            </div>
          </div>
          <button
            onClick={() => {
              acknowledgeAlert(latest.id);
              setDismissedId(latest.id);
            }}
            className="text-gray-500 hover:text-white"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-gray-300 leading-relaxed">{latest.message}</p>
        <div className="flex items-center justify-between text-[10px] text-gray-500 pt-1 border-t border-white/5">
          <span>{format(new Date(latest.timestamp), 'HH:mm:ss')}</span>
          {onOpenPanel && (
            <button
              onClick={() => {
                onOpenPanel();
                setDismissedId(latest.id);
              }}
              className="text-accent-light hover:brightness-125 uppercase tracking-wide"
            >
              View all
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
