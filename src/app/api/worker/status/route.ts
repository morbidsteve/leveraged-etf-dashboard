import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/worker/status
 *
 * Returns the worker's current state. The worker starts lazily on first
 * call when SERVER_WORKER_ENABLED=1.
 */
export async function GET() {
  const enabled = process.env.SERVER_WORKER_ENABLED === '1';
  if (!enabled) {
    return NextResponse.json({ enabled: false, status: null });
  }
  const { startWorker, getWorkerStatus } = await import('@/lib/worker/strategyWorker');
  await startWorker();
  const status = await getWorkerStatus();
  return NextResponse.json({
    enabled,
    status: status
      ? {
          startedAt: status.startedAt,
          lastTickAt: status.lastTickAt,
          ticks: status.ticks,
          errors: status.errors,
          strategyCount: status.strategies.length,
          runtimeCount: Object.keys(status.runtimes).length,
          recentEvents: status.recentEvents.slice(-50).reverse(),
        }
      : null,
  });
}
