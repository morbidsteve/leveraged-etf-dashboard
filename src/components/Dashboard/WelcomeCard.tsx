'use client';

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'etf-welcome-dismissed';

interface Props {
  /** True when the user has no strategies, trades, or paper history. */
  show: boolean;
  onOpenStrategies: () => void;
  onOpenBacktest: () => void;
  onOpenSettings: () => void;
}

/**
 * First-run welcome card. Tells a brand-new user (zero strategies, zero
 * trades) what to do first. Persists dismissal in localStorage so it
 * doesn't reappear after they close it.
 */
export default function WelcomeCard({
  show,
  onOpenStrategies,
  onOpenBacktest,
  onOpenSettings,
}: Props) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(localStorage.getItem(STORAGE_KEY) === '1');
  }, []);

  if (!show || dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setDismissed(true);
  };

  return (
    <div className="card border-accent/40 mb-4 overflow-hidden">
      <div className="card-body bg-glass-radial relative">
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 text-gray-500 hover:text-white p-1"
          title="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-start gap-4">
          <div className="hidden sm:flex w-12 h-12 rounded-full bg-accent/15 border border-accent/30 items-center justify-center shrink-0">
            <svg className="w-6 h-6 text-accent-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-accent-light font-semibold">
              Welcome
            </div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white mt-0.5">
              Build your first strategy in 3 steps
            </h2>
            <p className="text-sm text-gray-400 mt-1 leading-relaxed">
              The dashboard is wired up — your watchlist, charts, and signal radar are live.
              The composable strategy engine is what turns this into an autopilot. Start in
              paper mode (virtual fills, no broker needed).
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
              <Step
                number={1}
                title="Create a strategy"
                body="Pick a template (e.g. RSI 50 cross + 1.5% target) or build from scratch."
                ctaLabel="+ New strategy"
                onClick={onOpenStrategies}
                primary
              />
              <Step
                number={2}
                title="Validate with backtest"
                body="Run the same conditions on the last week or month of historical data."
                ctaLabel="Run backtest"
                onClick={onOpenBacktest}
              />
              <Step
                number={3}
                title="Watch it fire"
                body="Toggle the strategy on. Browser notifications + sound when conditions hit."
                ctaLabel="Notification permission"
                onClick={onOpenSettings}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({
  number,
  title,
  body,
  ctaLabel,
  onClick,
  primary,
}: {
  number: number;
  title: string;
  body: string;
  ctaLabel: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <div className="rounded-lg p-3 bg-white/[0.03] border border-white/5 flex flex-col">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] uppercase tracking-widest text-gray-500 font-mono">
          Step {number}
        </span>
      </div>
      <div className="font-semibold text-white text-sm">{title}</div>
      <p className="text-xs text-gray-400 mt-1 leading-relaxed flex-1">{body}</p>
      <button
        onClick={onClick}
        className={`mt-2 text-xs ${primary ? 'btn btn-primary py-1.5' : 'btn btn-outline py-1.5'}`}
      >
        {ctaLabel}
      </button>
    </div>
  );
}
