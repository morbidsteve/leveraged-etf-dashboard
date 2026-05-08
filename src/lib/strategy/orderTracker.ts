/**
 * Server-orderID tracker for auto-mode strategy fills.
 *
 * When the strategy engine fires a Schwab order it gets back an
 * orderId immediately, but the order may not be filled for seconds
 * (or get canceled/rejected). This module polls /api/schwab/orders/status
 * until the order reaches a terminal state, then resolves with the
 * fill result.
 *
 * Used as a non-hook utility so the engine can fire-and-forget
 * tracking from its `dispatchAutoOrder().then(...)` block without
 * having to mount a hook per order.
 */

export type OrderStatus =
  | 'WORKING'
  | 'FILLED'
  | 'CANCELED'
  | 'REJECTED'
  | 'PARTIAL'
  | 'UNKNOWN';

export interface OrderTrackResult {
  orderId: string;
  status: OrderStatus;
  filledQuantity?: number;
  filledPrice?: number;
  enteredTime?: string;
  closeTime?: string;
  error?: string;
  durationMs: number;
}

const TERMINAL: OrderStatus[] = ['FILLED', 'CANCELED', 'REJECTED'];

interface TrackOpts {
  intervalMs?: number;
  /** Give up after this many ms even if not terminal. */
  timeoutMs?: number;
  /** Optional cancellation signal. */
  signal?: AbortSignal;
}

export async function trackOrderToTerminal(
  orderId: string,
  opts: TrackOpts = {}
): Promise<OrderTrackResult> {
  const { intervalMs = 3000, timeoutMs = 5 * 60_000, signal } = opts;
  const start = Date.now();
  let lastError: string | undefined;
  let lastReading: Partial<OrderTrackResult> = {};

  while (Date.now() - start < timeoutMs) {
    if (signal?.aborted) {
      return {
        orderId,
        status: 'UNKNOWN',
        ...lastReading,
        error: 'aborted',
        durationMs: Date.now() - start,
      };
    }
    try {
      const r = await fetch(
        `/api/schwab/orders/status?orderId=${encodeURIComponent(orderId)}`
      );
      const data = await r.json();
      const status = (data.status as OrderStatus) ?? 'UNKNOWN';
      lastReading = {
        status,
        filledQuantity: data.filledQuantity,
        filledPrice: data.filledPrice,
        enteredTime: data.enteredTime,
        closeTime: data.closeTime,
      };
      if (TERMINAL.includes(status)) {
        return {
          orderId,
          status,
          filledQuantity: data.filledQuantity,
          filledPrice: data.filledPrice,
          enteredTime: data.enteredTime,
          closeTime: data.closeTime,
          error: data.error,
          durationMs: Date.now() - start,
        };
      }
      lastError = data.error;
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'fetch failed';
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return {
    orderId,
    status: (lastReading.status as OrderStatus) ?? 'UNKNOWN',
    ...lastReading,
    error: lastError ?? 'timeout',
    durationMs: Date.now() - start,
  };
}
