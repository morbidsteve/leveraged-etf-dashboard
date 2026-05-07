'use client';

import { useMemo, useState } from 'react';
import { useStrategyStore } from '@/store';

/**
 * Always-visible kill switch in the top bar. Halts every strategy currently
 * in `auto` mode by switching them to `paper` (the safest fallback). Sound +
 * any in-flight orders already at the broker remain — this stops *future*
 * auto fires; it does NOT cancel orders Schwab already accepted.
 */
export default function KillSwitch() {
  const strategies = useStrategyStore((s) => s.strategies);
  const updateStrategy = useStrategyStore((s) => s.updateStrategy);
  const appendEvents = useStrategyStore((s) => s.appendEvents);
  const [confirming, setConfirming] = useState(false);

  const liveAuto = useMemo(
    () => strategies.filter((s) => s.mode === 'auto' && s.enabled),
    [strategies]
  );

  if (liveAuto.length === 0) return null;

  const handleKill = () => {
    const now = new Date();
    for (const s of liveAuto) {
      updateStrategy(s.id, { mode: 'paper', enabled: false });
    }
    appendEvents(
      liveAuto.map((s) => ({
        strategyId: s.id,
        timestamp: now,
        type: 'state_change' as const,
        detail: 'KILL SWITCH — auto execution halted, mode reverted to paper',
      }))
    );
    setConfirming(false);
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 border-loss/60 bg-loss/15">
        <span className="text-xs uppercase tracking-widest text-loss font-bold">Halt {liveAuto.length}?</span>
        <button
          onClick={handleKill}
          className="text-xs px-2 py-0.5 rounded bg-loss text-white font-bold uppercase tracking-wide"
        >
          Yes
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs text-gray-400 hover:text-white px-2 py-0.5"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-loss/40 bg-loss/10 hover:bg-loss/20 transition group"
      title="Halt all auto-executing strategies"
    >
      <svg
        className="w-4 h-4 text-loss"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.5}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      <div className="flex flex-col items-start leading-tight">
        <span className="text-[9px] uppercase tracking-widest text-loss font-bold">
          Kill all auto
        </span>
        <span className="text-[10px] text-gray-400 font-mono">
          {liveAuto.length} live
        </span>
      </div>
    </button>
  );
}
