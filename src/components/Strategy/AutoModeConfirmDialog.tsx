'use client';

import { useState } from 'react';
import { Strategy } from '@/types/strategy';
import { describeCondition } from '@/lib/strategy/conditions';

const REQUIRED_PHRASE = 'I UNDERSTAND';

interface Props {
  strategy: Strategy;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function AutoModeConfirmDialog({ strategy, onConfirm, onCancel }: Props) {
  const [typed, setTyped] = useState('');
  const matches = typed.trim().toUpperCase() === REQUIRED_PHRASE;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="glass-strong rounded-2xl shadow-glow w-full max-w-xl border-2 border-loss/60 overflow-hidden">
        <div className="px-6 py-4 bg-loss/10 border-b border-loss/30">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-loss">
            Real money mode
          </div>
          <div className="mt-1 text-2xl font-bold text-white">
            Enable auto-execute for "{strategy.name}"?
          </div>
        </div>

        <div className="px-6 py-4 space-y-3 text-sm text-gray-300">
          <p>
            Once enabled, this strategy will <strong className="text-white">place real orders
            in your Schwab account automatically</strong> whenever its conditions fire. No
            human approval per trade.
          </p>

          <div className="rounded-lg p-3 bg-white/[0.03] border border-white/5 text-xs space-y-1">
            <div className="text-[10px] uppercase tracking-widest text-gray-500">
              About to go live
            </div>
            <div className="font-mono text-gray-200">
              {strategy.ticker} ·{' '}
              {strategy.size.kind === 'shares' ? `${strategy.size.n} shares` : `risk ${strategy.size.pct}%`}{' '}
              · cooldown {strategy.cooldownMinutes}m
            </div>
            <div className="font-mono text-gray-400 mt-1">
              <span className="text-profit">ENTRY</span>: {describeCondition(strategy.entry.when)}
            </div>
            <div className="font-mono text-gray-400">
              <span className="text-loss">EXIT</span>: {describeCondition(strategy.exit.when)}
            </div>
            {strategy.stopLoss?.pct && (
              <div className="font-mono text-gray-400">
                <span className="text-neutral">STOP</span>: price ≤ entry × {(1 - strategy.stopLoss.pct / 100).toFixed(4)}
              </div>
            )}
          </div>

          <div className="rounded-lg p-3 bg-loss/10 border border-loss/30 text-xs space-y-2">
            <div className="font-semibold text-loss uppercase tracking-widest text-[10px]">
              Risks you're acknowledging
            </div>
            <ul className="list-disc list-inside space-y-1 text-gray-300">
              <li>
                Leveraged ETFs (3x) move 3x as fast in <strong>both</strong> directions. Bad
                conditions = fast losses.
              </li>
              <li>
                <strong>No broker-side safety stop is submitted yet</strong> (Sprint 6). If the
                engine crashes after a buy fills, your position is unprotected until manual exit.
              </li>
              <li>
                Auto orders use a 0.2% marketable buffer — fills are typically tight, but extreme
                spreads can cost more than expected.
              </li>
              <li>
                Your <strong>strategy's exit/stop conditions are evaluated client-side</strong>.
                If the browser tab is closed and you have no broker-side stop, exits won't fire.
              </li>
              <li>
                You can flip this back to paper or hit the global kill switch any time, but
                pending orders already at the broker remain live.
              </li>
            </ul>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-gray-500 block mb-1">
              Type <code className="text-loss font-bold">{REQUIRED_PHRASE}</code> to confirm
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="input w-full font-mono"
              autoFocus
              placeholder={REQUIRED_PHRASE}
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex items-center gap-3 justify-end">
          <button onClick={onCancel} className="btn btn-ghost">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!matches}
            className={`btn ${matches ? 'btn-danger' : 'btn-ghost opacity-50'}`}
          >
            Enable auto-execute
          </button>
        </div>
      </div>
    </div>
  );
}
