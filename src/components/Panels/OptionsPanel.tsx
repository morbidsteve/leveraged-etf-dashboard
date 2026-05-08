'use client';

import { useEffect, useState } from 'react';
import { useSettingsStore, usePriceStore } from '@/store';
import { OptionChainViewer, VolPanel } from '@/components/Options';
import { OptionChain, OptionContract } from '@/types/options';

const COMMON_OPTIONABLE = ['SOXL', 'TQQQ', 'SOXS', 'SQQQ', 'SPY', 'QQQ', 'NVDA', 'AAPL'];

/**
 * Options drawer — top-level container for all options-trading
 * surfaces. For Phase 1, hosts the chain viewer + IV/vol panel.
 *
 * Future phases bolt on additional sub-views (positions, multi-leg
 * builder, options strategies). Designed so each sub-view is a card
 * that can be progressively added without restructuring.
 */
export default function OptionsPanel() {
  const selectedTicker = usePriceStore((s) => s.selectedTicker);
  const settings = useSettingsStore((s) => s.settings);
  const [symbol, setSymbol] = useState(selectedTicker || 'SOXL');
  const [chainCache, setChainCache] = useState<OptionChain | null>(null);
  const [, setSelectedContract] = useState<OptionContract | null>(null);

  const tickers = settings.watchlist ?? [];

  // Fetch the chain once at the panel level so the VolPanel and the
  // OptionChainViewer can share state. The viewer also fetches its own
  // copy currently — refactor to a shared hook in a follow-up.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/options/chain?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((data: OptionChain) => {
        if (cancelled) return;
        setChainCache({
          ...data,
          fetchedAt: new Date(data.fetchedAt as unknown as string),
        });
      })
      .catch(() => {
        if (cancelled) return;
        setChainCache(null);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-white tracking-tight">
          Options · {symbol}
        </h2>
        <div className="flex flex-wrap gap-1 ml-auto">
          {Array.from(new Set([...tickers, ...COMMON_OPTIONABLE])).map((t) => (
            <button
              key={t}
              onClick={() => setSymbol(t)}
              className={`text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded border ${
                t === symbol
                  ? 'bg-accent/20 border-accent/40 text-accent-light'
                  : 'bg-white/[0.03] border-white/10 text-gray-400 hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Live options chain via Schwab. Click a contract to populate the
        order ticket (coming in Phase 2). Chains are cached 30s upstream.
      </p>

      <VolPanel chain={chainCache} />

      <OptionChainViewer
        symbol={symbol}
        onSelectContract={(c) => {
          setSelectedContract(c);
          // Phase 2 will route this to the order ticket
        }}
      />
    </div>
  );
}
