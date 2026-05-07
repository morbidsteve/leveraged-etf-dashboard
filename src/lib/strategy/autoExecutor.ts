'use client';

import { Action, Strategy } from '@/types/strategy';

interface PlaceOrderResponse {
  orderId: string | null;
  submittedPrice: number;
  action: string;
  symbol: string;
  shares: number;
  error?: string;
}

/**
 * Browser-side dispatcher: translates an evaluator Action into a POST to
 * /api/schwab/orders/place. Tokens stay server-side; the browser only
 * supplies the action shape and the live price (for marketable orders).
 */
export async function dispatchAutoOrder(
  action: Action,
  livePrice: number,
  strategy: Strategy
): Promise<PlaceOrderResponse> {
  let payload: Record<string, unknown>;

  if (action.kind === 'enter') {
    payload = {
      action: 'enter',
      symbol: action.ticker,
      shares: action.shares,
      livePrice,
      bufferPct: 0.2,
    };
  } else {
    // exit — distinguish target (resting) vs signal (marketable)
    if (action.orderType === 'resting_limit' && action.limitPrice !== undefined) {
      payload = {
        action: 'exit_target',
        symbol: action.ticker,
        shares: action.shares,
        limitPrice: action.limitPrice,
      };
    } else {
      payload = {
        action: 'exit_signal',
        symbol: action.ticker,
        shares: action.shares,
        livePrice,
        bufferPct: 0.2,
      };
    }
  }

  const resp = await fetch('/api/schwab/orders/place', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = (await resp.json()) as PlaceOrderResponse;
  if (!resp.ok) {
    throw new Error(data.error || `Schwab order place returned ${resp.status}`);
  }
  return data;
}

// Used by callers that want to mute auto-mode for a list of strategies
// (kill switch).
export async function disableAllAutoStrategies(strategies: Strategy[]): Promise<Strategy[]> {
  // Pure: returns the list of strategies that *would* be muted; caller
  // applies the actual store updates. Kept as a function for symmetry
  // with future server-side enforcement.
  return strategies.filter((s) => s.mode === 'auto');
}
