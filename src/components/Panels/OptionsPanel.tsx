'use client';

import { useEffect, useState } from 'react';
import { useSettingsStore, usePriceStore } from '@/store';
import {
  OptionChainViewer,
  VolPanel,
  OrderTicket,
  StrategyBuilder,
  PositionList,
} from '@/components/Options';
import {
  OptionChain,
  OptionContract,
  OptionInstruction,
  OptionStructure,
} from '@/types/options';
import { Tabs, TabPanel, TabDef } from '@/components/UI';

const COMMON_OPTIONABLE = ['SOXL', 'TQQQ', 'SOXS', 'SQQQ', 'SPY', 'QQQ', 'NVDA', 'AAPL'];

type DraftLeg = {
  contract: OptionContract;
  instruction: OptionInstruction;
  quantity: number;
};

type Tab = 'chain' | 'positions' | 'strategies';
const TABS: TabDef<Tab>[] = [
  { id: 'chain', label: 'Chain' },
  { id: 'positions', label: 'Positions' },
  { id: 'strategies', label: 'Templates' },
];

/**
 * Options drawer — top-level container for all options-trading
 * surfaces. Three tabs: Chain (raw chain + IV/vol), Positions (open +
 * closed), Templates (one-click multi-leg setups).
 *
 * Picks up an active draft (legs to put in the order ticket) from the
 * chain or templates flow.
 */
export default function OptionsPanel() {
  const selectedTicker = usePriceStore((s) => s.selectedTicker);
  const settings = useSettingsStore((s) => s.settings);
  const [symbol, setSymbol] = useState(selectedTicker || 'SOXL');
  const [chain, setChain] = useState<OptionChain | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('chain');

  // Order ticket state
  const [draft, setDraft] = useState<DraftLeg[]>([]);
  const [draftStructure, setDraftStructure] = useState<OptionStructure>('single');

  const tickers = settings.watchlist ?? [];

  // Single source-of-truth chain fetch — viewers + builder both consume.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/options/chain?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((data: OptionChain) => {
        if (cancelled) return;
        setChain({
          ...data,
          fetchedAt: new Date(data.fetchedAt as unknown as string),
        });
      })
      .catch(() => {
        if (cancelled) return;
        setChain(null);
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

      <Tabs<Tab> tabs={TABS} active={activeTab} onChange={setActiveTab} variant="underline" />

      <TabPanel id="chain" active={activeTab}>
        <div className="space-y-4">
          <VolPanel chain={chain} />
          <OptionChainViewer
            symbol={symbol}
            onSelectContract={(c) => {
              setDraft([{ contract: c, instruction: 'BUY_TO_OPEN', quantity: 1 }]);
              setDraftStructure('single');
            }}
          />
        </div>
      </TabPanel>

      <TabPanel id="positions" active={activeTab}>
        <PositionList />
      </TabPanel>

      <TabPanel id="strategies" active={activeTab}>
        <StrategyBuilder
          chain={chain}
          onSelectStructure={(legs, structure) => {
            setDraft(legs);
            setDraftStructure(structure);
          }}
        />
      </TabPanel>

      {draft.length > 0 && (
        <OrderTicket
          draft={draft}
          structure={draftStructure}
          underlying={symbol}
          onClose={() => setDraft([])}
        />
      )}
    </div>
  );
}
