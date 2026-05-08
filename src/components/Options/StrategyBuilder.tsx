'use client';

import { useState } from 'react';
import {
  OptionChain,
  OptionContract,
  OptionInstruction,
  OptionStructure,
} from '@/types/options';
import { findContractByDelta, findExpirationByDte } from '@/lib/options/helpers';

type DraftLeg = {
  contract: OptionContract;
  instruction: OptionInstruction;
  quantity: number;
};

interface Props {
  chain: OptionChain | null;
  onSelectStructure: (legs: DraftLeg[], structure: OptionStructure) => void;
}

/**
 * One-click multi-leg structure builder. Pick a structure (vertical,
 * iron condor, etc.); we auto-resolve sensible legs from the live chain
 * by delta. User can hand-edit in the order ticket afterwards.
 *
 * Defaults are conservative:
 *   - Vertical: 30Δ short / 15Δ long (credit) or vice versa (debit)
 *   - Iron condor: 15Δ short legs / 5Δ long wings, ~30 DTE
 *   - Calendar: ATM, front month short / next month long
 *   - Straddle/Strangle: ATM / 25Δ wings
 */
export default function StrategyBuilder({ chain, onSelectStructure }: Props) {
  const [dte, setDte] = useState(30);
  const [qty, setQty] = useState(1);

  if (!chain || !chain.configured || chain.expirations.length === 0) {
    return null;
  }

  const exp = findExpirationByDte(chain, dte);
  if (!exp) return null;

  const buildVertical = (type: 'call' | 'put', credit: boolean) => {
    // Credit spread = sell closer-to-money, buy further OTM
    const shortDelta = type === 'call' ? 0.30 : -0.30;
    const longDelta = type === 'call' ? 0.15 : -0.15;
    const short = findContractByDelta(exp, type, shortDelta);
    const long = findContractByDelta(exp, type, longDelta);
    if (!short || !long) return null;
    return [
      { contract: short, instruction: credit ? 'SELL_TO_OPEN' : 'BUY_TO_OPEN', quantity: qty } as DraftLeg,
      { contract: long, instruction: credit ? 'BUY_TO_OPEN' : 'SELL_TO_OPEN', quantity: qty } as DraftLeg,
    ];
  };

  const buildIronCondor = () => {
    const callShort = findContractByDelta(exp, 'call', 0.15);
    const callLong = findContractByDelta(exp, 'call', 0.05);
    const putShort = findContractByDelta(exp, 'put', -0.15);
    const putLong = findContractByDelta(exp, 'put', -0.05);
    if (!callShort || !callLong || !putShort || !putLong) return null;
    return [
      { contract: putLong, instruction: 'BUY_TO_OPEN', quantity: qty } as DraftLeg,
      { contract: putShort, instruction: 'SELL_TO_OPEN', quantity: qty } as DraftLeg,
      { contract: callShort, instruction: 'SELL_TO_OPEN', quantity: qty } as DraftLeg,
      { contract: callLong, instruction: 'BUY_TO_OPEN', quantity: qty } as DraftLeg,
    ];
  };

  const buildStraddle = (long: boolean) => {
    const call = findContractByDelta(exp, 'call', 0.50);
    const put = findContractByDelta(exp, 'put', -0.50);
    if (!call || !put) return null;
    const ins: OptionInstruction = long ? 'BUY_TO_OPEN' : 'SELL_TO_OPEN';
    return [
      { contract: call, instruction: ins, quantity: qty } as DraftLeg,
      { contract: put, instruction: ins, quantity: qty } as DraftLeg,
    ];
  };

  const buildStrangle = (long: boolean) => {
    const call = findContractByDelta(exp, 'call', 0.25);
    const put = findContractByDelta(exp, 'put', -0.25);
    if (!call || !put) return null;
    const ins: OptionInstruction = long ? 'BUY_TO_OPEN' : 'SELL_TO_OPEN';
    return [
      { contract: call, instruction: ins, quantity: qty } as DraftLeg,
      { contract: put, instruction: ins, quantity: qty } as DraftLeg,
    ];
  };

  const tryBuild = (
    fn: () => DraftLeg[] | null,
    structure: OptionStructure
  ) => {
    const legs = fn();
    if (!legs) return;
    onSelectStructure(legs, structure);
  };

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-white">Strategy templates</h3>
        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-widest text-gray-500">DTE</span>
            <select
              value={dte}
              onChange={(e) => setDte(Number(e.target.value))}
              className="input text-xs py-1"
            >
              {[7, 14, 30, 45, 60].map((d) => (
                <option key={d} value={d}>
                  ~{d}d
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-widest text-gray-500">Qty</span>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
              className="input text-xs py-1 w-16 font-mono"
            />
          </label>
        </div>
      </div>
      <div className="card-body grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Tile
          label="Bull put credit"
          desc="Sell 30Δ put / Buy 15Δ put. Wins if stock stays above breakeven."
          onClick={() => tryBuild(() => buildVertical('put', true), 'vertical')}
        />
        <Tile
          label="Bear call credit"
          desc="Sell 30Δ call / Buy 15Δ call. Wins if stock stays below breakeven."
          onClick={() => tryBuild(() => buildVertical('call', true), 'vertical')}
        />
        <Tile
          label="Bull call debit"
          desc="Buy 30Δ call / Sell 15Δ call. Defined-risk directional bullish."
          onClick={() => tryBuild(() => buildVertical('call', false), 'vertical')}
        />
        <Tile
          label="Bear put debit"
          desc="Buy 30Δ put / Sell 15Δ put. Defined-risk directional bearish."
          onClick={() => tryBuild(() => buildVertical('put', false), 'vertical')}
        />
        <Tile
          label="Iron condor"
          desc="15Δ short / 5Δ long both sides. Range-bound, high-IV play."
          onClick={() => tryBuild(buildIronCondor, 'iron_condor')}
        />
        <Tile
          label="Long straddle"
          desc="Buy ATM call + put. Profits from large moves either way."
          onClick={() => tryBuild(() => buildStraddle(true), 'straddle')}
        />
        <Tile
          label="Short strangle"
          desc="Sell 25Δ call + put. High-IV, undefined risk — be careful."
          onClick={() => tryBuild(() => buildStrangle(false), 'strangle')}
          warn
        />
        <Tile
          label="Long strangle"
          desc="Buy 25Δ call + put. Cheaper than straddle, needs bigger move."
          onClick={() => tryBuild(() => buildStrangle(true), 'strangle')}
        />
      </div>
    </div>
  );
}

function Tile({
  label,
  desc,
  onClick,
  warn,
}: {
  label: string;
  desc: string;
  onClick: () => void;
  warn?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-2.5 rounded-lg border transition ${
        warn
          ? 'border-amber-500/30 bg-amber-500/5 hover:border-amber-400/50'
          : 'border-white/10 bg-white/[0.02] hover:border-accent/40 hover:bg-accent/5'
      }`}
    >
      <div className={`text-xs font-medium ${warn ? 'text-amber-300' : 'text-white'}`}>
        {label}
        {warn && <span className="ml-1.5 text-[9px] uppercase tracking-widest">⚠ undef. risk</span>}
      </div>
      <div className="text-[10px] text-gray-400 mt-1 leading-snug">{desc}</div>
    </button>
  );
}
