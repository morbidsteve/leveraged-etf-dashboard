import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/log — accept a JSON log payload from the browser and emit
 * it as a structured server log. Used by ErrorBoundary, fetch-error
 * reporters, etc. If SENTRY_DSN is configured, a future enhancement
 * can forward errors to Sentry from here.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const level = (body.level === 'error' || body.level === 'warn' ? body.level : 'info') as
      | 'info'
      | 'warn'
      | 'error';
    logger[level]('client.log', {
      source: body.source ?? 'browser',
      message: body.message,
      stack: body.stack,
      componentStack: body.componentStack,
      url: body.url,
      userAgent: req.headers.get('user-agent') ?? undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error('client.log.parse_failed', {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
