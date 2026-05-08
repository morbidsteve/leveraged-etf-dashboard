import { NextResponse } from 'next/server';
import { loadTokens } from '@/lib/schwab/tokenStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/health — readiness/liveness probe.
 *
 * Returns:
 *   ok                : overall status
 *   uptimeSec         : process uptime
 *   schwabConnected   : whether a Schwab token is on disk
 *   chatProvider      : openai | anthropic | none
 *   finnhubConfigured : whether FINNHUB_API_KEY is set (used by scanner)
 *   nodeVersion
 *
 * Used by the dashboard's HealthGate badge and by external monitors.
 */
export async function GET() {
  let schwab = false;
  try {
    const tokens = await loadTokens();
    schwab = Boolean(tokens?.access_token);
  } catch {
    schwab = false;
  }
  const chatProvider = process.env.ANTHROPIC_API_KEY
    ? 'anthropic'
    : process.env.OPENAI_API_KEY
    ? 'openai'
    : 'none';

  return NextResponse.json({
    ok: true,
    uptimeSec: Math.round(process.uptime()),
    schwabConnected: schwab,
    chatProvider,
    finnhubConfigured: Boolean(process.env.FINNHUB_API_KEY),
    nodeVersion: process.version,
    ts: new Date().toISOString(),
  });
}
