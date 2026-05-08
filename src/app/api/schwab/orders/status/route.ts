import { NextRequest, NextResponse } from 'next/server';
import { getOrderStatus } from '@/lib/schwab/client';
import { getActiveAccountHash } from '@/lib/schwab/account';

/**
 * GET /api/schwab/orders/status?orderId=...
 *
 * Returns the current state + fill info for a Schwab order. Polled by the
 * client after placing an order to confirm fill and capture the actual fill
 * price (which may differ from the limit price we submitted).
 */
export async function GET(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get('orderId');
  if (!orderId) {
    return NextResponse.json({ error: 'orderId param required' }, { status: 400 });
  }

  try {
    const hash = await getActiveAccountHash();
    const status = await getOrderStatus(hash, orderId);
    return NextResponse.json(status);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
