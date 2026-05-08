/**
 * ETF Dashboard TypeScript SDK
 * ============================
 *
 * Lightweight client for the dashboard's REST API. Drop this file into
 * any TypeScript project and use:
 *
 *   import { EtfDashboardClient } from './etfd-client';
 *
 *   const client = new EtfDashboardClient({
 *     baseUrl: 'https://your-dashboard.com',
 *     apiKey: 'etfd_...',
 *   });
 *
 *   const health = await client.health();
 *   const quote = await client.quote('SOXL');
 *
 * Auth: the API key goes in the Authorization: Bearer header.
 *
 * Versioning: pin to /api/v1. Future versions will be /api/v2 etc.
 */

export interface ClientOptions {
  baseUrl: string;
  apiKey: string;
  /** Optional fetch implementation (Node 18+ has global fetch; for older
   * Node use undici or node-fetch). */
  fetchImpl?: typeof fetch;
}

export interface HealthResponse {
  status: 'ok';
  version: string;
  timestamp: string;
  features: {
    schwab: boolean;
    finnhub: boolean;
    worker: boolean;
  };
}

export interface QuoteResponse {
  ticker: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  currency: string;
  exchange: string;
  timestamp: string;
}

export interface TradesResponse {
  note?: string;
  apiKey: { id: string; label: string; scopes: string[] };
  trades: unknown[];
}

export class EtfDashboardClient {
  private baseUrl: string;
  private apiKey: string;
  private fetchImpl: typeof fetch;

  constructor(opts: ClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    if (!this.fetchImpl) {
      throw new Error('No fetch implementation found. Pass `fetchImpl` in options for Node <18.');
    }
  }

  private async request<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const resp = await this.fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json',
      },
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new EtfDashboardApiError(resp.status, text);
    }
    return (await resp.json()) as T;
  }

  /** Health check (no auth required). */
  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/api/v1/health');
  }

  /** Latest quote for a ticker. */
  async quote(ticker: string): Promise<QuoteResponse> {
    return this.request<QuoteResponse>(`/api/v1/quote/${encodeURIComponent(ticker.toUpperCase())}`);
  }

  /** List trades (placeholder until multi-user data migration). */
  async trades(): Promise<TradesResponse> {
    return this.request<TradesResponse>('/api/v1/trades');
  }
}

export class EtfDashboardApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`ETF Dashboard API error (${status}): ${body.slice(0, 200)}`);
    this.name = 'EtfDashboardApiError';
  }
}
