import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/schwab/oco — submit a broker-side OCO (one-cancels-other)
 * pair: target sell limit + stop loss. After a buy fills, this gives
 * the broker the floor and ceiling so the engine doesn't have to
 * babysit the position.
 *
 * Body: { symbol, shares, targetPrice, stopPrice, duration? }
 */
export async function POST(request: NextRequest) {
  let body: {
    symbol?: string;
    shares?: number;
    targetPrice?: number;
    stopPrice?: number;
    duration?: 'DAY' | 'GOOD_TILL_CANCEL';
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { symbol, shares, targetPrice, stopPrice, duration = 'GOOD_TILL_CANCEL' } = body;
  if (!symbol || !shares || shares <= 0 || !targetPrice || !stopPrice) {
    return NextResponse.json(
      { error: 'symbol, shares (>0), targetPrice, stopPrice all required' },
      { status: 400 }
    );
  }
  if (targetPrice <= stopPrice) {
    return NextResponse.json(
      { error: 'targetPrice must be > stopPrice for a long-position OCO' },
      { status: 400 }
    );
  }

  try {
    const { getActiveAccountHash } = await import('@/lib/schwab/account');
    const { placeOrder } = await import('@/lib/schwab/client');
    const { recordAudit } = await import('@/lib/schwab/orderGuardrails');
    const hash = await getActiveAccountHash();

    // Build the OCO order JSON. Schwab's order grammar:
    //   orderStrategyType: 'OCO'
    //   childOrderStrategies: [<sell limit>, <sell stop>]
    const ocoOrder = {
      orderStrategyType: 'OCO',
      childOrderStrategies: [
        {
          orderType: 'LIMIT',
          session: 'NORMAL',
          duration,
          orderStrategyType: 'SINGLE',
          price: Number(targetPrice.toFixed(2)),
          orderLegCollection: [
            {
              instruction: 'SELL',
              quantity: shares,
              instrument: { symbol, assetType: 'EQUITY' },
            },
          ],
        },
        {
          orderType: 'STOP',
          session: 'NORMAL',
          duration,
          orderStrategyType: 'SINGLE',
          stopPrice: Number(stopPrice.toFixed(2)),
          orderLegCollection: [
            {
              instruction: 'SELL',
              quantity: shares,
              instrument: { symbol, assetType: 'EQUITY' },
            },
          ],
        },
      ],
    };

    const orderId = await placeOrder(hash, ocoOrder);
    await recordAudit({
      outcome: 'submitted',
      symbol,
      shares,
      estimatedPrice: targetPrice,
      orderId: orderId ?? undefined,
      reason: `OCO target ${targetPrice} / stop ${stopPrice}`,
    });
    return NextResponse.json({
      orderId,
      target: targetPrice,
      stop: stopPrice,
      shares,
      symbol,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
