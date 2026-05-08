/**
 * Schwab Streamer — WebSocket scaffolding for real-time quotes.
 *
 * STATUS: foundation only. The full implementation requires:
 *   1. Calling /userpreference to get streamer endpoint + customer info
 *   2. Establishing WebSocket connection to that endpoint
 *   3. Sending LOGIN message with credential blob
 *   4. Sending SUBS message for QUOTE/CHART_EQUITY/etc. service
 *   5. Parsing the abbreviated field-keyed response payload
 *   6. Mapping field codes back to readable names
 *
 * The infrastructure here lets a future commit fill in the protocol
 * details without restructuring. For now: returns a connection stub
 * with status methods.
 *
 * Reference: https://developer.schwab.com/products/trader-api--individual/details/streamer-api
 */

import { getAccessToken } from './oauth';

export type StreamerService =
  | 'QUOTE'              // equity quotes
  | 'OPTION'             // options quotes
  | 'CHART_EQUITY'       // 1m chart updates
  | 'LEVELONE_FUTURES'
  | 'NEWS_HEADLINE';

export type StreamerStatus = 'idle' | 'connecting' | 'authed' | 'error' | 'closed';

export interface StreamerConnection {
  status: StreamerStatus;
  /** Subscribe to a service for a list of symbols. */
  subscribe(service: StreamerService, symbols: string[]): Promise<void>;
  /** Unsubscribe. */
  unsubscribe(service: StreamerService, symbols: string[]): Promise<void>;
  /** Add a handler for an incoming payload. */
  on(service: StreamerService, handler: (data: unknown) => void): () => void;
  /** Close the connection. */
  close(): Promise<void>;
}

/**
 * Create a Schwab streamer connection. Returns a stub when token
 * unavailable — caller should check status before subscribing.
 */
export async function createStreamerConnection(): Promise<StreamerConnection> {
  let status: StreamerStatus = 'idle';
  const handlers = new Map<StreamerService, Array<(data: unknown) => void>>();

  // Phase 1: get the access token + streamer info
  const token = await getAccessToken();
  if (!token) {
    status = 'error';
    return makeStub(status);
  }

  // TODO Phase 2: call /userpreference, parse streamerInfo
  // TODO Phase 3: open WebSocket to streamerInfo.streamerSocketUrl
  // TODO Phase 4: send LOGIN message; await ack
  // TODO Phase 5: register subscribe/unsubscribe via WebSocket SUBS/UNSUBS
  // TODO Phase 6: parse incoming abbreviated-field payloads, map to handlers

  // Until those land, return a stub that records intent without sending
  status = 'idle';
  return {
    status,
    async subscribe(service, symbols) {
      // eslint-disable-next-line no-console
      console.warn(`[streamer stub] subscribe ${service} ${symbols.join(',')} — not yet wired`);
    },
    async unsubscribe(service, symbols) {
      // eslint-disable-next-line no-console
      console.warn(`[streamer stub] unsubscribe ${service} ${symbols.join(',')} — not yet wired`);
    },
    on(service, handler) {
      const list = handlers.get(service) ?? [];
      list.push(handler);
      handlers.set(service, list);
      return () => {
        const cur = handlers.get(service) ?? [];
        handlers.set(service, cur.filter((h) => h !== handler));
      };
    },
    async close() {
      handlers.clear();
    },
  };
}

function makeStub(status: StreamerStatus): StreamerConnection {
  return {
    status,
    async subscribe() { /* no-op */ },
    async unsubscribe() { /* no-op */ },
    on() { return () => {}; },
    async close() { /* no-op */ },
  };
}
