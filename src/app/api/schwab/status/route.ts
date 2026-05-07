import { NextResponse } from 'next/server';
import { loadTokens, describeStatus } from '@/lib/schwab/tokenStore';
import { getOAuthConfig } from '@/lib/schwab/oauth';
import { getActiveAccountSummary, clearAccountHashCache } from '@/lib/schwab/account';

export async function GET() {
  const cfg = getOAuthConfig();
  const tokens = cfg.isConfigured ? await loadTokens() : null;
  const status = describeStatus(tokens);

  // Resolve the active account summary if connected. Failure here surfaces
  // the resolution error (e.g. "multiple accounts authorized, none pinned")
  // so the UI can prompt the user to fix.
  let account = null;
  let accountError: string | null = null;
  if (status.connected) {
    try {
      account = await getActiveAccountSummary();
      if (!account) accountError = 'Could not resolve active account';
    } catch (e) {
      accountError = e instanceof Error ? e.message : String(e);
      // Clear cache so a fresh attempt can succeed after the user fixes config
      clearAccountHashCache();
    }
  }

  return NextResponse.json({
    ...status,
    oauthConfigured: cfg.isConfigured,
    account,
    accountError,
  });
}
