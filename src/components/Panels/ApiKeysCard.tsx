'use client';

import { useEffect, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { showToast } from '@/components/UI';

interface ApiKeySummary {
  id: string;
  label: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt?: string;
  revoked: boolean;
}

/**
 * API keys management card. Lives in Settings → Broker tab.
 *
 * Lets the user create / revoke keys for third-party access to the
 * dashboard's REST API. New keys are shown in plaintext exactly once
 * (the dashboard only stores hashes); the user must copy them
 * immediately.
 */
export default function ApiKeysCard() {
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newScopes, setNewScopes] = useState<string[]>(['read']);
  const [justCreated, setJustCreated] = useState<{ raw: string; label: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/keys');
      const data = await r.json();
      setKeys(data.keys ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const create = async () => {
    if (!newLabel.trim()) {
      showToast('Enter a label first', 'info');
      return;
    }
    const r = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: newLabel, scopes: newScopes }),
    });
    const data = await r.json();
    if (data.raw) {
      setJustCreated({ raw: data.raw, label: data.label });
      setNewLabel('');
      refresh();
    }
  };

  const revoke = async (id: string) => {
    if (!confirm('Revoke this API key? Existing integrations using it will break.')) return;
    await fetch(`/api/keys?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    showToast('Key revoked', 'info');
    refresh();
  };

  const copyKey = async () => {
    if (!justCreated) return;
    try {
      await navigator.clipboard.writeText(justCreated.raw);
      showToast('Key copied to clipboard');
    } catch {
      // Fallback handled by user manually selecting
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="font-medium text-white">API keys</h2>
        <p className="text-[11px] text-gray-500 mt-1">
          Generate keys for third-party access to the dashboard's REST API
          (read trades, post webhooks, etc.). Each key is shown ONCE at
          creation; only its hash is stored. Revoking is permanent for that
          key — generate a new one to replace it.
        </p>
      </div>
      <div className="card-body space-y-3">
        {/* Create form */}
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-2">
          <h3 className="text-[10px] uppercase tracking-widest text-gray-500">
            Create new key
          </h3>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Label (e.g. Mobile app, Zapier)"
              className="input flex-1 text-sm py-1.5 min-w-[180px]"
            />
            <div className="flex gap-1">
              {(['read', 'write', 'admin'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() =>
                    setNewScopes((cur) =>
                      cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]
                    )
                  }
                  className={`text-[10px] uppercase tracking-widest font-mono px-2 py-1 rounded border ${
                    newScopes.includes(s)
                      ? 'bg-accent/20 border-accent/40 text-accent-light'
                      : 'bg-white/[0.03] border-white/10 text-gray-500'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <button onClick={create} className="btn btn-primary text-sm">
              Create
            </button>
          </div>
        </div>

        {/* Just-created key (one-time display) */}
        {justCreated && (
          <div className="rounded-lg border-2 border-accent/60 bg-accent/10 p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-widest text-accent-light font-bold">
              Your new key — save it NOW
            </div>
            <div className="font-mono text-xs text-white break-all bg-black/30 p-2 rounded select-all">
              {justCreated.raw}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={copyKey} className="btn btn-primary text-xs">
                Copy to clipboard
              </button>
              <button
                onClick={() => setJustCreated(null)}
                className="btn btn-ghost text-xs"
              >
                I've saved it
              </button>
            </div>
            <div className="text-[10px] text-amber-200">
              ⚠ This key will not be shown again. We only store its SHA-256 hash.
            </div>
          </div>
        )}

        {/* Keys list */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-[10px] uppercase tracking-widest text-gray-500">
              Active keys ({keys.filter((k) => !k.revoked).length})
            </h3>
            <button onClick={refresh} disabled={loading} className="text-[10px] text-gray-500 hover:text-white">
              {loading ? '…' : 'Refresh'}
            </button>
          </div>
          {keys.length === 0 ? (
            <div className="text-xs text-gray-500 italic py-2">No keys yet.</div>
          ) : (
            <div className="space-y-1 font-mono text-[11px] max-h-64 overflow-y-auto">
              {keys.map((k) => (
                <div
                  key={k.id}
                  className={`flex items-center gap-2 p-1.5 rounded border ${
                    k.revoked
                      ? 'border-white/5 bg-white/[0.02] opacity-50'
                      : 'border-white/10 bg-white/[0.04]'
                  }`}
                >
                  <span className="text-white truncate flex-1">{k.label}</span>
                  <span className="text-[9px] text-accent-light uppercase tracking-widest">
                    {k.scopes.join('/')}
                  </span>
                  <span className="text-gray-500 text-[10px] shrink-0">
                    {k.lastUsedAt
                      ? `used ${formatDistanceToNow(new Date(k.lastUsedAt), { addSuffix: true })}`
                      : 'never used'}
                  </span>
                  <span className="text-gray-600 text-[9px] shrink-0">
                    {format(new Date(k.createdAt), 'MMM dd')}
                  </span>
                  {k.revoked ? (
                    <span className="text-loss text-[9px] uppercase tracking-widest">revoked</span>
                  ) : (
                    <button
                      onClick={() => revoke(k.id)}
                      className="text-[10px] text-loss hover:brightness-125"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
