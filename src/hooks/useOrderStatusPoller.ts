'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Schwab order-status polling hook. Given an orderId, polls the status
 * endpoint at the configured interval until the order reaches a
 * terminal state (FILLED / CANCELED / REJECTED) or the user unsubscribes.
 *
 * Returns the latest status. Caller can act on FILLED to e.g. record
 * the actual fill price into a paper trade.
 */

export type OrderStatus =
  | 'WORKING'
  | 'FILLED'
  | 'CANCELED'
  | 'REJECTED'
  | 'PARTIAL'
  | 'UNKNOWN';

export interface OrderStatusReading {
  orderId: string;
  status: OrderStatus;
  filledQuantity?: number;
  filledPrice?: number;
  enteredTime?: string;
  closeTime?: string;
  /** Last successful poll timestamp (ms). */
  lastPollAt?: number;
  /** Polling error from the last attempt, if any. */
  error?: string;
  isTerminal: boolean;
}

const TERMINAL: OrderStatus[] = ['FILLED', 'CANCELED', 'REJECTED'];

export function useOrderStatusPoller(
  orderId: string | null,
  intervalMs = 3000
): OrderStatusReading | null {
  const [reading, setReading] = useState<OrderStatusReading | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    setReading(null);
    if (!orderId) return;

    const tick = async () => {
      if (stopped.current) return;
      try {
        const r = await fetch(`/api/schwab/orders/status?orderId=${encodeURIComponent(orderId)}`);
        const data = await r.json();
        if (stopped.current) return;
        const status = (data.status as OrderStatus) ?? 'UNKNOWN';
        const next: OrderStatusReading = {
          orderId,
          status,
          filledQuantity: data.filledQuantity,
          filledPrice: data.filledPrice,
          enteredTime: data.enteredTime,
          closeTime: data.closeTime,
          lastPollAt: Date.now(),
          error: data.error,
          isTerminal: TERMINAL.includes(status),
        };
        setReading(next);
        if (next.isTerminal) {
          // Done — stop polling
          return;
        }
        if (!stopped.current) {
          setTimeout(tick, intervalMs);
        }
      } catch (e) {
        if (stopped.current) return;
        setReading((prev) => ({
          orderId,
          status: 'UNKNOWN',
          lastPollAt: Date.now(),
          error: e instanceof Error ? e.message : 'fetch failed',
          isTerminal: false,
          ...(prev ?? {}),
        }));
        if (!stopped.current) setTimeout(tick, intervalMs);
      }
    };
    tick();

    return () => {
      stopped.current = true;
    };
  }, [orderId, intervalMs]);

  return reading;
}
