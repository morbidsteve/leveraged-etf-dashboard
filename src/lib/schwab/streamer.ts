/**
 * Schwab Streamer — browser WebSocket client for real-time quotes.
 *
 * Implements the LOGIN + SUBS protocol described at
 * https://developer.schwab.com/products/trader-api--individual/details/streamer-api
 *
 * IMPORTANT: requires live validation against a real Schwab developer
 * account. The wire format here matches the documented fields, but
 * subtle gotchas (e.g. login response timing, field indexing) can only
 * be verified against a real session. Do not rely on this for trade
 * decisions before connecting once and confirming quote payloads
 * match a known-good source.
 *
 * Falls back to a no-op stub when:
 *   - No access token (user hasn't connected Schwab)
 *   - WebSocket connect fails
 *   - LOGIN response indicates failure
 */

export type StreamerService =
  | 'LEVELONE_EQUITIES'
  | 'LEVELONE_OPTIONS'
  | 'CHART_EQUITY'
  | 'NYSE_BOOK'
  | 'NASDAQ_BOOK'
  | 'NEWS_HEADLINE';

export type StreamerStatus =
  | 'idle'
  | 'connecting'
  | 'authed'
  | 'error'
  | 'closed';

export interface QuoteUpdate {
  symbol: string;
  bid?: number;
  ask?: number;
  last?: number;
  bidSize?: number;
  askSize?: number;
  totalVolume?: number;
  netChange?: number;
  netChangePct?: number;
  ts?: number;
}

export interface StreamerConnection {
  status: StreamerStatus;
  subscribe(service: StreamerService, symbols: string[]): Promise<void>;
  unsubscribe(service: StreamerService, symbols: string[]): Promise<void>;
  on(service: StreamerService, handler: (data: unknown) => void): () => void;
  onQuote(handler: (q: QuoteUpdate) => void): () => void;
  close(): Promise<void>;
}

interface StreamerCreds {
  url: string;
  customerId: string;
  correlId: string;
  channel: string;
  functionId: string;
  token: string;
}

/**
 * Equity L1 field IDs (per docs). When parsing payloads we map these
 * numeric keys back into typed QuoteUpdate fields.
 */
const EQUITY_FIELDS: Record<string, keyof QuoteUpdate> = {
  '0': 'symbol',
  '1': 'bid',
  '2': 'ask',
  '3': 'last',
  '4': 'bidSize',
  '5': 'askSize',
  '8': 'totalVolume',
  '18': 'netChange',
  '42': 'netChangePct',
  '34': 'ts',
};

function parseQuotePayload(content: Record<string, unknown>): QuoteUpdate {
  const out: QuoteUpdate = {
    symbol: (content['key'] as string) ?? '',
  };
  for (const [k, v] of Object.entries(content)) {
    const mapped = EQUITY_FIELDS[k];
    if (!mapped) continue;
    if (mapped === 'symbol') {
      out.symbol = String(v);
    } else {
      (out as unknown as Record<string, number>)[mapped] =
        typeof v === 'number' ? v : Number(v);
    }
  }
  return out;
}

