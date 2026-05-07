'use client';

import { useEffect, useRef } from 'react';
import {
  usePriceStore,
  useStrategyStore,
  usePaperStore,
  useSettingsStore,
} from '@/store';
import {
  Strategy,
  Action,
  DataContext,
  StrategyEvent,
} from '@/types/strategy';
import { tick } from '@/lib/strategy/evaluator';
import { dispatchAutoOrder } from '@/lib/strategy/autoExecutor';
import { calculateRSIWithTimestamps } from '@/lib/rsi';
import { calculateEMA, calculateSMA } from '@/lib/indicators';
import { playBuyTone, playSellTone } from '@/lib/sound';
import { fireNotification } from '@/lib/notify';

/**
 * Strategy engine: every price update, walks through enabled strategies,
 * evaluates conditions, dispatches actions. Mount once at the app root.
 *
 * For paper-mode strategies, fills are virtual (recorded in paperStore).
 * For manual_confirm strategies, fires an Action onto the global pendingAction
 * channel which the confirm modal subscribes to.
 *
 * Tier 3 will add an executor that translates Actions into Schwab orders.
 */
export function useStrategyEngine(opts: {
  onPendingAction?: (action: Action, strategy: Strategy) => void;
} = {}) {
  const candlesByTicker = usePriceStore((s) => s.candles);
  const pricesByTicker = usePriceStore((s) => s.prices);
  const strategies = useStrategyStore((s) => s.strategies);
  const runtimes = useStrategyStore((s) => s.runtimes);
  const setRuntime = useStrategyStore((s) => s.setRuntime);
  const appendEvents = useStrategyStore((s) => s.appendEvents);
  const openPosition = usePaperStore((s) => s.openPosition);
  const closePosition = usePaperStore((s) => s.closePosition);
  const globalRsiConfig = useSettingsStore((s) => s.settings.rsiConfig);

  // Previous data context per ticker — required for crossing detection
  const prevCtxRef = useRef<Record<string, DataContext | null>>({});

  useEffect(() => {
    const enabled = strategies.filter((s) => s.enabled);
    if (enabled.length === 0) return;

    const now = new Date();
    const newEvents: Omit<StrategyEvent, 'id'>[] = [];

    for (const strategy of enabled) {
      const candles = candlesByTicker[strategy.ticker] || [];
      const live = pricesByTicker[strategy.ticker];
      if (candles.length === 0 || !live) continue;

      const rsiConfig = strategy.rsiConfig ?? globalRsiConfig;

      // Compute the data context for this tick
      const rsiSeries = calculateRSIWithTimestamps(candles, rsiConfig.period);
      const lastRsi = rsiSeries.length > 0 ? rsiSeries[rsiSeries.length - 1].value : null;

      // Pre-compute a few useful indicators (more on demand later)
      const ema20 = calculateEMA(candles, 20);
      const ema50 = calculateEMA(candles, 50);
      const sma20 = calculateSMA(candles, 20);

      const ctx: DataContext = {
        ticker: strategy.ticker,
        price: live.price,
        rsi: { [rsiConfig.period]: lastRsi ?? Number.NaN },
        ema: {
          20: ema20.length ? ema20[ema20.length - 1].value : Number.NaN,
          50: ema50.length ? ema50[ema50.length - 1].value : Number.NaN,
        },
        sma: {
          20: sma20.length ? sma20[sma20.length - 1].value : Number.NaN,
        },
        vwap: null,
        volume: live.volume,
        timestamp: live.timestamp instanceof Date ? live.timestamp : new Date(live.timestamp),
      };

      const prevCtx = prevCtxRef.current[strategy.id] ?? null;
      const runtime = runtimes[strategy.id];
      if (!runtime) continue;

      const out = tick({ strategy, runtime, prevCtx, currCtx: ctx, now });

      if (out.runtime !== runtime) {
        setRuntime(strategy.id, out.runtime);
      }

      for (const ev of out.events) {
        newEvents.push({
          strategyId: strategy.id,
          timestamp: now,
          type: ev.type,
          detail: ev.detail,
        });
      }

      for (const action of out.actions) {
        // Notify the user — works in any mode
        if (action.kind === 'enter') {
          playBuyTone();
          fireNotification({
            title: `Strategy fired: ${strategy.name}`,
            body: `BUY ${action.shares} ${action.ticker} — ${action.reason}`,
            tag: `strat-${strategy.id}-enter`,
          });
        } else {
          playSellTone();
          fireNotification({
            title: `Strategy exit: ${strategy.name}`,
            body: `SELL ${action.shares} ${action.ticker} — ${action.reason}`,
            tag: `strat-${strategy.id}-exit`,
          });
        }

        // Mode-specific dispatch
        if (strategy.mode === 'paper') {
          if (action.kind === 'enter') {
            openPosition({
              strategyId: strategy.id,
              ticker: action.ticker,
              shares: action.shares,
              entryPrice: ctx.price,
              entryAt: ctx.timestamp,
            });
            newEvents.push({
              strategyId: strategy.id,
              timestamp: now,
              type: 'fill',
              detail: `Paper BUY filled: ${action.shares} @ ${ctx.price.toFixed(2)}`,
            });
          } else {
            const trade = closePosition(strategy.id, ctx.price, ctx.timestamp, action.reason);
            if (trade) {
              newEvents.push({
                strategyId: strategy.id,
                timestamp: now,
                type: 'fill',
                detail: `Paper SELL filled: ${trade.shares} @ ${trade.exitPrice.toFixed(2)} → P&L $${trade.realizedPnL.toFixed(2)}`,
              });
            }
          }
        } else if (strategy.mode === 'manual_confirm') {
          opts.onPendingAction?.(action, strategy);
        } else if (strategy.mode === 'auto') {
          // Fire-and-forget POST to the server-side place-order route.
          // Tokens live server-side; the browser only forwards the action.
          dispatchAutoOrder(action, ctx.price, strategy)
            .then((result) => {
              appendEvents([
                {
                  strategyId: strategy.id,
                  timestamp: new Date(),
                  type: 'fill',
                  detail: `Schwab order accepted: ${result.action} ${result.shares} ${result.symbol} @ ${
                    result.submittedPrice?.toFixed(2) ?? '—'
                  } (orderId ${result.orderId ?? 'n/a'})`,
                },
              ]);
            })
            .catch((err) => {
              const msg = err instanceof Error ? err.message : String(err);
              appendEvents([
                {
                  strategyId: strategy.id,
                  timestamp: new Date(),
                  type: 'error',
                  detail: `Schwab order FAILED: ${msg}`,
                },
              ]);
              // Best-effort UI notification — don't trap if blocked.
              fireNotification({
                title: `❌ Auto-order failed: ${strategy.ticker}`,
                body: msg.slice(0, 180),
                tag: `strat-${strategy.id}-error`,
                requireInteraction: true,
              });
            });
        }
      }

      prevCtxRef.current[strategy.id] = ctx;
    }

    if (newEvents.length > 0) appendEvents(newEvents);
    // We deliberately depend on price-store identity changes — Zustand returns
    // a new object reference per tick, so this fires once per update.
  }, [
    candlesByTicker,
    pricesByTicker,
    strategies,
    runtimes,
    globalRsiConfig,
    setRuntime,
    appendEvents,
    openPosition,
    closePosition,
    opts,
  ]);
}
