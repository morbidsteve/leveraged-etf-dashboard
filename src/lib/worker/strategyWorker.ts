/**
 * Server-resident strategy worker. Runs a tick loop independent of any
 * browser tab being open. The worker:
 *
 *   1. Reads strategy definitions from a server-side persisted file
 *      (synced from the browser via /api/worker/sync)
 *   2. Pulls fresh candles from Yahoo for every (strategy, ticker) pair
 *   3. Evaluates the engine state machine once per tick
 *   4. Logs fires + state transitions to a worker event log readable by
 *      the browser via /api/worker/status
 *
 * Auto-mode actions are NOT yet wired through here — the browser-side
 * engine still owns broker order placement until the user explicitly
 * enables server-side execution. Sprint 13 ships the foundation +
 * read-only "what would have fired" log; full broker execution comes
 * in a follow-up once we've validated the worker doesn't drift from
 * the browser's view of strategy state.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { Strategy, StrategyRuntime, DataContext } from '@/types/strategy';
import { Candle } from '@/types';
import { tick, initialRuntime } from '@/lib/strategy/evaluator';
import { runtimeKey } from '@/types/strategy';
import { calculateRSIWithTimestamps, DEFAULT_RSI_CONFIG } from '@/lib/rsi';
import { calculateEMA, calculateSMA, calculateVWAP } from '@/lib/indicators';
import { getMarketSession, getPollIntervalMs } from '@/lib/marketHours';

const DATA_DIR = process.env.WORKER_DATA_DIR ?? '/app/data';
const STATE_FILE = path.join(DATA_DIR, 'worker-state.json');
const EVENTS_FILE = path.join(DATA_DIR, 'worker-events.log');

interface WorkerState {
  startedAt: string;
  lastTickAt: string | null;
  ticks: number;
  errors: number;
  /** Strategies pushed up by the browser via /api/worker/sync. */
  strategies: Strategy[];
  /** Per-(strategyId:ticker) runtime state. */
  runtimes: Record<string, StrategyRuntime>;
  /** Last 200 events for surfacing in the UI. */
  recentEvents: Array<{ ts: string; type: string; detail: string }>;
  /** Master kill switch synced from the browser settings store. When
   *  true, the worker keeps evaluating but blocks all order dispatch. */
  killSwitch?: boolean;
}

let state: WorkerState | null = null;
let timer: NodeJS.Timeout | null = null;
let started = false;

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function loadState(): Promise<WorkerState> {
  try {
    const text = await fs.readFile(STATE_FILE, 'utf8');
    const parsed = JSON.parse(text) as WorkerState;
    return parsed;
  } catch {
    return {
      startedAt: new Date().toISOString(),
      lastTickAt: null,
      ticks: 0,
      errors: 0,
      strategies: [],
      runtimes: {},
      recentEvents: [],
    };
  }
}

async function saveState() {
  if (!state) return;
  await ensureDataDir();
  await fs.writeFile(STATE_FILE, JSON.stringify(state), 'utf8');
}

async function logEvent(type: string, detail: string) {
  if (!state) return;
  const ev = { ts: new Date().toISOString(), type, detail };
  state.recentEvents = [...state.recentEvents.slice(-199), ev];
  // Append to log file too (best-effort)
  try {
    await ensureDataDir();
    await fs.appendFile(EVENTS_FILE, `${ev.ts}\t${type}\t${detail}\n`);
  } catch {
    // ignore disk errors
  }
}

/**
 * Pull recent candles from Yahoo for one ticker. Mirrors what the
 * browser does via /api/candles, but called directly from the worker
 * to avoid a self-HTTP roundtrip.
 */
