import { NextResponse } from 'next/server';
import { loadTokens, describeStatus } from '@/lib/schwab/tokenStore';
import { getOAuthConfig } from '@/lib/schwab/oauth';

export async function GET() {
  const cfg = getOAuthConfig();
  const tokens = cfg.isConfigured ? await loadTokens() : null;
  const status = describeStatus(tokens);
  return NextResponse.json({
    ...status,
    oauthConfigured: cfg.isConfigured,
  });
}
