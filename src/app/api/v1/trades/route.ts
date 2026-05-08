import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/trades
 *
 * Public REST API to read the user's trades. Requires an API key with
 * 'read' scope (or higher) — Authorization: Bearer <key> or X-Api-Key.
 *
 * Note: trades are stored in localStorage on the client, not in any
 * server-side database (Tier 2 multi-user requires that migration).
 * For now, this endpoint exists as scaffolding. To make it actually
 * return user trades, a full multi-tenant migration is needed (auth
 * + Postgres + per-user data isolation).
 *
 * In the meantime: when SERVER_WORKER_ENABLED=1 and the worker has
 * synced strategies, future commits can route this to read the
 * worker's persisted state.
 */
export async function GET(request: NextRequest) {
  const { requireApiKey } = await import('@/lib/api/auth');
  const auth = await requireApiKey(request, 'read');
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json({
    note:
      'Trades are stored client-side (localStorage) in single-user mode. ' +
      'Server-side trade persistence requires the Tier 2 multi-user migration. ' +
      'Authenticated as: ' + auth.label,
    apiKey: { id: auth.id, label: auth.label, scopes: auth.scopes },
    trades: [], // Placeholder
  });
}
