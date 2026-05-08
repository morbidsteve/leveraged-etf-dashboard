'use client';

import { useEffect, useRef } from 'react';
import {
  usePriceStore,
  useStrategyStore,
  usePaperStore,
  useSettingsStore,
  useTradeStore,
} from '@/store';
import { evaluateGuardrails } from '@/lib/guardrails';
import { calculateUnrealizedPnL } from '@/lib/calculations';
import {
  Strategy,
  Action,
  DataContext,
  StrategyEvent,
  runtimeKey,
} from '@/types/strategy';
import { tick } from '@/lib/strategy/evaluator';
import { dispatchAutoOrder } from '@/lib/strategy/autoExecutor';
import { captureSnapshot } from '@/lib/snapshot';
import { calculateRSIWithTimestamps } from '@/lib/rsi';
import { calculateEMA, calculateSMA } from '@/lib/indicators';
import { playBuyTone, playSellTone } from '@/lib/sound';
import { fireNotification } from '@/lib/notify';
import { useMultiTfData, TfRequirement } from './useMultiTfData';
import { collectTimeframesFromCondition, collectExternalTickersFromCondition } from '@/lib/strategy/conditions';
import { useMemo } from 'react';

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
  const guardrailsConfig = useSettingsStore((s) => s.settings.guardrails);
  const manualTrades = useTradeStore((s) => s.trades);
  const paperClosed = usePaperStore((s) => s.closed);
  const livePrices = usePriceStore((s) => s.prices);

  // Previous data context per (strategy, ticker) — required for crossing detection
  const prevCtxRef = useRef<Record<string, DataContext | null>>({});

  // Multi-timeframe requirements aggregated from every enabled strategy.
  const tfRequirements = useMemo<TfRequirement[]>(() => {
    const reqs = new Map<string, TfRequirement>();
    for (const s of strategies) {
      if (!s.enabled) continue;
      for (const ticker of s.tickers) {
        const tfArr = [
          ...collectTimeframesFromCondition(s.entry.when),
          ...collectTimeframesFromCondition(s.exit.when),
          ...(s.stopLoss?.when ? collectTimeframesFromCondition(s.stopLoss.when) : []),
          ...(s.additionalTimeframes ?? []),
        ];
        for (const tf of Array.from(new Set(tfArr))) {
          const key = `${ticker}:${tf}`;
          if (!reqs.has(key)) reqs.set(key, { ticker, tf });
        }
      }
    }
    return Array.from(reqs.values());
  }, [strategies]);

  const multiTf = useMultiTfData(tfRequirements, globalRsiConfig);

  useEffect(() => {
    const enabled = strategies.filter((s) => s.enabled);
    if (enabled.length === 0) return;

    const now = new Date();
    const newEvents: Omit<StrategyEvent, 'id'>[] = [];

    for (const strategy of enabled) {
      // Cross-asset support — build a map of every external ticker
      // referenced anywhere in the strategy's conditions. Each is fetched
      // from the live price/candles store and folded into byTicker on the
      // DataContext below.
      const externalTickers = Array.from(
        new Set([
          ...collectExternalTickersFromCondition(strategy.entry.when),
          ...collectExternalTickersFromCondition(strategy.exit.when),
        ])
      );
      const byTicker: NonNullable<DataContext['byTicker']> = {};
      for (const xt of externalTickers) {
        const xCandles = candlesByTicker[xt] || [];
        const xLive = pricesByTicker[xt];
        if (xCandles.length === 0 || !xLive) continue;
        const xRsiConfig = strategy.rsiConfig ?? globalRsiConfig;
        const xRsi = calculateRSIWithTimestamps(xCandles, xRsiConfig.period);
        const xEma20 = calculateEMA(xCandles, 20);
        const xEma50 = calculateEMA(xCandles, 50);
        const xSma20 = calculateSMA(xCandles, 20);
        byTicker[xt] = {
          price: xLive.price,
          rsi: {
            [xRsiConfig.period]: xRsi.length ? xRsi[xRsi.length - 1].value : Number.NaN,
          },
          ema: {
            20: xEma20.length ? xEma20[xEma20.length - 1].value : Number.NaN,
            50: xEma50.length ? xEma50[xEma50.length - 1].value : Number.NaN,
          },
          sma: {
            20: xSma20.length ? xSma20[xSma20.length - 1].value : Number.NaN,
          },
          vwap: null,
          volume: xLive.volume,
        };
      }

      // Iterate per ticker — each (strategy, ticker) is an independent runtime
      for (const ticker of strategy.tickers) {
        const candles = candlesByTicker[ticker] || [];
        const live = pricesByTicker[ticker];
        if (candles.length === 0 || !live) continue;

        const rsiConfig = strategy.rsiConfig ?? globalRsiConfig;

        const rsiSeries = calculateRSIWithTimestamps(candles, rsiConfig.period);
        const lastRsi = rsiSeries.length > 0 ? rsiSeries[rsiSeries.length - 1].value : null;
        const ema20 = calculateEMA(candles, 20);
        const ema50 = calculateEMA(candles, 50);
        const sma20 = calculateSMA(candles, 20);

        const ctx: DataContext = {
          ticker,
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
          byTf: multiTf[ticker],
          byTicker: Object.keys(byTicker).length > 0 ? byTicker : undefined,
          timestamp: live.timestamp instanceof Date ? live.timestamp : new Date(live.timestamp),
        };

        const rtKey = runtimeKey(strategy.id, ticker);
        const prevCtx = prevCtxRef.current[rtKey] ?? null;
        const runtime = runtimes[rtKey];
        if (!runtime) continue;

        const out = tick({ strategy, runtime, prevCtx, currCtx: ctx, now });

        if (out.runtime !== runtime) {
          setRuntime(strategy.id, ticker, out.runtime);
        }

        for (const ev of out.events) {
          newEvents.push({
            strategyId: strategy.id,
            timestamp: now,
            type: ev.type,
            detail: `[${ticker}] ${ev.detail}`,
          });
        }

      // Compute today's P&L (closed manual + closed paper + open unrealized)
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const closedTodayManual = manualTrades
        .filter((t) => t.status === 'closed' && t.closedAt && new Date(t.closedAt) >= startOfDay)
        .reduce((s, t) => s + t.realizedPnL, 0);
      const closedTodayPaper = paperClosed
        .filter((t) => new Date(t.exitAt) >= startOfDay)
        .reduce((s, t) => s + t.realizedPnL, 0);
      const openUnrealized = manualTrades
        .filter((t) => t.status === 'open')
        .reduce((s, t) => {
          const cp = livePrices[t.ticker]?.price || t.avgCost;
          return s + calculateUnrealizedPnL(t, cp);
        }, 0);
      const dayPnL = closedTodayManual + closedTodayPaper + openUnrealized;

      const guard = evaluateGuardrails({
        manualTrades,
        paperTrades: paperClosed,
        dayPnL,
        maxTradesPerDay: guardrailsConfig?.maxTradesPerDay,
        dailyLossLimit: guardrailsConfig?.dailyLossLimit,
        now,
      });

      for (const action of out.actions) {
        // Guardrail block — entries only (we always allow exits to close positions)
        if (action.kind === 'enter' && guard.entriesBlocked) {
          newEvents.push({
            strategyId: strategy.id,
            timestamp: now,
            type: 'state_change',
            detail: `Guardrail BLOCKED entry: ${guard.blockReason}`,
          });
          continue;
        }

        // Outbound webhook — fire-and-forget, fire-and-forget across all
        // configured endpoints subscribed to strategy.fired
        if (typeof window !== 'undefined') {
          import('@/store/webhookStore').then(({ fireWebhook }) => {
            fireWebhook('strategy.fired', {
              strategyId: strategy.id,
              strategyName: strategy.name,
              action: action.kind,
              ticker: action.ticker,
              shares: action.shares,
              reason: action.reason,
            });
          });
        }

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
            const snapshot = captureSnapshot({
              ticker: action.ticker,
              candles,
              rsiConfig,
              markerTime: Math.floor(ctx.timestamp.getTime() / 1000),
            });
            openPosition({
              strategyId: strategy.id,
              ticker: action.ticker,
              shares: action.shares,
              entryPrice: ctx.price,
              entryAt: ctx.timestamp,
              entrySnapshot: snapshot,
            });
            newEvents.push({
              strategyId: strategy.id,
              timestamp: now,
              type: 'fill',
              detail: `Paper BUY filled: ${action.shares} @ ${ctx.price.toFixed(2)}`,
            });
          } else {
            const exitSnap = captureSnapshot({
              ticker: action.ticker,
              candles,
              rsiConfig,
              markerTime: Math.floor(ctx.timestamp.getTime() / 1000),
            });
            const trade = closePosition(strategy.id, ticker, ctx.price, ctx.timestamp, action.reason, exitSnap);
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
                title: `❌ Auto-order failed: ${action.ticker}`,
                body: msg.slice(0, 180),
                tag: `strat-${strategy.id}-${ticker}-error`,
                requireInteraction: true,
              });
            });
        }
      }

        prevCtxRef.current[rtKey] = ctx;
      } // end inner ticker loop
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
