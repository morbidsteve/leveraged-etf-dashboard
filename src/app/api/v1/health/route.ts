import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/health — public, no auth required.
 *
 * Returns dashboard build info + status of opt-in subsystems.
 * Useful for monitoring / status pages.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: process.env.npm_package_version ?? 'unknown',
    timestamp: new Date().toISOString(),
    features: {
      schwab: !!process.env.SCHWAB_CLIENT_ID,
      finnhub: !!process.env.FINNHUB_API_KEY && process.env.FINNHUB_API_KEY !== 'your_finnhub_key',
      worker: process.env.SERVER_WORKER_ENABLED === '1',
    },
  });
}
