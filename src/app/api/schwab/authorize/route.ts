import { NextResponse } from 'next/server';
import { buildAuthorizeUrl, getOAuthConfig } from '@/lib/schwab/oauth';

export async function GET() {
  const cfg = getOAuthConfig();
  if (!cfg.isConfigured) {
    return NextResponse.json(
      {
        error: 'Schwab OAuth not configured',
        missing: {
          SCHWAB_CLIENT_ID: !cfg.clientId,
          SCHWAB_CLIENT_SECRET: !cfg.clientSecret,
          SCHWAB_REDIRECT_URI: !cfg.redirectUri,
        },
      },
      { status: 503 }
    );
  }
  return NextResponse.redirect(buildAuthorizeUrl());
}
