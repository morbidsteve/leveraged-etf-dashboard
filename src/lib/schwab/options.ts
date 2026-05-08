/**
 * Schwab options data + order helpers.
 *
 * Lives next to client.ts so they share the same OAuth token machinery
 * but kept in a separate file because the request/response shapes are
 * substantially different from equity orders.
 */
import { getAccessToken } from './oauth';
import {
  OptionChain,
  OptionContract,
  OptionExpiration,
  OptionOrderRequest,
} from '@/types/options';

const TRADER_BASE = 'https://api.schwabapi.com/trader/v1';
const MARKETDATA_BASE = 'https://api.schwabapi.com/marketdata/v1';

// ── Chain fetch ─────────────────────────────────────────────────────────

interface SchwabChainResponse {
  symbol?: string;
  underlyingPrice?: number;
  callExpDateMap?: Record<string, Record<string, SchwabContractRaw[]>>;
  putExpDateMap?: Record<string, Record<string, SchwabContractRaw[]>>;
}

interface SchwabContractRaw {
  symbol: string;
  bid?: number;
  ask?: number;
  last?: number;
  mark?: number;
  totalVolume?: number;
  openInterest?: number;
  volatility?: number;          // IV in PERCENT (45.32 = 45.32%)
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  rho?: number;
  strikePrice?: number;
  daysToExpiration?: number;
  expirationDate?: number;      // ms epoch
  inTheMoney?: boolean;
  intrinsicValue?: number;
  timeValue?: number;
  putCall?: 'CALL' | 'PUT';
  bidSize?: number;
  askSize?: number;
}

export interface GetOptionChainOpts {
  /** Limit to a single expiration date (YYYY-MM-DD). */
  expiration?: string;
  /** OTMness range: 1 = ATM only, expand outward. Default fetches all. */
  strikeCount?: number;
  /** Default fetches both. */
  contractType?: 'CALL' | 'PUT' | 'ALL';
  /** Standard: weeklies + monthlies. We default standard only to keep payload small. */
  includeQuotes?: boolean;
}

/**
 * Fetch the full options chain for a symbol. Returns a normalized
 * OptionChain. If Schwab returns nothing (e.g. unauthorized, rate-
 * limited, market closed), returns a graceful empty chain with
 * configured: false / error attached.
 */
