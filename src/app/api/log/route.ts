import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/log — accept a JSON log payload from the browser and emit
 * it as a structured server log. When SENTRY_DSN is set, also forwards
 * 'error' and 'warn' levels to Sentry's HTTPS Store/Envelope endpoint.
 *
 * The Sentry forward is intentionally lightweight — no SDK dependency,
 * just a JSON POST to the envelope endpoint derived from the DSN. This
 * keeps the bundle small and works without installing @sentry/nextjs.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const level = (body.level === 'error' || body.level === 'warn' ? body.level : 'info') as
      | 'info'
      | 'warn'
      | 'error';
    const fields = {
      source: body.source ?? 'browser',
      message: body.message,
      stack: body.stack,
      componentStack: body.componentStack,
      url: body.url,
      userAgent: req.headers.get('user-agent') ?? undefined,
    };
    logger[level]('client.log', fields);

    // Forward errors + warnings to Sentry if configured
    if ((level === 'error' || level === 'warn') && process.env.SENTRY_DSN) {
      forwardToSentry(level, fields).catch((err) =>
        logger.warn('sentry.forward.failed', {
          err: err instanceof Error ? err.message : String(err),
        })
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error('client.log.parse_failed', {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

/**
 * Minimal Sentry envelope POST. Parses the DSN, builds a single-event
 * envelope, fires it. No retries, no batching — fire-and-forget.
 *
 * DSN format: https://<publicKey>@<host>/<projectId>
 */
async function forwardToSentry(
  level: 'error' | 'warn',
  fields: Record<string, unknown>
): Promise<void> {
  const dsn = process.env.SENTRY_DSN!;
  let parsed: URL;
  try {
    parsed = new URL(dsn);
  } catch {
    return;
  }
  const publicKey = parsed.username;
  const projectId = parsed.pathname.replace(/^\//, '');
  if (!publicKey || !projectId) return;

  const envelopeUrl = `${parsed.protocol}//${parsed.host}/api/${projectId}/envelope/`;
  const eventId = crypto.randomUUID().replace(/-/g, '');
  const ts = Date.now() / 1000;
  const sentryLevel = level === 'error' ? 'error' : 'warning';
  const event = {
    event_id: eventId,
    timestamp: ts,
    level: sentryLevel,
    platform: 'javascript',
    logger: 'leveraged-etf-dashboard',
    message: { formatted: String(fields.message ?? 'client log') },
    tags: { source: String(fields.source ?? 'browser') },
    extra: fields,
    environment: process.env.NODE_ENV ?? 'production',
  };
  const envelope =
    JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }) +
    '\n' +
    JSON.stringify({ type: 'event' }) +
    '\n' +
    JSON.stringify(event) +
    '\n';
  await fetch(envelopeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=leveraged-etf-dashboard/1.0`,
    },
    body: envelope,
  });
}