async function fetchCandles(ticker: string, range = '5d', interval = '1m'): Promise<Candle[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker
  )}?range=${range}&interval=${interval}&includePrePost=false`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'leveraged-etf-dashboard-worker/1.0' },
    cache: 'no-store',
  });
  if (!resp.ok) throw new Error(`Yahoo ${resp.status}`);
  const data = (await resp.json()) as {
    chart: {
      result?: Array<{
        timestamp: number[];
        indicators: {
          quote: Array<{
            open: (number | null)[];
            high: (number | null)[];
            low: (number | null)[];
            close: (number | null)[];
            volume: (number | null)[];
          }>;
        };
      }>;
    };
  };
  const r = data.chart.result?.[0];
  if (!r) return [];
  const q = r.indicators.quote[0];
  const out: Candle[] = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const o = q.open[i];
    const h = q.high[i];
    const l = q.low[i];
    const c = q.close[i];
    if (o == null || h == null || l == null || c == null) continue;
    out.push({
      time: r.timestamp[i],
      open: o,
      high: h,
      low: l,
      close: c,
      volume: q.volume[i] ?? 0,
    });
  }
  return out;
}

/** Build a DataContext from a candle series for one ticker. */
function buildContexts(
  ticker: string,
  candles: Candle[],
  rsiPeriod: number
): { prev: DataContext | null; curr: DataContext | null } {
  if (candles.length < 2) return { prev: null, curr: null };
  const last = candles[candles.length - 1];
  const prevC = candles[candles.length - 2];
  const rsi = calculateRSIWithTimestamps(candles, rsiPeriod);
  const ema20 = calculateEMA(candles, 20);
  const ema50 = calculateEMA(candles, 50);
  const sma20 = calculateSMA(candles, 20);
  const vwap = calculateVWAP(candles);

  const lastRsi = rsi.length > 0 ? rsi[rsi.length - 1].value : Number.NaN;
  const prevRsi = rsi.length > 1 ? rsi[rsi.length - 2].value : Number.NaN;
  const lastEma20 = ema20.length > 0 ? ema20[ema20.length - 1].value : Number.NaN;
  const lastEma50 = ema50.length > 0 ? ema50[ema50.length - 1].value : Number.NaN;
  const lastSma20 = sma20.length > 0 ? sma20[sma20.length - 1].value : Number.NaN;
  const lastVwap = vwap.length > 0 ? vwap[vwap.length - 1].value : null;

  return {
    curr: {
      ticker,
      price: last.close,
      rsi: { [rsiPeriod]: lastRsi },
      ema: { 20: lastEma20, 50: lastEma50 },
      sma: { 20: lastSma20 },
      vwap: lastVwap,
      volume: last.volume ?? 0,
      timestamp: new Date(last.time * 1000),
    },
    prev: {
      ticker,
      price: prevC.close,
      rsi: { [rsiPeriod]: prevRsi },
      ema: { 20: lastEma20, 50: lastEma50 },
      sma: { 20: lastSma20 },
      vwap: lastVwap,
      volume: prevC.volume ?? 0,
      timestamp: new Date(prevC.time * 1000),
    },
  };
}

async function runOneTick() {
  if (!state) return;
  state.lastTickAt = new Date().toISOString();
  state.ticks += 1;

  // Build the unique set of tickers across enabled strategies
  const tickers = new Set<string>();
  for (const s of state.strategies) {
    if (!s.enabled) continue;
    for (const t of s.tickers) tickers.add(t);
  }

  // Fetch candles per ticker (parallel)
  const candleByTicker = new Map<string, Candle[]>();
  await Promise.all(
    Array.from(tickers).map(async (t) => {
      try {
        const candles = await fetchCandles(t);
        candleByTicker.set(t, candles);
      } catch (e) {
        await logEvent('error', `fetchCandles(${t}): ${e instanceof Error ? e.message : String(e)}`);
        state!.errors += 1;
      }
    })
  );

  // Session gate — same logic the browser engine uses
  const session = getMarketSession();
  if (session === 'closed') {
    // Markets closed; nothing to do this tick. We still saveState
    // so the heartbeat ticks even when idle.
    await saveState();
    return;
  }

  // Tick each (strategy, ticker). The worker only processes strategies
  // explicitly opted into server-side execution. Browser-channel ones
  // belong to whichever browser tab the user has open.
  for (const s of state.strategies) {
    if (!s.enabled) continue;
    if (s.executionChannel !== 'server') continue;

    // Per-strategy session allow-list (same default as browser engine)
    const allowed = s.sessions ?? ['open'];
    if (!allowed.includes(session)) continue;

    const rsiPeriod = s.rsiConfig?.period ?? DEFAULT_RSI_CONFIG.period;
    for (const t of s.tickers) {
      const candles = candleByTicker.get(t);
      if (!candles || candles.length < 2) continue;
      const { prev, curr } = buildContexts(t, candles, rsiPeriod);
      if (!curr) continue;

      const key = runtimeKey(s.id, t);
      const runtime = state.runtimes[key] ?? initialRuntime(s.id, t);
      const out = tick({
        strategy: s,
        runtime,
        prevCtx: prev,
        currCtx: curr,
        now: new Date(),
      });
      state.runtimes[key] = out.runtime;
      for (const ev of out.events) {
        await logEvent(ev.type, `${s.name}/${t}: ${ev.detail}`);
      }
      for (const action of out.actions) {
        const summary = `${s.name}/${t}: ${action.kind.toUpperCase()} ${action.shares} @ ${curr.price.toFixed(2)} — ${action.reason}`;
        await logEvent('action', summary);

        // Mode-aware dispatch:
        //   paper          → log only (no fills tracked here yet)
        //   manual_confirm → log only (no notification surface for the
        //                    server worker — paired browser tab still
        //                    handles confirms via /api/worker/status poll)
        //   auto           → dispatch via the same Schwab order route
        //                    used by the browser engine.
        if (s.mode === 'auto') {
          if (state.killSwitch) {
            await logEvent('blocked', `Kill switch ON — ${s.name}/${t} order suppressed`);
            continue;
          }
          try {
            const result = await dispatchServerOrder(action, curr.price, s.mode);
            await logEvent(
              'fill',
              `Schwab accepted: orderId ${result.orderId ?? 'n/a'} @ ${result.submittedPrice?.toFixed(2) ?? '—'} (session ${result.session ?? 'n/a'})`
            );
          } catch (e) {
            await logEvent(
              'error',
              `Schwab dispatch failed: ${e instanceof Error ? e.message : String(e)}`
            );
            state!.errors += 1;
          }
        }
      }
    }
  }

  await saveState();
}

/**
 * Dispatch an action through the Schwab order route. The worker can't
 * use the browser-side dispatchAutoOrder helper (which assumes /api
 * is reachable via fetch) because we may be running in the same Node
 * process. We invoke the place-order route's underlying logic directly
 * by importing the lib fns it uses — same guardrails apply because the
 * lib fns are server-side too.
 */
async function dispatchServerOrder(
  action: import('@/types/strategy').Action,
  livePrice: number,
  _mode: 'paper' | 'manual_confirm' | 'auto'
): Promise<{ orderId: string | null; submittedPrice: number; session: string | null }> {
  const { buildBuyLimitOrder, buildSellLimitOrder, placeOrder } = await import('@/lib/schwab/client');
  const { getActiveAccountHash } = await import('@/lib/schwab/account');
  const { checkGuardrails, recordAudit } = await import('@/lib/schwab/orderGuardrails');
  const { schwabOrderSession } = await import('@/lib/marketHours');

  const session = getMarketSession();
  const orderSession = schwabOrderSession(session);
  if (!orderSession) throw new Error('markets closed');

  const buffer = 0.002; // 0.2% marketable buffer
  let submittedPrice: number;
  let order: ReturnType<typeof buildBuyLimitOrder>;
  if (action.kind === 'enter') {
    submittedPrice = roundToCents(livePrice * (1 + buffer));
    order = buildBuyLimitOrder({
      symbol: action.ticker,
      shares: action.shares,
      limitPrice: submittedPrice,
      duration: 'DAY',
      session: orderSession,
    });
  } else if (action.orderType === 'resting_limit' && action.limitPrice != null) {
    submittedPrice = roundToCents(action.limitPrice);
    order = buildSellLimitOrder({
      symbol: action.ticker,
      shares: action.shares,
      limitPrice: submittedPrice,
      duration: 'GOOD_TILL_CANCEL',
      session: orderSession,
    });
  } else {
    submittedPrice = roundToCents(livePrice * (1 - buffer));
    order = buildSellLimitOrder({
      symbol: action.ticker,
      shares: action.shares,
      limitPrice: submittedPrice,
      duration: 'DAY',
      session: orderSession,
    });
  }

  const guard = await checkGuardrails({
    symbol: action.ticker,
    shares: action.shares,
    estimatedPrice: submittedPrice,
  });
  if (!guard.allow) {
    await recordAudit({
      outcome: 'rejected',
      symbol: action.ticker,
      shares: action.shares,
      estimatedPrice: submittedPrice,
      reason: `worker:${guard.reason}`,
    });
    throw new Error(`server guardrail rejected: ${guard.reason}`);
  }

  const hash = await getActiveAccountHash();
  let orderId: string | null = null;
  try {
    orderId = await placeOrder(hash, order);
    await recordAudit({
      outcome: 'submitted',
      symbol: action.ticker,
      shares: action.shares,
      estimatedPrice: submittedPrice,
      orderId: orderId ?? undefined,
    });
  } catch (e) {
    await recordAudit({
      outcome: 'failed',
      symbol: action.ticker,
      shares: action.shares,
      estimatedPrice: submittedPrice,
      reason: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200),
    });
    throw e;
  }
  return { orderId, submittedPrice, session: orderSession };
}

function roundToCents(n: number): number {
  return Math.round(n * 100) / 100;
}

function chooseInterval(): number {
  // Match the existing client-side smart polling: faster during market hours,
  // slower when closed.
  const session = getMarketSession();
  if (session === 'closed') return 60_000; // 1min when closed
  if (session === 'open') return 30_000;   // 30s during open
  return 60_000;                           // 1min pre/post
}

export async function startWorker() {
  if (started) return;
  started = true;
  state = await loadState();
  state.startedAt = new Date().toISOString();
  await logEvent('info', `Worker started (PID ${process.pid})`);

  const tickAndReschedule = async () => {
    try {
      await runOneTick();
    } catch (e) {
      await logEvent('error', `tick: ${e instanceof Error ? e.message : String(e)}`);
      state!.errors += 1;
    }
    timer = setTimeout(tickAndReschedule, chooseInterval());
  };
  timer = setTimeout(tickAndReschedule, 5_000);
}

export function stopWorker() {
  if (timer) clearTimeout(timer);
  timer = null;
  started = false;
}

export async function getWorkerStatus(): Promise<WorkerState | null> {
  if (!state) {
    // Try to read it from disk (worker not running in this process)
    try {
      const text = await fs.readFile(STATE_FILE, 'utf8');
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  return state;
}

/** Replace the worker's strategy set (called by /api/worker/sync from the browser). */
export async function syncStrategies(strategies: Strategy[], killSwitch?: boolean): Promise<void> {
  if (!state) state = await loadState();
  state.strategies = strategies;
  if (killSwitch !== undefined) state.killSwitch = killSwitch;
  // Drop runtimes for strategies that no longer exist
  const validKeys = new Set<string>();
  for (const s of strategies) {
    for (const t of s.tickers) validKeys.add(runtimeKey(s.id, t));
  }
  for (const k of Object.keys(state.runtimes)) {
    if (!validKeys.has(k)) delete state.runtimes[k];
  }
  await saveState();
  const serverChannel = strategies.filter((s) => s.executionChannel === 'server').length;
  await logEvent(
    'info',
    `Synced ${strategies.length} strategies (${validKeys.size} runtimes, ${serverChannel} server-channel${killSwitch ? ', killSwitch ON' : ''})`
  );
}