export async function createStreamerConnection(): Promise<StreamerConnection> {
  let status: StreamerStatus = 'idle';
  const handlers = new Map<StreamerService, Array<(data: unknown) => void>>();
  const quoteHandlers: Array<(q: QuoteUpdate) => void> = [];
  let ws: WebSocket | null = null;
  let requestId = 0;
  let creds: StreamerCreds | null = null;

  const stub = (s: StreamerStatus): StreamerConnection => ({
    status: s,
    async subscribe() { /* no-op */ },
    async unsubscribe() { /* no-op */ },
    on(service, handler) {
      const list = handlers.get(service) ?? [];
      list.push(handler);
      handlers.set(service, list);
      return () => {
        const cur = handlers.get(service) ?? [];
        handlers.set(service, cur.filter((h) => h !== handler));
      };
    },
    onQuote(handler) {
      quoteHandlers.push(handler);
      return () => {
        const i = quoteHandlers.indexOf(handler);
        if (i >= 0) quoteHandlers.splice(i, 1);
      };
    },
    async close() {
      ws?.close();
      handlers.clear();
      quoteHandlers.length = 0;
    },
  });

  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
    return stub('idle');
  }

  // Phase 1: server fetches token + streamer endpoint creds
  try {
    const r = await fetch('/api/schwab/streamer-info');
    if (!r.ok) return stub('error');
    creds = (await r.json()) as StreamerCreds;
  } catch {
    return stub('error');
  }
  if (!creds?.url || !creds.customerId || !creds.token) return stub('error');

  // Phase 2: open WebSocket and LOGIN
  status = 'connecting';
  ws = new WebSocket(creds.url);

  const loginOk = await new Promise<boolean>((resolve) => {
    if (!ws || !creds) return resolve(false);
    const onOpen = () => {
      const msg = {
        requests: [
          {
            requestid: String(++requestId),
            service: 'ADMIN',
            command: 'LOGIN',
            SchwabClientCustomerId: creds!.customerId,
            SchwabClientCorrelId: creds!.correlId,
            parameters: {
              Authorization: creds!.token,
              SchwabClientChannel: creds!.channel,
              SchwabClientFunctionId: creds!.functionId,
            },
          },
        ],
      };
      ws!.send(JSON.stringify(msg));
    };
    const onMsg = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
        const resp = (msg.response ?? []).find(
          (r: { command?: string }) => r.command === 'LOGIN'
        );
        if (resp) {
          const code = resp.content?.code;
          if (code === 0) {
            status = 'authed';
            resolve(true);
          } else {
            status = 'error';
            resolve(false);
          }
        }
        // Data payloads
        const dataMsgs = msg.data ?? [];
        for (const d of dataMsgs) {
          const service = d.service as StreamerService;
          const items = (d.content ?? []) as Record<string, unknown>[];
          const list = handlers.get(service);
          if (list) for (const h of list) h(items);
          if (service === 'LEVELONE_EQUITIES') {
            for (const item of items) {
              const q = parseQuotePayload(item);
              if (q.symbol) for (const h of quoteHandlers) h(q);
            }
          }
        }
      } catch {
        /* ignore malformed; protocol can return non-JSON heartbeats */
      }
    };
    const onErr = () => {
      status = 'error';
      resolve(false);
    };
    ws.addEventListener('open', onOpen);
    ws.addEventListener('message', onMsg);
    ws.addEventListener('error', onErr);
    ws.addEventListener('close', () => {
      status = 'closed';
    });
  });

  if (!loginOk || !creds) return stub('error');

  return {
    get status() { return status; },
    async subscribe(service, symbols) {
      if (!ws || status !== 'authed' || !creds) return;
      const fields =
        service === 'LEVELONE_EQUITIES' ? '0,1,2,3,4,5,8,18,42,34' : '0,1,2,3';
      const msg = {
        requests: [
          {
            requestid: String(++requestId),
            service,
            command: 'SUBS',
            SchwabClientCustomerId: creds.customerId,
            SchwabClientCorrelId: creds.correlId,
            parameters: {
              keys: symbols.join(','),
              fields,
            },
          },
        ],
      };
      ws.send(JSON.stringify(msg));
    },
    async unsubscribe(service, symbols) {
      if (!ws || status !== 'authed' || !creds) return;
      const msg = {
        requests: [
          {
            requestid: String(++requestId),
            service,
            command: 'UNSUBS',
            SchwabClientCustomerId: creds.customerId,
            SchwabClientCorrelId: creds.correlId,
            parameters: { keys: symbols.join(',') },
          },
        ],
      };
      ws.send(JSON.stringify(msg));
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
    onQuote(handler) {
      quoteHandlers.push(handler);
      return () => {
        const i = quoteHandlers.indexOf(handler);
        if (i >= 0) quoteHandlers.splice(i, 1);
      };
    },
    async close() {
      ws?.close();
      ws = null;
      handlers.clear();
      quoteHandlers.length = 0;
      status = 'closed';
    },
  };
}
