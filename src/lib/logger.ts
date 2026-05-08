/**
 * Tiny structured logger for server routes. Emits one JSON line per
 * call to stdout — easy to ingest into a log collector (Datadog,
 * CloudWatch, etc.) or `jq` locally.
 *
 * Usage:
 *   logger.info('schwab.order.placed', { orderId, symbol })
 *   logger.error('candles.fetch.failed', { ticker, err: e.message })
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, event: string, fields?: Record<string, unknown>) {
  const line = {
    ts: new Date().toISOString(),
    level,
    event,
    ...(fields ?? {}),
  };
  // Use the matching console method so log collectors that route by
  // stream (stdout vs stderr) put errors in the right place.
  if (level === 'error') console.error(JSON.stringify(line));
  else if (level === 'warn') console.warn(JSON.stringify(line));
  else console.log(JSON.stringify(line));
}

export const logger = {
  debug: (event: string, fields?: Record<string, unknown>) =>
    emit('debug', event, fields),
  info: (event: string, fields?: Record<string, unknown>) =>
    emit('info', event, fields),
  warn: (event: string, fields?: Record<string, unknown>) =>
    emit('warn', event, fields),
  error: (event: string, fields?: Record<string, unknown>) =>
    emit('error', event, fields),
};