export async function getOptionChain(
  symbol: string,
  opts: GetOptionChainOpts = {}
): Promise<OptionChain> {
  const empty = (error?: string, configured = false): OptionChain => ({
    underlying: symbol.toUpperCase(),
    underlyingPrice: 0,
    fetchedAt: new Date(),
    expirations: [],
    configured,
    error,
  });

  let token: string | null;
  try {
    token = await getAccessToken();
  } catch {
    return empty('Not connected to Schwab');
  }
  if (!token) return empty('Not connected to Schwab');

  const qs = new URLSearchParams();
  qs.set('symbol', symbol.toUpperCase());
  qs.set('contractType', opts.contractType ?? 'ALL');
  if (opts.strikeCount) qs.set('strikeCount', String(opts.strikeCount));
  if (opts.expiration) {
    qs.set('fromDate', opts.expiration);
    qs.set('toDate', opts.expiration);
  }
  qs.set('includeUnderlyingQuote', 'true');

  const url = `${MARKETDATA_BASE}/chains?${qs.toString()}`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
    });
  } catch (e) {
    return empty(e instanceof Error ? e.message : 'fetch failed', true);
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    return empty(`Schwab ${resp.status}: ${text.slice(0, 160)}`, true);
  }

  let raw: SchwabChainResponse;
  try {
    raw = (await resp.json()) as SchwabChainResponse;
  } catch {
    return empty('Non-JSON response from Schwab', true);
  }

  // Normalize: Schwab's expDateMap keys look like "2026-05-09:7" (date:DTE).
  // We collapse calls + puts at the same expiration into one OptionExpiration.
  const expByDate = new Map<string, OptionExpiration>();

  const addContracts = (
    map: Record<string, Record<string, SchwabContractRaw[]>> | undefined,
    type: 'call' | 'put'
  ) => {
    if (!map) return;
    for (const expKey of Object.keys(map)) {
      const date = expKey.split(':')[0];
      const dte = parseInt(expKey.split(':')[1] ?? '0', 10);
      let exp = expByDate.get(date);
      if (!exp) {
        exp = { date, daysToExpiry: dte, calls: {}, puts: {} };
        expByDate.set(date, exp);
      }
      const strikes = map[expKey];
      for (const strikeKey of Object.keys(strikes)) {
        const strike = parseFloat(strikeKey);
        const list = strikes[strikeKey];
        if (!list || list.length === 0) continue;
        const r = list[0]; // Schwab returns 1 entry per (strike, type)
        const contract: OptionContract = {
          symbol: r.symbol,
          underlying: symbol.toUpperCase(),
          expiration: date,
          daysToExpiry: r.daysToExpiration ?? dte,
          strike,
          type,
          bid: r.bid ?? 0,
          ask: r.ask ?? 0,
          last: r.last ?? null,
          mark: r.mark ?? (r.bid && r.ask ? (r.bid + r.ask) / 2 : 0),
          volume: r.totalVolume ?? 0,
          openInterest: r.openInterest ?? 0,
          iv: r.volatility != null ? r.volatility / 100 : 0, // % → decimal
          delta: r.delta ?? 0,
          gamma: r.gamma ?? 0,
          theta: r.theta ?? 0,
          vega: r.vega ?? 0,
          rho: r.rho ?? 0,
          bidSize: r.bidSize,
          askSize: r.askSize,
          intrinsicValue: r.intrinsicValue,
          timeValue: r.timeValue,
          inTheMoney: r.inTheMoney,
        };
        if (type === 'call') exp.calls[strike] = contract;
        else exp.puts[strike] = contract;
      }
    }
  };

  addContracts(raw.callExpDateMap, 'call');
  addContracts(raw.putExpDateMap, 'put');

  const expirations = Array.from(expByDate.values()).sort(
    (a, b) => a.daysToExpiry - b.daysToExpiry
  );

  return {
    underlying: symbol.toUpperCase(),
    underlyingPrice: raw.underlyingPrice ?? 0,
    fetchedAt: new Date(),
    expirations,
    configured: true,
  };
}

// ── Options order placement ─────────────────────────────────────────────

/**
 * Build a Schwab options-order JSON payload from our internal request shape.
 *
 * For SINGLE leg: orderType=LIMIT, orderStrategyType=SINGLE.
 * For multi-leg: orderType=NET_DEBIT or NET_CREDIT depending on netPrice
 * sign, complexOrderStrategyType=structure name.
 */
export function buildOptionOrder(req: OptionOrderRequest) {
  const isSingle = req.legs.length === 1;
  const isCredit = req.netPrice < 0;
  const orderType = isSingle ? 'LIMIT' : isCredit ? 'NET_CREDIT' : 'NET_DEBIT';

  return {
    orderType,
    session: 'NORMAL',
    duration: req.duration,
    orderStrategyType: 'SINGLE',
    price: Math.abs(Number(req.netPrice.toFixed(2))),
    ...(isSingle
      ? {}
      : { complexOrderStrategyType: req.complexStrategyType ?? 'CUSTOM' }),
    orderLegCollection: req.legs.map((l) => ({
      instruction: l.instruction.replace('_', '_'), // already underscored
      quantity: l.quantity,
      instrument: {
        symbol: l.contractSymbol,
        assetType: 'OPTION',
      },
    })),
  };
}

/** Submit a built options-order JSON. Returns the orderId from the
 * Location header, mirroring the equity placeOrder helper. */
export async function placeOptionOrder(
  hash: string,
  orderJson: unknown
): Promise<string | null> {
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
    throw new Error(`Schwab options order ${resp.status}: ${text}`);
  }
  const loc = resp.headers.get('location') || resp.headers.get('Location');
  if (!loc) return null;
  const m = loc.match(/orders\/([^/]+)$/);
  return m ? m[1] : null;
}

// Client-safe pure helpers re-exported for backward compatibility.
// New code should import from '@/lib/options/helpers' directly.
export { findContractByDelta, findExpirationByDte, findAtmStrike } from '@/lib/options/helpers';
