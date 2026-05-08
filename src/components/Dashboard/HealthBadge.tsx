'use client';

import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/store';

interface HealthSnapshot {
  ok: boolean;
  uptimeSec: number;
  schwabConnected: boolean;
  chatProvider: 'openai' | 'anthropic' | 'none';
  finnhubConfigured: boolean;
  nodeVersion: string;
  ts: string;
}

/**
 * Header health-status pill. Polls /api/health every 30s and exposes
 * the master kill-switch toggle. Click to expand a detail popover
 * showing each integration's status.
 */
export default function HealthBadge() {
  const [snap, setSnap] = useState<HealthSnapshot | null>(null);
  const [open, setOpen] = useState(false);
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const killSwitch = settings.killSwitch ?? false;

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch('/api/health');
        const data = await r.json();
        if (alive) setSnap(data);
      } catch {
        if (alive) setSnap({ ok: false } as HealthSnapshot);
      }
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const status: 'green' | 'amber' | 'red' = !snap
    ? 'amber'
    : !snap.ok
    ? 'red'
    : killSwitch
    ? 'amber'
    : 'green';

  const label = killSwitch ? 'KILL' : snap?.ok ? 'OK' : '?';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`text-[10px] uppercase tracking-widest font-mono px-2 py-1 rounded border flex items-center gap-1.5 transition-colors ${
          status === 'green'
            ? 'bg-profit/10 border-profit/30 text-profit hover:bg-profit/20'
            : status === 'amber'
            ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 hover:bg-amber-500/20'
            : 'bg-loss/10 border-loss/40 text-loss hover:bg-loss/20'
        }`}
        title="System health and kill-switch"
      >
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${
            status === 'green'
              ? 'bg-profit animate-pulse'
              : status === 'amber'
              ? 'bg-amber-400'
              : 'bg-loss'
          }`}
        />
        {label}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 z-50 card text-xs">
          <div className="card-header">
            <h3 className="font-semibold text-white text-sm">System health</h3>
            {snap && (
              <p className="text-[10px] text-gray-500 mt-0.5">
                Uptime {Math.floor(snap.uptimeSec / 60)}m · Node {snap.nodeVersion}
              </p>
            )}
          </div>
          <div className="card-body space-y-2">
            {snap && (
              <>
                <Row label="Schwab" status={snap.schwabConnected ? 'on' : 'off'} />
                <Row
                  label="LLM chat"
                  status={snap.chatProvider !== 'none' ? 'on' : 'off'}
                  detail={snap.chatProvider !== 'none' ? snap.chatProvider : 'no key'}
                />
                <Row
                  label="Finnhub"
                  status={snap.finnhubConfigured ? 'on' : 'off'}
                />
              </>
            )}
            <div className="pt-2 mt-2 border-t border-white/10">
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <div>
                  <div className="font-semibold text-white">Kill switch</div>
                  <div className="text-[10px] text-gray-500">
                    Block all auto-mode Schwab orders. Engine keeps evaluating
                    and notifying.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={killSwitch}
                  onChange={(e) =>
                    updateSettings({ killSwitch: e.target.checked })
                  }
                  className="w-4 h-4 accent-loss shrink-0"
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  status,
  detail,
}: {
  label: string;
  status: 'on' | 'off';
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{label}</span>
      <span
        className={`text-[10px] uppercase tracking-widest font-mono px-1.5 py-0.5 rounded ${
          status === 'on'
            ? 'bg-profit/15 text-profit border border-profit/30'
            : 'bg-gray-700/30 text-gray-500 border border-gray-600/30'
        }`}
      >
        {status === 'on' ? '● ' + (detail ?? 'on') : '○ off'}
      </span>
    </div>
  );
}
