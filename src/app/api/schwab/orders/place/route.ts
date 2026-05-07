import { NextRequest, NextResponse } from 'next/server';
import {
  buildBuyLimitOrder,
  buildSellLimitOrder,
  buildSellStopOrder,
  placeOrder,
} from '@/lib/schwab/client';
import { getActiveAccountHash } from '@/lib/schwab/account';

interface PlaceOrderBody {
  // The action shape from the strategy engine:
  action: 'enter' | 'exit_target' | 'exit_signal';
  symbol: string;
  shares: number;
  livePrice?: number;     // bid for sells, ask for buys
  limitPrice?: number;    // for resting target sells (exact target)
  stopPrice?: number;     // for stop orders (Sprint 6 safety net)
  bufferPct?: number;     // marketable buffer in % (default 0.2)
  duration?: 'DAY' | 'GOOD_TILL_CANCEL';
}

export async function POST(request: NextRequest) {
  let body: PlaceOrderBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.symbol || !body.shares || body.shares <= 0) {
    return NextResponse.json(
      { error: 'symbol and positive shares are required' },
      { status: 400 }
    );
  }

  const buffer = (body.bufferPct ?? 0.2) / 100; // default 0.2%

  try {
    const hash = await getActiveAccountHash();
    let order: ReturnType<typeof buildBuyLimitOrder>;
    let submittedPrice: number;

    if (body.action === 'enter') {
      if (!body.livePrice || body.livePrice <= 0) {
        return NextResponse.json(
          { error: 'livePrice required for enter action' },
          { status: 400 }
        );
      }
      // Marketable buy: limit = ask + buffer (caps worst fill price; almost
      // always fills at inside)
      submittedPrice = roundToCents(body.livePrice * (1 + buffer));
      order = buildBuyLimitOrder({
        symbol: body.symbol,
        shares: body.shares,
        limitPrice: submittedPrice,
        duration: body.duration ?? 'DAY',
      });
    } else if (body.action === 'exit_target') {
      // Resting limit at exact target price
      if (!body.limitPrice || body.limitPrice <= 0) {
        return NextResponse.json(
          { error: 'limitPrice required for exit_target action' },
          { status: 400 }
        );
      }
      submittedPrice = roundToCents(body.limitPrice);
      order = buildSellLimitOrder({
        symbol: body.symbol,
        shares: body.shares,
        limitPrice: submittedPrice,
        duration: body.duration ?? 'GOOD_TILL_CANCEL',
      });
    } else if (body.action === 'exit_signal') {
      if (!body.livePrice || body.livePrice <= 0) {
        return NextResponse.json(
          { error: 'livePrice required for exit_signal action' },
          { status: 400 }
        );
      }
      // Marketable sell: limit = bid - buffer
      submittedPrice = roundToCents(body.livePrice * (1 - buffer));
      order = buildSellLimitOrder({
        symbol: body.symbol,
        shares: body.shares,
        limitPrice: submittedPrice,
        duration: body.duration ?? 'DAY',
      });
    } else {
      return NextResponse.json(
        { error: `Unknown action: ${body.action}` },
        { status: 400 }
      );
    }

    const orderId = await placeOrder(hash, order);

    return NextResponse.json({
      orderId,
      submittedPrice,
      action: body.action,
      symbol: body.symbol,
      shares: body.shares,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}

function roundToCents(n: number): number {
  return Math.round(n * 100) / 100;
}

// Optional: place a broker-side safety stop after a buy fills.
// Used by Sprint 6's safety-net flow.
export async function PATCH(request: NextRequest) {
  let body: { symbol: string; shares: number; stopPrice: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.symbol || !body.shares || !body.stopPrice) {
    return NextResponse.json(
      { error: 'symbol, shares, and stopPrice are required' },
      { status: 400 }
    );
  }

  try {
    const hash = await getActiveAccountHash();
    const order = buildSellStopOrder({
      symbol: body.symbol,
      shares: body.shares,
      stopPrice: roundToCents(body.stopPrice),
      duration: 'GOOD_TILL_CANCEL',
    });
    const orderId = await placeOrder(hash, order);
    return NextResponse.json({
      orderId,
      stopPrice: roundToCents(body.stopPrice),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
