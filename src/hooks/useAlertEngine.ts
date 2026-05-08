'use client';

import { useEffect, useMemo, useRef } from 'react';
import {
  usePriceStore,
  useAlertStore,
  useSettingsStore,
  useTradeStore,
  usePaperStore,
  useOptionsStore,
} from '@/store';
import { detectCrossings, isWithinCooldown } from '@/lib/alertEngine';
import { playBuyTone, playSellTone } from '@/lib/sound';
import { fireNotification } from '@/lib/notify';
import { RSIData } from '@/types';

/**
 * Subscribes to RSI updates across all tracked tickers and fires alerts when
 * the RSI crosses configured thresholds. Respects the cooldownMinutes setting
 * so we don't spam on noisy ticks.
 *
 * Mount once at the app root.
 */
export function useAlertEngine() {
  const rsiData = usePriceStore((s) => s.rsiData);
  const addAlert = useAlertStore((s) => s.addAlert);
  const recentAlerts = useAlertStore((s) => s.alerts);
  const alertSettings = useAlertStore((s) => s.settings);
  const rsiConfig = useSettingsStore((s) => s.settings.rsiConfig);

  // Track previous RSI value per ticker — required for crossing detection
  const prevRSI = useRef<Record<string, number | null>>({});

  // Tickers the user actually holds — equity (open) + paper + options.
  // Used to gate SELL alerts (don't notify "sell SOXL" if you don't own it).
  const trades = useTradeStore((s) => s.trades);
  const paperOpen = usePaperStore((s) => s.open);
  const optionsPositions = useOptionsStore((s) => s.positions);
  const heldTickers = useMemo(() => {
    const set = new Set<string>();
    for (const t of trades) {
      if (t.status === 'open') set.add(t.ticker.toUpperCase());
    }
    for (const p of paperOpen) set.add(p.ticker.toUpperCase());
    for (const op of optionsPositions) {
      if (!op.closedAt) set.add(op.underlying.toUpperCase());
    }
    return set;
  }, [trades, paperOpen, optionsPositions]);

  useEffect(() => {
    if (!alertSettings.enabled) {
      // Reset baseline when disabled so we don't fire stale crossings on re-enable
      prevRSI.current = {};
      return;
    }

    for (const [ticker, data] of Object.entries(rsiData) as [string, RSIData | null][]) {
      const curr = data?.value ?? null;
      const prev = prevRSI.current[ticker] ?? null;

      // First reading for a ticker — establish baseline, no firing
      if (prev === null && curr !== null) {
        prevRSI.current[ticker] = curr;
        continue;
      }

      if (prev !== null && curr !== null && prev !== curr) {
        const crossings = detectCrossings(ticker, prev, curr, rsiConfig);
        for (const c of crossings) {
          // Gate SELL signals to held positions only — a "sell SOXL" alert
          // is noise if the user has no SOXL exposure. BUY signals always
          // fire (they're opportunities, useful even without a position).
          if (c.type === 'rsi_overbought' && !heldTickers.has(ticker.toUpperCase())) {
            continue;
          }

          if (
            isWithinCooldown(
              ticker,
              c.type,
              alertSettings.cooldownMinutes,
              recentAlerts.map((a) => ({ ticker: a.ticker, type: a.type, timestamp: a.timestamp }))
            )
          ) {
            continue;
          }

          addAlert({
            type: c.type,
            ticker,
            message: c.message,
          });

          if (alertSettings.soundEnabled) {
            if (c.type === 'rsi_oversold') playBuyTone();
            else if (c.type === 'rsi_overbought') playSellTone();
          }

          fireNotification({
            title:
              c.type === 'rsi_oversold'
                ? `BUY signal · ${ticker}`
                : `SELL signal · ${ticker}`,
            body: c.message,
            tag: `${ticker}-${c.type}`,
          });
        }
      }

      if (curr !== null) prevRSI.current[ticker] = curr;
    }
    // We deliberately depend on rsiData identity changes — Zustand returns a new
    // object reference on every set, so this fires once per tick.
  }, [rsiData, rsiConfig, alertSettings, recentAlerts, addAlert, heldTickers]);
}
