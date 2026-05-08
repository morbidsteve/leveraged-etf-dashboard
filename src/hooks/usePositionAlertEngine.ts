'use client';

import { useEffect, useRef } from 'react';
import {
  useTradeStore,
  usePaperStore,
  usePriceStore,
  useSettingsStore,
} from '@/store';
import { playBuyTone, playSellTone } from '@/lib/sound';
import { fireNotification } from '@/lib/notify';
import { showToast } from '@/components/UI';

/**
 * Watches every open position (manual Trade + paper PaperEntry) and
 * fires take-profit / stop-loss notifications when the live price
 * crosses the configured threshold.
 *
 * Threshold resolution per trade:
 *   1. Trade.alertTakeProfitPct / alertStopLossPct (per-trade override)
 *   2. settings.positionAlerts.takeProfitPct / stopLossPct (global default)
 *
 * Cooldown: per-trade `lastFiredKey` map kept in the ref so we don't
 * spam every tick. Cleared on price reversal back across the threshold.
 *
 * Mount once at the app root, alongside useAlertEngine + useAlertRuleEngine.
 */
export function usePositionAlertEngine() {
  const trades = useTradeStore((s) => s.trades);
  const paperOpen = usePaperStore((s) => s.open);
  const prices = usePriceStore((s) => s.prices);
  const positionAlerts = useSettingsStore((s) => s.settings.positionAlerts);

  // key = `manual:${tradeId}:tp` or `paper:${strategyId}:${ticker}:sl`
  // value = epoch ms of last fire
  const firedAt = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!positionAlerts || !positionAlerts.enabled) return;
    const now = Date.now();
    const cooldownMs = positionAlerts.cooldownMinutes * 60_000;

    const fire = (
      key: string,
      kind: 'tp' | 'sl',
      ticker: string,
      pctMove: number,
      currentPrice: number
    ) => {
      const last = firedAt.current[key] ?? 0;
      if (now - last < cooldownMs) return;
      firedAt.current[key] = now;

      const action = kind === 'tp' ? 'TAKE PROFIT' : 'STOP HIT';
      const msg = `${ticker} · ${action} at ${pctMove >= 0 ? '+' : ''}${pctMove.toFixed(2)}% (${currentPrice.toFixed(2)})`;

      if (positionAlerts.soundEnabled) {
        if (kind === 'tp') playSellTone();
        else playBuyTone();
      }
      if (positionAlerts.toastEnabled) {
        showToast(msg, kind === 'tp' ? 'success' : 'error', 6000);
      }
      if (positionAlerts.browserEnabled) {
        fireNotification({
          title: `${ticker} · ${action}`,
          body: `${pctMove >= 0 ? '+' : ''}${pctMove.toFixed(2)}% (${currentPrice.toFixed(2)})`,
          tag: key,
        });
      }
    };

    // Manual trades
    for (const t of trades) {
      if (t.status !== 'open') continue;
      const live = prices[t.ticker]?.price;
      if (!live || !t.avgCost) continue;
      const pctMove = ((live - t.avgCost) / t.avgCost) * 100;
      const tpPct = t.alertTakeProfitPct ?? positionAlerts.takeProfitPct;
      const slPct = t.alertStopLossPct ?? positionAlerts.stopLossPct;
      if (tpPct > 0 && pctMove >= tpPct) {
        fire(`manual:${t.id}:tp`, 'tp', t.ticker, pctMove, live);
      } else if (pctMove < tpPct * 0.5) {
        // Reset cooldown when price retreats well below TP — lets the
        // alert re-arm if the user holds and price re-tags.
        delete firedAt.current[`manual:${t.id}:tp`];
      }
      if (slPct < 0 && pctMove <= slPct) {
        fire(`manual:${t.id}:sl`, 'sl', t.ticker, pctMove, live);
      } else if (pctMove > slPct * 0.5) {
        delete firedAt.current[`manual:${t.id}:sl`];
      }
    }

    // Paper positions (strategy-driven)
    for (const p of paperOpen) {
      const live = prices[p.ticker]?.price;
      if (!live) continue;
      const pctMove = ((live - p.entryPrice) / p.entryPrice) * 100;
      const tpPct = positionAlerts.takeProfitPct;
      const slPct = positionAlerts.stopLossPct;
      const baseKey = `paper:${p.strategyId}:${p.ticker}`;
      if (tpPct > 0 && pctMove >= tpPct) {
        fire(`${baseKey}:tp`, 'tp', `${p.ticker} (paper)`, pctMove, live);
      } else if (pctMove < tpPct * 0.5) {
        delete firedAt.current[`${baseKey}:tp`];
      }
      if (slPct < 0 && pctMove <= slPct) {
        fire(`${baseKey}:sl`, 'sl', `${p.ticker} (paper)`, pctMove, live);
      } else if (pctMove > slPct * 0.5) {
        delete firedAt.current[`${baseKey}:sl`];
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, paperOpen, prices, positionAlerts]);
}
