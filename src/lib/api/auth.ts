import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, touchApiKey, ApiScope, ApiKeyRecord } from './keys';

/**
 * Helper for API routes that require an API key. Pulls the key from
 * either the Authorization header (Bearer scheme) or the x-api-key
 * header. Returns the key record on success or a NextResponse to
 * return on failure.
 *
 * Usage in a route:
 *   const auth = await requireApiKey(req, 'read');
 *   if (auth instanceof NextResponse) return auth;
 *   // auth is the ApiKeyRecord; proceed with the request
 */
export async function requireApiKey(
  req: NextRequest,
  scope: ApiScope = 'read'
): Promise<ApiKeyRecord | NextResponse> {
  const auth = req.headers.get('authorization') ?? '';
  const xKey = req.headers.get('x-api-key') ?? '';
  let raw = '';
  if (auth.startsWith('Bearer ')) raw = auth.slice(7).trim();
  else if (xKey) raw = xKey.trim();

  if (!raw) {
    return NextResponse.json(
      { error: 'Missing API key. Provide via Authorization: Bearer <key> or X-Api-Key header.' },
      { status: 401 }
    );
  }
  const record = await validateApiKey(raw, scope);
  if (!record) {
    return NextResponse.json(
      { error: 'Invalid or insufficient API key' },
      { status: 403 }
    );
  }
  await touchApiKey(record.id);
  return record;
}
