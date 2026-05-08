'use client';

import { useState } from 'react';
import { useWebhookStore, WebhookEvent, fireWebhook } from '@/store';
import { format, formatDistanceToNow } from 'date-fns';
import { showToast } from '@/components/UI';

const ALL_EVENTS: { id: WebhookEvent; label: string }[] = [
  { id: 'trade.opened', label: 'Trade opened' },
  { id: 'trade.closed', label: 'Trade closed' },
  { id: 'strategy.fired', label: 'Strategy fired (action emitted)' },
  { id: 'strategy.enabled', label: 'Strategy enabled' },
  { id: 'strategy.disabled', label: 'Strategy disabled' },
  { id: 'alert.fired', label: 'Custom alert rule fired' },
  { id: 'position.tp', label: 'Position hit take-profit' },
  { id: 'position.sl', label: 'Position hit stop' },
];

/**
 * Outbound webhook management card. Lives in Settings → Broker tab,
 * below the API Keys card.
 *
 * Each endpoint is a target URL + event subscriptions + optional HMAC
 * secret (for verification on the receiver side). Posts JSON.
 */
export default function WebhooksCard() {
  const endpoints = useWebhookStore((s) => s.endpoints);
  const addEndpoint = useWebhookStore((s) => s.addEndpoint);
  const updateEndpoint = useWebhookStore((s) => s.updateEndpoint);
  const deleteEndpoint = useWebhookStore((s) => s.deleteEndpoint);

  const [showAdd, setShowAdd] = useState(false);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [events, setEvents] = useState<WebhookEvent[]>(['trade.opened', 'trade.closed']);

  const create = () => {
    if (!url.trim()) {
      showToast('URL is required', 'info');
      return;
    }
    if (events.length === 0) {
      showToast('Pick at least one event', 'info');
      return;
    }
    addEndpoint({
      label: label.trim() || 'Webhook',
      url: url.trim(),
      events,
      secret: secret.trim() || undefined,
      enabled: true,
    });
    setShowAdd(false);
    setLabel('');
    setUrl('');
    setSecret('');
    setEvents(['trade.opened', 'trade.closed']);
    showToast('Webhook created');
  };

  const test = async (id: string) => {
    const ep = endpoints.find((e) => e.id === id);
    if (!ep) return;
    showToast(`Sending test ping to ${ep.label}…`, 'info');
    await fireWebhook(ep.events[0] ?? 'trade.opened', {
      test: true,
      label: ep.label,
      message: 'Test ping from ETF dashboard',
    });
    setTimeout(() => {
      const updated = useWebhookStore.getState().endpoints.find((e) => e.id === id);
      if (updated?.lastError) {
        showToast(`Test failed: ${updated.lastError}`, 'error', 6000);
      } else if (updated?.lastStatus) {
        showToast(`Test ping ok (HTTP ${updated.lastStatus})`);
      }
    }, 500);
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="font-medium text-white">Outbound webhooks</h2>
        <p className="text-[11px] text-gray-500 mt-1">
          POST trade / strategy / alert events to your own URL. Useful for
          integrating with Slack, Discord, Zapier, IFTTT, or a custom
          handler. Optional HMAC SHA-256 signature in <code>X-Etfd-Signature</code>{' '}
          header when a secret is provided.
        </p>
      </div>
      <div className="card-body space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] uppercase tracking-widest text-gray-500">
            Endpoints ({endpoints.filter((e) => e.enabled).length} active /{' '}
            {endpoints.length} total)
          </h3>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="btn btn-primary text-xs"
          >
            {showAdd ? 'Cancel' : '+ New webhook'}
          </button>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 space-y-2">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (e.g. Slack, Zapier, Discord)"
              className="input w-full text-sm py-1.5"
            />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
              className="input w-full text-sm py-1.5 font-mono"
            />
            <input
              type="text"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="HMAC secret (optional, for signature verification)"
              className="input w-full text-sm py-1.5 font-mono"
            />
            <div>
              <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">
                Events to send
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ALL_EVENTS.map((e) => (
                  <button
                    key={e.id}
                    onClick={() =>
                      setEvents((cur) =>
                        cur.includes(e.id) ? cur.filter((x) => x !== e.id) : [...cur, e.id]
                      )
                    }
                    className={`text-[10px] px-2 py-1 rounded border ${
                      events.includes(e.id)
                        ? 'bg-accent/20 border-accent/40 text-accent-light'
                        : 'bg-white/[0.03] border-white/10 text-gray-500'
                    }`}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={create} className="btn btn-primary text-sm">
              Create webhook
            </button>
          </div>
        )}

        {/* Endpoints list */}
        {endpoints.length === 0 ? (
          <div className="text-xs text-gray-500 italic py-2">
            No webhooks yet. Create one to get notified when events fire.
          </div>
        ) : (
          <div className="space-y-2">
            {endpoints.map((ep) => (
              <div
                key={ep.id}
                className={`rounded-lg border p-2.5 ${
                  ep.enabled
                    ? 'border-white/10 bg-white/[0.04]'
                    : 'border-white/5 bg-white/[0.02] opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white truncate">
                        {ep.label}
                      </span>
                      <span className="text-[9px] text-gray-500">
                        {ep.events.length} event{ep.events.length === 1 ? '' : 's'}
                      </span>
                      {ep.secret && (
                        <span className="text-[9px] uppercase tracking-widest text-accent-light">
                          HMAC
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-400 font-mono mt-0.5 truncate">
                      {ep.url}
                    </div>
                    {ep.lastFiredAt && (
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        Last fired{' '}
                        {formatDistanceToNow(new Date(ep.lastFiredAt), { addSuffix: true })} ·{' '}
                        {ep.lastError ? (
                          <span className="text-loss">⚠ {ep.lastError}</span>
                        ) : (
                          <span className="text-profit">HTTP {ep.lastStatus}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <button
                      onClick={() => updateEndpoint(ep.id, { enabled: !ep.enabled })}
                      className="text-[10px] uppercase tracking-widest text-gray-500 hover:text-white"
                    >
                      {ep.enabled ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      onClick={() => test(ep.id)}
                      className="text-[10px] uppercase tracking-widest text-accent-light hover:brightness-125"
                    >
                      Test
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Delete this webhook?')) deleteEndpoint(ep.id);
                      }}
                      className="text-[10px] uppercase tracking-widest text-loss hover:brightness-125"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
