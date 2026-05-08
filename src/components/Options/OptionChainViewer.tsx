'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  OptionChain,
  OptionContract,
  OptionExpiration,
} from '@/types/options';
import { formatPrice } from '@/lib/calculations';
import { findAtmStrike } from '@/lib/options/helpers';

interface Props {
  symbol: string;
  /** Click handler — used by the order ticket to pick a contract. */
  onSelectContract?: (contract: OptionContract) => void;
}

type ColumnSet = {
  bidAsk: boolean;
  iv: boolean;
  oi: boolean;
  volume: boolean;
  delta: boolean;
  theta: boolean;
};

const DEFAULT_COLUMNS: ColumnSet = {
  bidAsk: true,
  iv: true,
  oi: false,
  volume: false,
  delta: true,
  theta: true,
};

/**
 * Live options chain viewer for a single underlying.
 *
 * Layout: expirations as horizontal tabs; for the active expiration,
 * strikes are rows with calls on the left and puts on the right. ATM
 * strike is highlighted; ITM rows shaded. Toggleable column set so the
 * user can decide what they care about.
 *
 * Falls back to a "Configure Schwab to see live options" hint when the
 * chain endpoint returns configured: false.
 */
export default function OptionChainViewer({ symbol, onSelectContract }: Props) {
  const [chain, setChain] = useState<OptionChain | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeExpDate, setActiveExpDate] = useState<string | null>(null);
  const [columns, setColumns] = useState<ColumnSet>(DEFAULT_COLUMNS);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/options/chain?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((data: OptionChain) => {
        if (cancelled) return;
        setChain({
          ...data,
          fetchedAt: new Date(data.fetchedAt as unknown as string),
        });
        if (data.expirations.length > 0 && !activeExpDate) {
          setActiveExpDate(data.expirations[0].date);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setChain(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  if (loading && !chain) {
    return (
      <div className="card card-body text-center py-6 text-sm text-gray-500">
        Loading options chain for {symbol}…
      </div>
    );
  }

  if (!chain) {
    return (
      <div className="card card-body text-center py-6 text-sm text-loss">
        Failed to load chain
      </div>
    );
  }

  if (!chain.configured) {
    return (
      <div className="card card-body text-center py-6 text-sm text-gray-400">
        <div className="font-medium text-white mb-1">Options chain unavailable</div>
        <div>
          {chain.error ?? 'Schwab is not connected.'} Connect in Settings →
          Broker to see live options data.
        </div>
      </div>
    );
  }

  if (chain.expirations.length === 0) {
    return (
      <div className="card card-body text-center py-6 text-sm text-gray-400">
        No options expirations returned for {symbol}.
      </div>
    );
  }

  const activeExp =
    chain.expirations.find((e) => e.date === activeExpDate) ?? chain.expirations[0];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">
            {chain.underlying} options
          </h3>
          <div className="text-[10px] text-gray-500 font-mono">
            Underlying ${chain.underlyingPrice.toFixed(2)} · {chain.expirations.length} expirations
            <span className="ml-2">
              fetched {new Date(chain.fetchedAt).toLocaleTimeString()}
            </span>
          </div>
        </div>
        <ColumnToggles columns={columns} onChange={setColumns} />
      </div>

      {/* Expiration tabs */}
      <ExpirationTabs
        expirations={chain.expirations}
        active={activeExp.date}
        onSelect={setActiveExpDate}
      />

      {/* Chain table */}
      <ChainTable
        chain={chain}
        expiration={activeExp}
        columns={columns}
        onSelectContract={onSelectContract}
      />
    </div>
  );
}

// ── Expiration tabs ──────────────────────────────────────────────────────

function ExpirationTabs({
  expirations,
  active,
  onSelect,
}: {
  expirations: OptionExpiration[];
  active: string;
  onSelect: (date: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {expirations.map((e) => (
        <button
          key={e.date}
          onClick={() => onSelect(e.date)}
          className={`text-xs px-2.5 py-1 rounded border transition font-mono ${
            e.date === active
              ? 'bg-accent/20 border-accent/40 text-accent-light'
              : 'bg-white/[0.03] border-white/10 text-gray-400 hover:text-white'
          }`}
        >
          {e.date}
          <span className="ml-1.5 text-[10px] text-gray-500">{e.daysToExpiry}d</span>
        </button>
      ))}
    </div>
  );
}

// ── Chain table ──────────────────────────────────────────────────────────

function ChainTable({
  chain,
  expiration,
  columns,
  onSelectContract,
}: {
  chain: OptionChain;
  expiration: OptionExpiration;
  columns: ColumnSet;
  onSelectContract?: (c: OptionContract) => void;
}) {
  const allStrikes = useMemo(() => {
    const set = new Set<number>();
    for (const k of Object.keys(expiration.calls)) set.add(parseFloat(k));
    for (const k of Object.keys(expiration.puts)) set.add(parseFloat(k));
    return Array.from(set).sort((a, b) => a - b);
  }, [expiration]);

  const atmStrike = useMemo(
    () => findAtmStrike(expiration, chain.underlyingPrice),
    [expiration, chain.underlyingPrice]
  );

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto max-h-[60vh]">
        <table className="w-full text-[11px] font-mono">
          <thead className="sticky top-0 bg-ink-surface z-10">
            <tr className="border-b border-white/10">
              <SideHeader side="call" columns={columns} />
              <th className="px-2 py-1.5 text-center bg-white/[0.04] sticky left-0">
                Strike
              </th>
              <SideHeader side="put" columns={columns} />
            </tr>
          </thead>
          <tbody>
            {allStrikes.map((strike) => {
              const call = expiration.calls[strike];
              const put = expiration.puts[strike];
              const isAtm = strike === atmStrike;
              const callItm = strike < chain.underlyingPrice;
              const putItm = strike > chain.underlyingPrice;
              return (
                <tr
                  key={strike}
                  className={`border-b border-white/5 ${
                    isAtm ? 'bg-accent/10' : ''
                  } hover:bg-white/[0.04]`}
                >
                  <SideRow
                    contract={call}
                    columns={columns}
                    side="call"
                    itm={callItm}
                    onClick={onSelectContract}
                  />
                  <td
                    className={`px-2 py-1 text-center font-bold ${
                      isAtm
                        ? 'bg-accent/20 text-accent-light'
                        : 'bg-white/[0.04] text-white'
                    }`}
                  >
                    {strike.toFixed(2)}
                  </td>
                  <SideRow
                    contract={put}
                    columns={columns}
                    side="put"
                    itm={putItm}
                    onClick={onSelectContract}
                  />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SideHeader({ side, columns }: { side: 'call' | 'put'; columns: ColumnSet }) {
  const cells: string[] = [];
  if (columns.bidAsk) cells.push('Bid', 'Ask');
  if (columns.iv) cells.push('IV');
  if (columns.delta) cells.push('Δ');
  if (columns.theta) cells.push('Θ');
  if (columns.oi) cells.push('OI');
  if (columns.volume) cells.push('Vol');
  if (side === 'call') cells.reverse();
  return (
    <>
      {cells.map((c) => (
        <th
          key={`${side}-${c}`}
          className={`px-1.5 py-1.5 text-[9px] uppercase tracking-widest text-gray-500 font-normal ${
            side === 'call' ? 'text-right' : 'text-left'
          }`}
        >
          {c}
        </th>
      ))}
    </>
  );
}

function SideRow({
  contract,
  columns,
  side,
  itm,
  onClick,
}: {
  contract: OptionContract | undefined;
  columns: ColumnSet;
  side: 'call' | 'put';
  itm: boolean;
  onClick?: (c: OptionContract) => void;
}) {
  if (!contract) {
    // Empty placeholder cells matching the column layout
    const count =
      (columns.bidAsk ? 2 : 0) +
      (columns.iv ? 1 : 0) +
      (columns.delta ? 1 : 0) +
      (columns.theta ? 1 : 0) +
      (columns.oi ? 1 : 0) +
      (columns.volume ? 1 : 0);
    return (
      <>
        {Array.from({ length: count }).map((_, i) => (
          <td key={i} className="px-1.5 py-1 text-gray-700">
            —
          </td>
        ))}
      </>
    );
  }
  const cells: { label: string; value: string; cls?: string }[] = [];
  if (columns.bidAsk) {
    cells.push({ label: 'bid', value: formatPrice(contract.bid) });
    cells.push({ label: 'ask', value: formatPrice(contract.ask) });
  }
  if (columns.iv) cells.push({ label: 'iv', value: `${(contract.iv * 100).toFixed(1)}%` });
  if (columns.delta) cells.push({ label: 'd', value: contract.delta.toFixed(2) });
  if (columns.theta) cells.push({ label: 't', value: contract.theta.toFixed(2) });
  if (columns.oi) cells.push({ label: 'oi', value: shortNum(contract.openInterest) });
  if (columns.volume) cells.push({ label: 'v', value: shortNum(contract.volume) });
  if (side === 'call') cells.reverse();
  const itmCls = itm ? 'bg-white/[0.03]' : '';
  return (
    <>
      {cells.map((c, i) => (
        <td
          key={i}
          onClick={onClick ? () => onClick(contract) : undefined}
          className={`px-1.5 py-1 ${itmCls} ${
            side === 'call' ? 'text-right' : 'text-left'
          } ${onClick ? 'cursor-pointer hover:text-accent-light' : 'text-gray-300'}`}
          title={`${contract.symbol} · OI ${contract.openInterest} · vol ${contract.volume}`}
        >
          {c.value}
        </td>
      ))}
    </>
  );
}

function shortNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

// ── Column toggles ───────────────────────────────────────────────────────

function ColumnToggles({
  columns,
  onChange,
}: {
  columns: ColumnSet;
  onChange: (next: ColumnSet) => void;
}) {
  const toggle = (k: keyof ColumnSet) => onChange({ ...columns, [k]: !columns[k] });
  return (
    <div className="flex flex-wrap gap-1">
      {(Object.keys(columns) as Array<keyof ColumnSet>).map((k) => (
        <button
          key={k}
          onClick={() => toggle(k)}
          className={`text-[9px] uppercase tracking-widest font-mono px-1.5 py-0.5 rounded border ${
            columns[k]
              ? 'bg-accent/15 border-accent/40 text-accent-light'
              : 'bg-white/[0.03] border-white/10 text-gray-500'
          }`}
        >
          {k}
        </button>
      ))}
    </div>
  );
}
