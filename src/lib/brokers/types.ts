/**
 * Broker abstraction interface — every supported broker (Schwab, Alpaca,
 * Tradier, etc.) implements this so the engine can route orders without
 * knowing which broker is connected.
 *
 * Tier 5 / multi-broker. Currently Schwab is the only fully-wired
 * implementation; this interface lets future Alpaca / IBKR / Tradier
 * adapters drop in cleanly.
 */

export type BrokerId = 'schwab' | 'alpaca' | 'tradier' | 'ibkr' | 'tastytrade';

export interface BrokerAccountInfo {
  brokerId: BrokerId;
  accountNumber: string;
  cashBalance?: number;
  buyingPower?: number;
  equity?: number;
  liquidationValue?: number;
}

export interface BrokerPosition {
  symbol: string;
  shares: number;       // signed: + long, - short
  avgCost: number;
  marketValue?: number;
  unrealizedPnL?: number;
}

export interface BrokerOrderRequest {
  symbol: string;
  shares: number;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
  limitPrice?: number;
  stopPrice?: number;
  duration: 'DAY' | 'GOOD_TILL_CANCEL';
}

export interface BrokerOrderResponse {
  orderId: string;
  status: 'WORKING' | 'FILLED' | 'CANCELED' | 'REJECTED' | 'PARTIAL';
  filledQuantity?: number;
  filledPrice?: number;
}

export interface BrokerAdapter {
  id: BrokerId;
  label: string;
  isConnected(): Promise<boolean>;
  getAccount(): Promise<BrokerAccountInfo>;
  getPositions(): Promise<BrokerPosition[]>;
  placeOrder(req: BrokerOrderRequest): Promise<BrokerOrderResponse>;
  cancelOrder(orderId: string): Promise<boolean>;
  getOrderStatus(orderId: string): Promise<BrokerOrderResponse>;
}
