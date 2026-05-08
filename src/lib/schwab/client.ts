/**
 * Schwab Trader API client wrapper. Auto-refreshes the access token before
 * every call and retries once on 401.
 */

import { getAccessToken } from './oauth';

const TRADER_BASE = 'https://api.schwabapi.com/trader/v1';

interface RequestOpts {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

async function call(path: string, opts: RequestOpts = {}): Promise<unknown> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Not connected to Schwab — run OAuth flow first');
  }

  const qs = opts.query
    ? '?' +
      new URLSearchParams(
        Object.fromEntries(
          Object.entries(opts.query).filter(([, v]) => v !== undefined).map(
            ([k, v]) => [k, String(v)]
          )
        )
      ).toString()
    : '';

  const url = `${TRADER_BASE}${path}${qs}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  if (opts.body) headers['Content-Type'] = 'application/json';

  const resp = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  });

  if (resp.status === 204) return null;
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Schwab API ${resp.status} on ${opts.method ?? 'GET'} ${path}: ${text}`);
  }
  // Some endpoints (e.g. order placement) return location header without a JSON body.
  const contentType = resp.headers.get('content-type') || '';
  if (!contentType.includes('json')) return null;
  return await resp.json();
}

// ── Domain helpers ─────────────────────────────────────────────────────

export interface AccountNumberHash {
  accountNumber: string;
  hashValue: string;
}

export async function getAccountNumbers(): Promise<AccountNumberHash[]> {
  return (await call('/accounts/accountNumbers')) as AccountNumberHash[];
}

interface SchwabAccount {
  securitiesAccount: {
    accountNumber: string;
    type: string;
    currentBalances?: {
      cashBalance?: number;
      buyingPower?: number;
      equity?: number;
      liquidationValue?: number;
    };
    positions?: Array<{
      instrument: { symbol: string; assetType: string };
      longQuantity: number;
      shortQuantity: number;
      averagePrice?: number;
      marketValue?: number;
      currentDayProfitLoss?: number;
      currentDayProfitLossPercentage?: number;
    }>;
  };
}

export async function getAccount(hash: string, includePositions = true): Promise<SchwabAccount> {
  return (await call(`/accounts/${encodeURIComponent(hash)}`, {
    query: includePositions ? { fields: 'positions' } : {},
  })) as SchwabAccount;
}

interface SchwabTransaction {
  activityId: string;
  time: string;
  type: string;
  status: string;
  netAmount?: number;
  transferItems?: Array<{
    instrument?: { symbol?: string };
    amount?: number;
    cost?: number;
    price?: number;
  }>;
}

export async function getTransactions(
  hash: string,
  opts: { startDate?: string; endDate?: string; types?: string } = {}
): Promise<SchwabTransaction[]> {
  return (await call(`/accounts/${encodeURIComponent(hash)}/transactions`, {
    query: {
      startDate: opts.startDate,
      endDate: opts.endDate,
      types: opts.types ?? 'TRADE',
    },
  })) as SchwabTransaction[];
}

// ── Order placement (kept tight; expanded in Sprint 5) ─────────────────

/**
 * Schwab order session.
 *  NORMAL = regular hours (9:30–16:00 ET) — only NORMAL allows MARKET orders
 *  AM     = pre-market (7:00–9:25 ET) — LIMIT only
 *  PM     = after-hours (16:05–20:00 ET) — LIMIT only
 *  SEAMLESS = order works across all sessions (must be LIMIT, GTC)
 */
export type SchwabOrderSessionType = 'NORMAL' | 'AM' | 'PM' | 'SEAMLESS';

export interface BuyLimitOrder {
  symbol: string;
  shares: number;
  limitPrice: number;
  duration?: 'DAY' | 'GOOD_TILL_CANCEL';
  session?: SchwabOrderSessionType;
}

export interface SellLimitOrder {
  symbol: string;
  shares: number;
  limitPrice: number;
  duration?: 'DAY' | 'GOOD_TILL_CANCEL';
  session?: SchwabOrderSessionType;
}

export interface SellStopOrder {
  symbol: string;
  shares: number;
  stopPrice: number;
  duration?: 'DAY' | 'GOOD_TILL_CANCEL';
  session?: SchwabOrderSessionType;
}

export function buildBuyLimitOrder(o: BuyLimitOrder) {
  return {
    orderType: 'LIMIT',
    session: o.session ?? 'NORMAL',
    duration: o.duration ?? 'DAY',
    orderStrategyType: 'SINGLE',
    price: Number(o.limitPrice.toFixed(2)),
    orderLegCollection: [
      {
        instruction: 'BUY',
        quantity: o.shares,
        instrument: { symbol: o.symbol, assetType: 'EQUITY' },
      },
    ],
  };
}

export function buildSellLimitOrder(o: SellLimitOrder) {
  return {
    orderType: 'LIMIT',
    session: o.session ?? 'NORMAL',
    duration: o.duration ?? 'DAY',
    orderStrategyType: 'SINGLE',
    price: Number(o.limitPrice.toFixed(2)),
    orderLegCollection: [
      {
        instruction: 'SELL',
        quantity: o.shares,
        instrument: { symbol: o.symbol, assetType: 'EQUITY' },
      },
    ],
  };
}

