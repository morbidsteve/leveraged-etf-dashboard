import { NextRequest, NextResponse } from 'next/server';
import { Strategy } from '@/types/strategy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/worker/sync
 *
 * The browser pushes its current strategy list up to the server-side
 * worker. The worker replaces its strategy set in full and prunes any
 * runtimes whose (strategy, ticker) pair no longer exists.
 *
 * Body: { strategies: Strategy[] }
 */
export async function POST(request: NextRequest) {
  if (process.env.SERVER_WORKER_ENABLED !== '1') {
    return NextResponse.json(
      { error: 'Server worker not enabled (set SERVER_WORKER_ENABLED=1)' },
      { status: 400 }
    );
  }
  let body: { strategies?: Strategy[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!Array.isArray(body.strategies)) {
    return NextResponse.json({ error: 'strategies array required' }, { status: 400 });
  }
  try {
    const { startWorker, syncStrategies } = await import('@/lib/worker/strategyWorker');
    await startWorker();
    await syncStrategies(body.strategies);
    return NextResponse.json({ ok: true, count: body.strategies.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
