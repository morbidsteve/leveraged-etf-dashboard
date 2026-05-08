/**
 * Alpaca broker adapter — STUB. Implements the BrokerAdapter interface
 * but returns "not implemented" until real Alpaca API integration is
 * wired (separate Alpaca account + API key required).
 *
 * Once enabled, set:
 *   ALPACA_API_KEY_ID=...
 *   ALPACA_SECRET_KEY=...
 *   ALPACA_BASE_URL=https://api.alpaca.markets  (or paper-api.alpaca.markets)
 *
 * Reference: https://docs.alpaca.markets/reference/postorder
 */

import {
  BrokerAdapter,
  BrokerAccountInfo,
  BrokerPosition,
  BrokerOrderRequest,
  BrokerOrderResponse,
} from './types';

class NotImplementedError extends Error {
  constructor(method: string) {
    super(`Alpaca adapter: ${method} not yet implemented. Set ALPACA_API_KEY_ID + ALPACA_SECRET_KEY and complete src/lib/brokers/alpaca.ts.`);
  }
}

export const alpacaAdapter: BrokerAdapter = {
  id: 'alpaca',
  label: 'Alpaca',

  async isConnected() {
    const id = process.env.ALPACA_API_KEY_ID;
    const secret = process.env.ALPACA_SECRET_KEY;
    return !!(id && secret && id.length > 0 && secret.length > 0);
  },

  async getAccount(): Promise<BrokerAccountInfo> {
    if (!(await this.isConnected())) {
      throw new NotImplementedError('getAccount');
    }
    // Placeholder structure for when implementation lands
    const url = process.env.ALPACA_BASE_URL ?? 'https://paper-api.alpaca.markets';
    const resp = await fetch(`${url}/v2/account`, {
      headers: {
        'APCA-API-KEY-ID': process.env.ALPACA_API_KEY_ID ?? '',
        'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY ?? '',
      },
    });
    if (!resp.ok) throw new Error(`Alpaca ${resp.status}`);
    const a = await resp.json();
    return {
      brokerId: 'alpaca',
      accountNumber: a.account_number,
      cashBalance: parseFloat(a.cash),
      buyingPower: parseFloat(a.buying_power),
      equity: parseFloat(a.equity),
      liquidationValue: parseFloat(a.portfolio_value),
    };
  },

  async getPositions(): Promise<BrokerPosition[]> {
    if (!(await this.isConnected())) throw new NotImplementedError('getPositions');
    const url = process.env.ALPACA_BASE_URL ?? 'https://paper-api.alpaca.markets';
    const resp = await fetch(`${url}/v2/positions`, {
      headers: {
        'APCA-API-KEY-ID': process.env.ALPACA_API_KEY_ID ?? '',
        'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY ?? '',
      },
    });
    if (!resp.ok) throw new Error(`Alpaca ${resp.status}`);
    const positions = (await resp.json()) as Array<{
      symbol: string;
      qty: string;
      avg_entry_price: string;
      market_value: string;
      unrealized_pl: string;
    }>;
    return positions.map((p) => ({
      symbol: p.symbol,
      shares: parseFloat(p.qty),
      avgCost: parseFloat(p.avg_entry_price),
      marketValue: parseFloat(p.market_value),
      unrealizedPnL: parseFloat(p.unrealized_pl),
    }));
  },

  async placeOrder(req: BrokerOrderRequest): Promise<BrokerOrderResponse> {
    if (!(await this.isConnected())) throw new NotImplementedError('placeOrder');
    const url = process.env.ALPACA_BASE_URL ?? 'https://paper-api.alpaca.markets';
    const body = {
      symbol: req.symbol,
      qty: req.shares,
      side: req.side.toLowerCase(),
      type: req.orderType.toLowerCase().replace('_', '-'),
      time_in_force: req.duration === 'DAY' ? 'day' : 'gtc',
      limit_price: req.limitPrice,
      stop_price: req.stopPrice,
    };
    const resp = await fetch(`${url}/v2/orders`, {
      method: 'POST',
      headers: {
        'APCA-API-KEY-ID': process.env.ALPACA_API_KEY_ID ?? '',
        'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`Alpaca order ${resp.status}: ${await resp.text()}`);
    const r = await resp.json();
    return {
      orderId: r.id,
      status: mapAlpacaStatus(r.status),
      filledQuantity: r.filled_qty ? parseFloat(r.filled_qty) : undefined,
      filledPrice: r.filled_avg_price ? parseFloat(r.filled_avg_price) : undefined,
    };
  },

  async cancelOrder(orderId: string): Promise<boolean> {
    if (!(await this.isConnected())) throw new NotImplementedError('cancelOrder');
    const url = process.env.ALPACA_BASE_URL ?? 'https://paper-api.alpaca.markets';
    const resp = await fetch(`${url}/v2/orders/${encodeURIComponent(orderId)}`, {
      method: 'DELETE',
      headers: {
        'APCA-API-KEY-ID': process.env.ALPACA_API_KEY_ID ?? '',
        'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY ?? '',
      },
    });
    return resp.ok;
  },

  async getOrderStatus(orderId: string): Promise<BrokerOrderResponse> {
    if (!(await this.isConnected())) throw new NotImplementedError('getOrderStatus');
    const url = process.env.ALPACA_BASE_URL ?? 'https://paper-api.alpaca.markets';
    const resp = await fetch(`${url}/v2/orders/${encodeURIComponent(orderId)}`, {
      headers: {
        'APCA-API-KEY-ID': process.env.ALPACA_API_KEY_ID ?? '',
        'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY ?? '',
      },
    });
    if (!resp.ok) throw new Error(`Alpaca ${resp.status}`);
    const r = await resp.json();
    return {
      orderId: r.id,
      status: mapAlpacaStatus(r.status),
      filledQuantity: r.filled_qty ? parseFloat(r.filled_qty) : undefined,
      filledPrice: r.filled_avg_price ? parseFloat(r.filled_avg_price) : undefined,
    };
  },
};

function mapAlpacaStatus(s: string): BrokerOrderResponse['status'] {
  if (s === 'filled') return 'FILLED';
  if (s === 'canceled' || s === 'expired') return 'CANCELED';
  if (s === 'rejected') return 'REJECTED';
  if (s === 'partially_filled') return 'PARTIAL';
  return 'WORKING';
}
