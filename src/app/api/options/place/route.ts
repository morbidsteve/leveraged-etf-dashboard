import { NextRequest, NextResponse } from 'next/server';
import { buildOptionOrder, placeOptionOrder } from '@/lib/schwab/options';
import { getActiveAccountHash } from '@/lib/schwab/account';
import { recordAudit } from '@/lib/schwab/orderGuardrails';
import { OptionOrderRequest } from '@/types/options';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/options/place
 *
 * Submits an options order to Schwab. Body shape: OptionOrderRequest.
 * Server-side guardrails (premium cap, daily count, symbol allowlist
 * by underlying) apply before the order leaves the server.
 *
 * Notes:
 *   - Premium = |netPrice| × |qty| × 100 across all legs (a credit
 *     position's "premium received" still counts against the cap as a
 *     proxy for risk exposure).
 *   - Symbol allowlist checks the underlying, not the OCC option symbol.
 */
export async function POST(request: NextRequest) {
  let body: OptionOrderRequest & { underlying?: string };
  try {
    body = (await request.json()) as OptionOrderRequest & { underlying?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.legs || body.legs.length === 0) {
    return NextResponse.json({ error: 'legs required' }, { status: 400 });
  }
  if (!Number.isFinite(body.netPrice)) {
    return NextResponse.json({ error: 'netPrice must be a number' }, { status: 400 });
  }

  // Premium-based guardrail (separate from equity cap)
  const totalQty = body.legs.reduce((s, l) => s + l.quantity, 0);
  const premium = Math.abs(body.netPrice) * totalQty * 100;
  const premiumCap = Number(process.env.SCHWAB_MAX_OPTION_PREMIUM ?? 0);
  if (premiumCap > 0 && premium > premiumCap) {
    await recordAudit({
      outcome: 'rejected',
      symbol: body.underlying ?? 'OPTION',
      shares: totalQty,
      estimatedPrice: Math.abs(body.netPrice),
      reason: `Options premium $${premium.toFixed(0)} exceeds cap $${premiumCap}`,
    });
    return NextResponse.json(
      {
        error: `Options premium $${premium.toFixed(0)} exceeds SCHWAB_MAX_OPTION_PREMIUM cap $${premiumCap}`,
      },
      { status: 403 }
    );
  }

  // Symbol allowlist (underlying-level)
  const allowList = (process.env.SCHWAB_OPTION_SYMBOL_ALLOWLIST ?? process.env.SCHWAB_SYMBOL_ALLOWLIST ?? '')
    .split(/[,\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (allowList.length > 0 && body.underlying) {
    if (!allowList.includes(body.underlying.toUpperCase())) {
      await recordAudit({
        outcome: 'rejected',
        symbol: body.underlying,
        shares: totalQty,
        estimatedPrice: Math.abs(body.netPrice),
        reason: `Underlying not in options allowlist`,
      });
      return NextResponse.json(
        { error: `${body.underlying} not in SCHWAB_OPTION_SYMBOL_ALLOWLIST` },
        { status: 403 }
      );
    }
  }

  let orderId: string | null = null;
  try {
    const hash = await getActiveAccountHash();
    const orderJson = buildOptionOrder(body);
    orderId = await placeOptionOrder(hash, orderJson);
    await recordAudit({
      outcome: 'submitted',
      symbol: body.underlying ?? body.legs[0].contractSymbol,
      shares: totalQty,
      estimatedPrice: Math.abs(body.netPrice),
      orderId: orderId ?? undefined,
    });
    return NextResponse.json({
      orderId,
      netPrice: body.netPrice,
      legs: body.legs.length,
      premium,
    });
  } catch (e) {
    await recordAudit({
      outcome: 'failed',
      symbol: body.underlying ?? 'OPTION',
      shares: totalQty,
      estimatedPrice: Math.abs(body.netPrice),
      reason: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200),
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
