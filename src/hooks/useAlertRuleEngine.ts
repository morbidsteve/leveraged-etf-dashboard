'use client';

import { useEffect, useRef } from 'react';
import { usePriceStore, useAlertRuleStore, useSettingsStore } from '@/store';
import { evaluate, describeCondition } from '@/lib/strategy/conditions';
import { calculateRSIWithTimestamps } from '@/lib/rsi';
import { calculateEMA, calculateSMA, calculateVWAP } from '@/lib/indicators';
import { DataContext } from '@/types/strategy';
import { playBuyTone } from '@/lib/sound';
import { fireNotification } from '@/lib/notify';

/**
 * Subscribes to live price updates and evaluates each enabled custom alert
 * rule against the per-ticker DataContext on every change. Fires once per
 * (rule, ticker) per cooldown window.
 *
 * Mount once at the app root, alongside useAlertEngine. The two run
 * independently — strategy alerts are a separate notion from custom
 * threshold alerts.
 */
export function useAlertRuleEngine() {
  const candlesByTicker = usePriceStore((s) => s.candles);
  const pricesByTicker = usePriceStore((s) => s.prices);
  const rules = useAlertRuleStore((s) => s.rules);
  const recordFire = useAlertRuleStore((s) => s.recordFire);
  const globalRsiConfig = useSettingsStore((s) => s.settings.rsiConfig);

  // Track previous DataContext per (ruleId:ticker) for cross detection
  const prevCtxMap = useRef<Record<string, DataContext>>({});

  useEffect(() => {
    for (const rule of rules) {
      if (!rule.enabled) continue;

      for (const ticker of rule.tickers) {
        const candles = candlesByTicker[ticker];
        const live = pricesByTicker[ticker];
        if (!candles || candles.length === 0 || !live) continue;

        // Build current DataContext from live data
        const rsiSeries = calculateRSIWithTimestamps(candles, globalRsiConfig.period);
        const lastRsi = rsiSeries.length > 0 ? rsiSeries[rsiSeries.length - 1].value : Number.NaN;
        const ema20 = calculateEMA(candles, 20);
        const ema50 = calculateEMA(candles, 50);
        const sma20 = calculateSMA(candles, 20);
        const vwap = calculateVWAP(candles);

        const ctx: DataContext = {
          ticker,
          price: live.price,
          rsi: { [globalRsiConfig.period]: lastRsi },
          ema: {
            20: ema20.length ? ema20[ema20.length - 1].value : Number.NaN,
            50: ema50.length ? ema50[ema50.length - 1].value : Number.NaN,
          },
          sma: { 20: sma20.length ? sma20[sma20.length - 1].value : Number.NaN },
          vwap: vwap.length ? vwap[vwap.length - 1].value : null,
          volume: live.volume,
          timestamp:
            live.timestamp instanceof Date ? live.timestamp : new Date(live.timestamp),
        };

        const key = `${rule.id}:${ticker}`;
        const prev = prevCtxMap.current[key] ?? null;

        let fired = false;
        try {
          fired = evaluate(rule.condition, ctx, prev);
        } catch {
          fired = false;
        }

        if (fired) {
          const detail = describeCondition(rule.condition);
          const fire = recordFire(rule.id, ticker, detail);
          if (fire) {
            // Outbound webhook
            import('@/store/webhookStore').then(({ fireWebhook }) => {
              fireWebhook('alert.fired', {
                ruleId: rule.id,
                ruleName: rule.name,
                ticker,
                detail,
              });
            });
            // Notification channels
            if (rule.channels.sound) {
              playBuyTone();
            }
            if (rule.channels.toast) {
              window.dispatchEvent(
                new CustomEvent('etf-alert-rule-fired', {
                  detail: { ticker, ruleName: rule.name, message: detail },
                })
              );
            }
            if (rule.channels.browserNotif) {
              fireNotification({
                title: `${rule.name} · ${ticker}`,
                body: detail,
                tag: `alert-rule-${rule.id}-${ticker}`,
              });
            }
          }
        }

        prevCtxMap.current[key] = ctx;
      }
    }
    // Intentionally do not include prices/candles in deps — we want this
    // to re-run on every price store change anyway via the selector.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricesByTicker, candlesByTicker, rules, globalRsiConfig]);
}
