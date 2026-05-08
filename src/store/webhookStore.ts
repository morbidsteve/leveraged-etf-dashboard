import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Outbound-webhook configuration. Each webhook has a target URL,
 * the events it cares about, and an optional secret for HMAC signing
 * (so consumers can verify the POST came from this dashboard).
 *
 * Events fire from various engines:
 *   - 'trade.opened'  / 'trade.closed'      (manual + paper + options)
 *   - 'strategy.fired' / 'strategy.enabled' / 'strategy.disabled'
 *   - 'alert.fired'  (from custom AlertRules)
 *   - 'position.tp'  / 'position.sl' (from position-alert engine)
 */

export type WebhookEvent =
  | 'trade.opened'
  | 'trade.closed'
  | 'strategy.fired'
  | 'strategy.enabled'
  | 'strategy.disabled'
  | 'alert.fired'
  | 'position.tp'
  | 'position.sl';

export interface WebhookEndpoint {
  id: string;
  label: string;
  url: string;
  events: WebhookEvent[];
  secret?: string;
  enabled: boolean;
  createdAt: Date;
  lastFiredAt?: Date;
  lastStatus?: number;        // last HTTP status from the receiver
  lastError?: string;
}

interface WebhookState {
  endpoints: WebhookEndpoint[];
  _hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  addEndpoint: (input: Omit<WebhookEndpoint, 'id' | 'createdAt'>) => WebhookEndpoint;
  updateEndpoint: (id: string, patch: Partial<WebhookEndpoint>) => void;
  deleteEndpoint: (id: string) => void;
}

function genId(): string {
  return `wh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useWebhookStore = create<WebhookState>()(
  persist(
    (set) => ({
      endpoints: [],
      _hasHydrated: false,
      setHasHydrated: (v) => set({ _hasHydrated: v }),
      addEndpoint: (input) => {
        const ep: WebhookEndpoint = {
          ...input,
          id: genId(),
          createdAt: new Date(),
        };
        set((s) => ({ endpoints: [...s.endpoints, ep] }));
        return ep;
      },
      updateEndpoint: (id, patch) =>
        set((s) => ({
          endpoints: s.endpoints.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),
      deleteEndpoint: (id) =>
        set((s) => ({ endpoints: s.endpoints.filter((e) => e.id !== id) })),
    }),
    {
      name: 'webhook-storage',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

/**
 * Fire a webhook event to every matching endpoint. Best-effort POST;
 * failures are recorded on the endpoint via updateEndpoint.
 */
export async function fireWebhook(
  event: WebhookEvent,
  payload: Record<string, unknown>
): Promise<void> {
  if (typeof window === 'undefined') return;
  const state = useWebhookStore.getState();
  const matches = state.endpoints.filter(
    (e) => e.enabled && e.events.includes(event)
  );
  if (matches.length === 0) return;

  await Promise.all(
    matches.map(async (ep) => {
      const body = JSON.stringify({
        event,
        firedAt: new Date().toISOString(),
        ...payload,
      });
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      // HMAC signing if secret provided — Web Crypto API
      if (ep.secret) {
        try {
          const enc = new TextEncoder();
          const key = await crypto.subtle.importKey(
            'raw',
            enc.encode(ep.secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
          );
          const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
          const hex = Array.from(new Uint8Array(sig))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
          headers['X-Etfd-Signature'] = `sha256=${hex}`;
        } catch {
          // ignore
        }
      }
      try {
        const r = await fetch(ep.url, {
          method: 'POST',
          headers,
          body,
        });
        state.updateEndpoint(ep.id, {
          lastFiredAt: new Date(),
          lastStatus: r.status,
          lastError: r.ok ? undefined : `HTTP ${r.status}`,
        });
      } catch (e) {
        state.updateEndpoint(ep.id, {
          lastFiredAt: new Date(),
          lastError: e instanceof Error ? e.message : 'fetch failed',
        });
      }
    })
  );
}
