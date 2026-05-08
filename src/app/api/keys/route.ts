import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET  /api/keys           — list all keys (sans raw)
 * POST /api/keys           — create a new key { label, scopes }
 * DELETE /api/keys?id=...  — revoke a key
 *
 * Note: this endpoint is itself unguarded — it's intended for the
 * single-user personal-deploy case. Multi-tenant deployments should
 * gate it behind session auth.
 */
export async function GET() {
  const { listApiKeys } = await import('@/lib/api/keys');
  const keys = await listApiKeys();
  // Strip the hash from the response — the user shouldn't need to see it
  return NextResponse.json({
    keys: keys.map((k) => ({
      id: k.id,
      label: k.label,
      scopes: k.scopes,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
      revoked: k.revoked ?? false,
    })),
  });
}

export async function POST(request: NextRequest) {
  let body: { label?: string; scopes?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const validScopes = ['read', 'write', 'admin'] as const;
  const scopes = (body.scopes ?? ['read']).filter((s): s is typeof validScopes[number] =>
    (validScopes as readonly string[]).includes(s)
  );
  const { createApiKey } = await import('@/lib/api/keys');
  const created = await createApiKey(body.label ?? 'Unnamed', scopes);
  return NextResponse.json({
    id: created.id,
    label: created.label,
    scopes: created.scopes,
    raw: created.raw,
    warning:
      'Save this key now — it will NOT be shown again. The dashboard only stores its hash.',
  });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id param required' }, { status: 400 });
  const { revokeApiKey } = await import('@/lib/api/keys');
  const ok = await revokeApiKey(id);
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
