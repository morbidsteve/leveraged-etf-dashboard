'use client';

import { useEffect, useState, useCallback } from 'react';

interface SchwabStatus {
  connected: boolean;
  oauthConfigured: boolean;
  accessTokenExpiresInSec: number | null;
  refreshTokenExpiresInSec: number | null;
  needsReauth: boolean;
  scope?: string;
}

export default function SchwabConnectCard() {
  const [status, setStatus] = useState<SchwabStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/schwab/status', { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = (await r.json()) as SchwabStatus;
      setStatus(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 60_000);
    return () => clearInterval(t);
  }, [fetchStatus]);

  // Surface ?schwab=connected / ?schwab=error from the OAuth callback redirect
  useEffect(() => {
    const url = new URL(window.location.href);
    const flag = url.searchParams.get('schwab');
    if (flag) {
      // Refresh status, then strip the query param
      fetchStatus();
      url.searchParams.delete('schwab');
      url.searchParams.delete('reason');
      window.history.replaceState({}, '', url.toString());
    }
  }, [fetchStatus]);

  const handleConnect = () => {
    window.location.href = '/api/schwab/authorize';
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Schwab? You will need to log in again to reconnect.')) return;
    await fetch('/api/schwab/disconnect', { method: 'POST' });
    fetchStatus();
  };

  if (loading) {
    return (
      <div className="card card-body text-sm text-gray-500">Checking Schwab connection…</div>
    );
  }

  if (error || !status) {
    return (
      <div className="card border-loss/40 card-body text-sm text-loss">
        Couldn't load Schwab status: {error}
      </div>
    );
  }

  if (!status.oauthConfigured) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="font-medium text-white">Schwab — broker connection</h2>
        </div>
        <div className="card-body space-y-3">
          <div className="text-sm text-gray-300">
            Schwab OAuth isn't configured yet. Once you have your developer-portal app
            approved, set these env vars on the host (write them to{' '}
            <code className="text-accent-light">.env</code> next to{' '}
            <code className="text-accent-light">docker-compose.yml</code> and rebuild):
          </div>
          <pre className="text-[11px] font-mono bg-black/40 border border-white/5 rounded-lg p-3 overflow-x-auto text-gray-300">
{`SCHWAB_CLIENT_ID=your_app_key
SCHWAB_CLIENT_SECRET=your_app_secret
SCHWAB_REDIRECT_URI=https://your-tunnel-domain/api/schwab/callback
SCHWAB_TOKEN_ENCRYPTION_KEY=<32+ random chars; openssl rand -hex 32>`}
          </pre>
          <div className="text-[11px] text-gray-500 leading-relaxed">
            The redirect URI must match what you registered in the Schwab dashboard
            exactly (case + trailing slash sensitive). Tokens are encrypted at rest in a
            persistent docker volume — they survive container rebuilds.
          </div>
        </div>
      </div>
    );
  }

  if (!status.connected) {
    return (
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h2 className="font-medium text-white">Schwab — broker connection</h2>
          <span className="badge badge-neutral">Not connected</span>
        </div>
        <div className="card-body space-y-3">
          <div className="text-sm text-gray-300">
            OAuth is configured. Click below to authorize this app to read your Schwab
            account. You'll be redirected to Schwab to log in and approve.
          </div>
          <button onClick={handleConnect} className="btn btn-primary text-sm">
            Connect Schwab
          </button>
          <div className="text-[11px] text-gray-500 leading-relaxed">
            Schwab refresh tokens last 7 days — you'll need to repeat this auth roughly
            once a week (Schwab's rule, not ours; no documented workaround). Access
            tokens auto-refresh every ~25 minutes inside that window.
          </div>
        </div>
      </div>
    );
  }

  // Connected
  const refreshDays =
    status.refreshTokenExpiresInSec !== null
      ? Math.floor(status.refreshTokenExpiresInSec / 86400)
      : null;
  const refreshHours =
    status.refreshTokenExpiresInSec !== null
      ? Math.floor((status.refreshTokenExpiresInSec % 86400) / 3600)
      : null;
  const accessMin =
    status.accessTokenExpiresInSec !== null
      ? Math.max(0, Math.floor(status.accessTokenExpiresInSec / 60))
      : null;
  const reauthSoon =
    status.refreshTokenExpiresInSec !== null && status.refreshTokenExpiresInSec < 86400;

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <h2 className="font-medium text-white">Schwab — broker connection</h2>
        {status.needsReauth ? (
          <span className="badge badge-loss">Re-auth needed</span>
        ) : reauthSoon ? (
          <span className="badge badge-neutral">Re-auth soon</span>
        ) : (
          <span className="badge badge-profit">Connected</span>
        )}
      </div>
      <div className="card-body space-y-3">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <Stat
            label="Access token"
            value={accessMin !== null ? `${accessMin} min remaining` : '—'}
            hint="auto-refreshed every ~25 min"
          />
          <Stat
            label="Refresh token"
            value={
              refreshDays !== null && refreshHours !== null
                ? `${refreshDays}d ${refreshHours}h remaining`
                : '—'
            }
            hint="7-day cap, no extension possible"
            tone={status.needsReauth ? 'loss' : reauthSoon ? 'neutral' : undefined}
          />
        </div>
        <div className="flex items-center gap-2">
          {status.needsReauth && (
            <button onClick={handleConnect} className="btn btn-primary text-sm">
              Re-authorize
            </button>
          )}
          <button onClick={handleDisconnect} className="btn btn-ghost text-sm">
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'profit' | 'loss' | 'neutral';
}) {
  const cls =
    tone === 'profit'
      ? 'text-profit'
      : tone === 'loss'
      ? 'text-loss'
      : tone === 'neutral'
      ? 'text-neutral'
      : 'text-white';
  return (
    <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5">
      <div className="text-[9px] text-gray-500 uppercase tracking-widest">{label}</div>
      <div className={`text-sm font-bold font-mono mt-0.5 ${cls}`}>{value}</div>
      {hint && <div className="text-[9px] text-gray-500 mt-0.5">{hint}</div>}
    </div>
  );
}