export function buildSellStopOrder(o: SellStopOrder) {
  return {
    orderType: 'STOP',
    // STOP orders during AM/PM are not accepted by Schwab — fall back
    // to NORMAL since stops typically rest GTC anyway.
    session: o.session && o.session !== 'AM' && o.session !== 'PM' ? o.session : 'NORMAL',
    duration: o.duration ?? 'GOOD_TILL_CANCEL',
    orderStrategyType: 'SINGLE',
    stopPrice: Number(o.stopPrice.toFixed(2)),
    orderLegCollection: [
      {
        instruction: 'SELL',
        quantity: o.shares,
        instrument: { symbol: o.symbol, assetType: 'EQUITY' },
      },
    ],
  };
}

/**
 * Build a bracket OCO order (TRIGGER strategy): a buy-fills-then-OCO setup
 * where the buy is the parent and a one-cancels-other pair (target sell limit
 * + stop loss) is the child. After the buy fills, both children become live;
 * whichever fires first cancels the other.
 *
 * This is the broker-side safety net: if our engine dies between fill and
 * exit, the broker still manages the trade.
 */
export function buildBracketOcoOrder(o: {
  symbol: string;
  shares: number;
  buyLimitPrice: number;
  targetLimitPrice: number;
  stopPrice: number;
  duration?: 'DAY' | 'GOOD_TILL_CANCEL';
  /** Session for the parent BUY leg. Children always use NORMAL since
   * Schwab won't accept extended-hours STOP orders. */
  session?: SchwabOrderSessionType;
}) {
  const parentSession = o.session ?? 'NORMAL';
  return {
    orderType: 'LIMIT',
    session: parentSession,
    duration: o.duration ?? 'DAY',
    orderStrategyType: 'TRIGGER',
    price: Number(o.buyLimitPrice.toFixed(2)),
    orderLegCollection: [
      {
        instruction: 'BUY',
        quantity: o.shares,
        instrument: { symbol: o.symbol, assetType: 'EQUITY' },
      },
    ],
    childOrderStrategies: [
      {
        orderStrategyType: 'OCO',
        childOrderStrategies: [
          {
            orderType: 'LIMIT',
            session: 'NORMAL',
            duration: 'GOOD_TILL_CANCEL',
            orderStrategyType: 'SINGLE',
            price: Number(o.targetLimitPrice.toFixed(2)),
            orderLegCollection: [
              {
                instruction: 'SELL',
                quantity: o.shares,
                instrument: { symbol: o.symbol, assetType: 'EQUITY' },
              },
            ],
          },
          {
            orderType: 'STOP',
            session: 'NORMAL',
            duration: 'GOOD_TILL_CANCEL',
            orderStrategyType: 'SINGLE',
            stopPrice: Number(o.stopPrice.toFixed(2)),
            orderLegCollection: [
              {
                instruction: 'SELL',
                quantity: o.shares,
                instrument: { symbol: o.symbol, assetType: 'EQUITY' },
              },
            ],
          },
        ],
      },
    ],
  };
}

export interface SchwabOrderStatus {
  orderId: string;
  status: string;            // 'WORKING' | 'FILLED' | 'CANCELED' | ...
  filledQuantity?: number;
  filledPrice?: number;      // average fill price across legs
  enteredTime?: string;
  closeTime?: string;
}

/**
 * Fetch the current state of an order. Used to confirm fills + capture
 * actual fill price (which may differ from the limit price submitted).
 */
export async function getOrderStatus(hash: string, orderId: string): Promise<SchwabOrderStatus> {
  const raw = (await call(`/accounts/${encodeURIComponent(hash)}/orders/${orderId}`)) as {
    orderId: string | number;
    status: string;
    filledQuantity?: number;
    enteredTime?: string;
    closeTime?: string;
    orderActivityCollection?: Array<{
      executionLegs?: Array<{
        quantity?: number;
        price?: number;
      }>;
    }>;
  };
  // Compute weighted average fill price across all execution legs
  let totalQ = 0;
  let totalQP = 0;
  for (const act of raw.orderActivityCollection ?? []) {
    for (const leg of act.executionLegs ?? []) {
      const q = leg.quantity ?? 0;
      const p = leg.price ?? 0;
      totalQ += q;
      totalQP += q * p;
    }
  }
  const filledPrice = totalQ > 0 ? totalQP / totalQ : undefined;
  return {
    orderId: String(raw.orderId),
    status: raw.status,
    filledQuantity: raw.filledQuantity,
    filledPrice,
    enteredTime: raw.enteredTime,
    closeTime: raw.closeTime,
  };
}

/** Submit a built order JSON to Schwab. Returns the orderId from the Location header. */
export async function placeOrder(hash: string, orderJson: unknown): Promise<string | null> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not connected to Schwab');

  const resp = await fetch(
    `${TRADER_BASE}/accounts/${encodeURIComponent(hash)}/orders`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(orderJson),
      cache: 'no-store',
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Schwab order placement ${resp.status}: ${text}`);
  }
  const loc = resp.headers.get('location') || resp.headers.get('Location');
  if (!loc) return null;
  // Location: https://api.schwabapi.com/trader/v1/accounts/{hash}/orders/{orderId}
  const m = loc.match(/orders\/([^/]+)$/);
  return m ? m[1] : null;
}
