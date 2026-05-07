/**
 * Schwab OAuth 2.0 flow helpers.
 *
 * Flow: user clicks "Connect Schwab" -> we redirect to Schwab's consent
 * page with our client_id and redirect_uri -> user logs in & approves ->
 * Schwab redirects back to /api/schwab/callback?code=... -> we exchange the
 * code for an access_token + refresh_token -> persist via tokenStore.
 *
 * Refresh: access tokens last 30 min; refresh tokens 7 days. The client
 * wrapper in client.ts auto-refreshes the access token. After 7 days the
 * user must repeat the browser login (Schwab's design, no workaround).
 */

import { SchwabTokens, saveTokens, loadTokens } from './tokenStore';

const SCHWAB_AUTH_HOST = 'https://api.schwabapi.com';

export function getOAuthConfig() {
  const clientId = process.env.SCHWAB_CLIENT_ID;
  const clientSecret = process.env.SCHWAB_CLIENT_SECRET;
  const redirectUri = process.env.SCHWAB_REDIRECT_URI;
  return {
    clientId,
    clientSecret,
    redirectUri,
    isConfigured: Boolean(clientId && clientSecret && redirectUri),
  };
}

export function buildAuthorizeUrl(): string {
  const { clientId, redirectUri } = getOAuthConfig();
  if (!clientId || !redirectUri) {
    throw new Error('Schwab OAuth not configured (set SCHWAB_CLIENT_ID and SCHWAB_REDIRECT_URI)');
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
  });
  return `${SCHWAB_AUTH_HOST}/v1/oauth/authorize?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  id_token?: string;
}

async function postTokenEndpoint(body: URLSearchParams): Promise<TokenResponse> {
  const { clientId, clientSecret } = getOAuthConfig();
  if (!clientId || !clientSecret) throw new Error('Schwab OAuth not configured');
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const resp = await fetch(`${SCHWAB_AUTH_HOST}/v1/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Schwab token endpoint returned ${resp.status}: ${text}`);
  }
  return (await resp.json()) as TokenResponse;
}

/** Exchange an authorization code (from /callback) for an access+refresh token. */
export async function exchangeCode(code: string): Promise<SchwabTokens> {
  const { redirectUri } = getOAuthConfig();
  if (!redirectUri) throw new Error('SCHWAB_REDIRECT_URI not set');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
  const resp = await postTokenEndpoint(body);
  const now = Date.now();
  const tokens: SchwabTokens = {
    ...resp,
    obtained_at: now,
    refresh_token_obtained_at: now,
  };
  await saveTokens(tokens);
  return tokens;
}

/** Use the refresh_token to get a fresh access_token (refresh_token does NOT roll). */
export async function refreshAccessToken(): Promise<SchwabTokens> {
  const existing = await loadTokens();
  if (!existing) throw new Error('No tokens stored — run the OAuth flow first');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: existing.refresh_token,
  });
  const resp = await postTokenEndpoint(body);
  const now = Date.now();
  const tokens: SchwabTokens = {
    ...existing,
    access_token: resp.access_token,
    token_type: resp.token_type,
    expires_in: resp.expires_in,
    scope: resp.scope ?? existing.scope,
    id_token: resp.id_token ?? existing.id_token,
    obtained_at: now,
    // refresh_token_obtained_at intentionally NOT bumped — Schwab refresh
    // tokens have a hard 7-day cap that doesn't reset on use.
  };
  await saveTokens(tokens);
  return tokens;
}

/**
 * Get a usable access token, refreshing if expiring within 60 s.
 * Returns null if not connected or if the refresh token has expired
 * (caller should surface "re-auth needed" UX).
 */
export async function getAccessToken(): Promise<string | null> {
  const existing = await loadTokens();
  if (!existing) return null;

  const now = Date.now();
  const accessExpiresAt = existing.obtained_at + existing.expires_in * 1000;
  const refreshExpiresAt =
    existing.refresh_token_obtained_at + 7 * 24 * 3600 * 1000;

  if (now >= refreshExpiresAt) {
    // Refresh token dead. Caller surfaces re-auth.
    return null;
  }

  if (now < accessExpiresAt - 60_000) {
    return existing.access_token;
  }

  // Access expiring soon — refresh now.
  try {
    const refreshed = await refreshAccessToken();
    return refreshed.access_token;
  } catch (err) {
    console.error('[schwab/oauth] refresh failed:', err);
    return null;
  }
}
