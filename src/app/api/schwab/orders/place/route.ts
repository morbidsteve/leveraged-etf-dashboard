import { NextRequest, NextResponse } from 'next/server';
import {
  buildBuyLimitOrder,
  buildSellLimitOrder,
  buildSellStopOrder,
  placeOrder,
} from '@/lib/schwab/client';
import { getActiveAccountHash } from '@/lib/schwab/account';
import { checkGuardrails, recordAudit } from '@/lib/schwab/orderGuardrails';
import { getMarketSession, schwabOrderSession } from '@/lib/marketHours';

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

  // Determine current market session for the order. Schwab rejects
  // NORMAL-session orders during pre/post hours; we map the session
  // here and refuse to send orders when markets are closed.
  const session = getMarketSession();
  const orderSession = schwabOrderSession(session);
  if (!orderSession) {
    await recordAudit({
      outcome: 'rejected',
      symbol: body.symbol,
      shares: body.shares,
      estimatedPrice: body.livePrice ?? body.limitPrice ?? 0,
      reason: 'markets_closed',
    });
    return NextResponse.json(
      { error: 'Markets are closed — order not submitted.' },
      { status: 403 }
    );
  }

  // Server-side guardrails — runs BEFORE auth/account resolution so we
  // never even hit Schwab if the order is over a configured cap.
  const estimatedPrice =
    body.action === 'enter' || body.action === 'exit_signal'
      ? body.livePrice ?? 0
      : body.limitPrice ?? body.livePrice ?? 0;
  const guard = await checkGuardrails({
    symbol: body.symbol,
    shares: body.shares,
    estimatedPrice,
  });
  if (!guard.allow) {
    await recordAudit({
      outcome: 'rejected',
      symbol: body.symbol,
      shares: body.shares,
      estimatedPrice,
      reason: guard.reason,
    });
    return NextResponse.json(
      {
        error: `Server guardrail rejected order: ${guard.reason}`,
        guardConfig: guard.config,
        ordersToday: guard.ordersToday,
      },
      { status: 403 }
    );
  }

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
        session: orderSession,
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
        session: orderSession,
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
        session: orderSession,
      });
    } else {
      return NextResponse.json(
        { error: `Unknown action: ${body.action}` },
        { status: 400 }
      );
    }

    let orderId: string | null = null;
    try {
      orderId = await placeOrder(hash, order);
      await recordAudit({
        outcome: 'submitted',
        symbol: body.symbol,
        shares: body.shares,
        estimatedPrice: submittedPrice,
        orderId: orderId ?? undefined,
      });
    } catch (placeErr) {
      await recordAudit({
        outcome: 'failed',
        symbol: body.symbol,
        shares: body.shares,
        estimatedPrice: submittedPrice,
        reason: placeErr instanceof Error ? placeErr.message.slice(0, 200) : String(placeErr).slice(0, 200),
      });
      throw placeErr;
    }

    return NextResponse.json({
      orderId,
      submittedPrice,
      action: body.action,
      symbol: body.symbol,
      shares: body.shares,
      session: orderSession,
      marketSession: session,
      ordersToday: guard.ordersToday + 1,
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
