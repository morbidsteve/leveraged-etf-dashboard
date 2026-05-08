'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  OptionContract,
  OptionInstruction,
  OptionLeg,
  OptionStructure,
} from '@/types/options';
import { useOptionsStore, computeStructureRisk } from '@/store';
import { formatPrice, formatCurrency } from '@/lib/calculations';
import { showToast } from '@/components/UI';

type DraftLeg = {
  contract: OptionContract;
  instruction: OptionInstruction;
  quantity: number;
};

interface Props {
  draft: DraftLeg[];
  underlying: string;
  structure: OptionStructure;
  onClose: () => void;
  onPlaced?: () => void;
}

/**
 * Order ticket for one or more option legs. Shows net debit/credit, max
 * profit, max loss, breakevens. Submit triggers /api/options/place
 * (Schwab) AND/OR records as a paper position locally.
 *
 * Designed to be opened from:
 *  - Single click on a contract in OptionChainViewer (single leg)
 *  - Multi-leg StrategyBuilder (verticals, condors, etc.)
 */
export default function OrderTicket({
  draft,
  underlying,
  structure,
  onClose,
  onPlaced,
}: Props) {
  const openPosition = useOptionsStore((s) => s.openPosition);
  const [editable, setEditable] = useState<DraftLeg[]>(draft);
  const [duration, setDuration] = useState<'DAY' | 'GOOD_TILL_CANCEL'>('DAY');
  const [useBroker, setUseBroker] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [schwabConnected, setSchwabConnected] = useState(false);

  useEffect(() => setEditable(draft), [draft]);

  useEffect(() => {
    fetch('/api/schwab/status')
      .then((r) => r.json())
      .then((d) => setSchwabConnected(!!d?.connected))
      .catch(() => setSchwabConnected(false));
  }, []);

  // Compute net price (per-share, not premium)
  const netPrice = useMemo(() => {
    let net = 0;
    for (const l of editable) {
      const sign =
        l.instruction === 'BUY_TO_OPEN' || l.instruction === 'BUY_TO_CLOSE' ? 1 : -1;
      const px = (l.contract.bid + l.contract.ask) / 2;
      net += sign * px * l.quantity;
    }
    return net;
  }, [editable]);

  const isCredit = netPrice < 0;
  const totalQty = editable.reduce((s, l) => s + l.quantity, 0);
  const premium = Math.abs(netPrice) * 100; // per-contract notional
  const totalPremium = premium * totalQty;

  // Risk metrics (preview)
  const previewRisk = useMemo(() => {
    const previewLegs: OptionLeg[] = editable.map((l) => ({
      contractSymbol: l.contract.symbol,
      underlying: l.contract.underlying,
      expiration: l.contract.expiration,
      strike: l.contract.strike,
      type: l.contract.type,
      instruction: l.instruction,
      quantity: l.quantity,
      fillPrice: (l.contract.bid + l.contract.ask) / 2,
      filledAt: new Date(),
    }));
    const netCost = totalQty > 0 ? -netPrice * 100 * totalQty : 0;
    // Note: openPosition uses sign convention "+ = paid, - = received"
    return computeStructureRisk(structure, previewLegs, -netCost);
  }, [editable, netPrice, structure, totalQty]);

  const handleSubmit = async () => {
    if (editable.length === 0) return;
    setSubmitting(true);
    try {
      const fillPrice = Math.abs(netPrice);
      let brokerOrderId: string | null = null;

      if (useBroker) {
        const resp = await fetch('/api/options/place', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: underlying,
            underlying,
            legs: editable.map((l) => ({
              contractSymbol: l.contract.symbol,
              instruction: l.instruction,
              quantity: l.quantity,
            })),
            netPrice,
            duration,
            complexStrategyType:
              structure === 'single' ? undefined : structure.toUpperCase(),
          }),
        });
        let data: { orderId?: string | null; error?: string } = {};
        try {
          data = await resp.json();
        } catch {
          data = {};
        }
        if (!resp.ok) {
          showToast(`Broker rejected: ${data.error ?? `HTTP ${resp.status}`}`, 'error', 5000);
          setSubmitting(false);
          return;
        }
        brokerOrderId = data.orderId ?? null;
        showToast(`Broker order submitted (#${brokerOrderId ?? 'pending'})`, 'success');
      }

      // Always record locally — paper if not broker, journal if broker
      const legs: OptionLeg[] = editable.map((l) => ({
        contractSymbol: l.contract.symbol,
        underlying: l.contract.underlying,
        expiration: l.contract.expiration,
        strike: l.contract.strike,
        type: l.contract.type,
        instruction: l.instruction,
        quantity: l.quantity,
        fillPrice,
        filledAt: new Date(),
      }));
      openPosition({
        underlying,
        structure,
        legs,
        notes: useBroker ? `Broker orderId ${brokerOrderId ?? 'pending'}` : 'paper',
      });
      showToast(
        `${useBroker ? 'Opened' : 'Paper-opened'} ${structure} on ${underlying} · ${
          isCredit ? '+' : '−'
        }${formatCurrency(totalPremium)}`
      );
      onPlaced?.();
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Order failed', 'error', 5000);
      // eslint-disable-next-line no-console
      console.error('OrderTicket submit failed', e);
    } finally {
      setSubmitting(false);
    }
  };

  const brokerActive = useBroker;

  if (editable.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`glass-strong rounded-2xl w-full max-w-xl shadow-glow overflow-hidden ${
          brokerActive ? 'border-2 border-loss/60' : 'border border-white/10'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-white/10 flex items-start justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500 font-mono">
              Options order ticket · {structure}
            </div>
            <div className="text-xl font-bold text-white tracking-tight">{underlying}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 -mr-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* Legs */}
          <div className="space-y-1.5">
            {editable.map((l, i) => (
              <LegRow
                key={i}
                leg={l}
                onChangeInstruction={(ins) => {
                  const next = [...editable];
                  next[i] = { ...l, instruction: ins };
                  setEditable(next);
                }}
                onChangeQty={(q) => {
                  const next = [...editable];
                  next[i] = { ...l, quantity: q };
                  setEditable(next);
                }}
                onRemove={() => setEditable(editable.filter((_, j) => j !== i))}
              />
            ))}
          </div>

          {/* Net price + risk */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5 text-xs">
            <Stat
              label="Net per contract"
              value={`${isCredit ? '+' : '−'}${formatPrice(Math.abs(netPrice))} ${
                isCredit ? 'credit' : 'debit'
              }`}
              tone={isCredit ? 'profit' : undefined}
            />
            <Stat
              label="Total premium"
              value={`${isCredit ? '+' : '−'}${formatCurrency(totalPremium)}`}
              tone={isCredit ? 'profit' : 'loss'}
            />
            <Stat
              label="Max profit"
              value={
                previewRisk.maxProfit === Infinity
                  ? 'unlimited'
                  : formatCurrency(previewRisk.maxProfit)
              }
              tone="profit"
            />
            <Stat
              label="Max loss"
              value={
                previewRisk.maxLoss === Infinity
                  ? 'unlimited ⚠'
                  : formatCurrency(previewRisk.maxLoss)
              }
              tone={previewRisk.maxLoss === Infinity ? 'loss' : undefined}
            />
            {previewRisk.breakevens.length > 0 && (
              <div className="col-span-2 rounded-lg bg-white/[0.03] border border-white/5 p-2">
                <div className="text-[9px] uppercase tracking-widest text-gray-500">Breakevens</div>
                <div className="font-mono text-xs mt-0.5 text-white">
                  {previewRisk.breakevens.map((b) => formatPrice(b)).join(' · ')}
                </div>
              </div>
            )}
          </div>

          {previewRisk.maxLoss === Infinity && (
            <div className="rounded-lg p-2 bg-loss/10 border border-loss/40 text-[11px] text-loss">
              ⚠ This structure has unlimited loss potential. Consider closing
              this with a defined-risk leg (e.g., add a long protective option
              to cap downside).
            </div>
          )}

          {/* Duration + broker toggle */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/5">
            <label className="flex items-center gap-1.5 text-xs">
              <span className="text-gray-500 uppercase tracking-widest text-[9px]">Duration</span>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value as 'DAY' | 'GOOD_TILL_CANCEL')}
                className="input text-xs py-1"
              >
                <option value="DAY">DAY</option>
                <option value="GOOD_TILL_CANCEL">GTC</option>
              </select>
            </label>
            <label className="flex items-center gap-2 cursor-pointer ml-auto">
              <input
                type="checkbox"
                checked={useBroker}
                disabled={!schwabConnected}
                onChange={(e) => {
                  setUseBroker(e.target.checked);
                  if (!e.target.checked) setConfirmed(false);
                }}
              />
              <span className={`text-sm ${schwabConnected ? 'text-white' : 'text-gray-500'}`}>
                Send order to Schwab
              </span>
            </label>
          </div>
          {!schwabConnected && (
            <div className="text-[10px] text-gray-500">
              Schwab not connected — order will be tracked as a paper position.
              Connect in Settings → Broker for live execution.
            </div>
          )}

          {brokerActive && (
            <div className="rounded-lg p-2.5 bg-loss/10 border border-loss/40 space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-loss">
                Real money confirmation
              </div>
              <div className="text-[11px] text-gray-300">
                Submitting <strong className="text-white">{editable.length}-leg</strong>{' '}
                {structure} on {underlying} · {totalQty} contracts ·{' '}
                {isCredit ? 'receives' : 'pays'} {formatCurrency(totalPremium)} premium.
                Server-side options guardrails (premium cap, allowlist) still apply.
              </div>
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <span className="text-[11px] text-loss">I confirm submitting this real options order</span>
              </label>
            </div>
          )}
        </div>

        <div className="px-5 py-3 bg-white/[0.02] border-t border-white/10 flex items-center gap-2">
          <button onClick={onClose} className="btn btn-ghost text-sm" disabled={submitting}>
            Cancel
          </button>
          <div className="flex-1" />
          <button
            onClick={handleSubmit}
            disabled={submitting || (brokerActive && !confirmed) || editable.length === 0}
            className={`btn text-sm ${brokerActive ? 'btn-danger' : 'btn-primary'} disabled:opacity-40`}
          >
            {submitting
              ? 'Submitting…'
              : brokerActive
              ? 'Send to broker'
              : 'Open paper position'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LegRow({
  leg,
  onChangeInstruction,
  onChangeQty,
  onRemove,
}: {
  leg: DraftLeg;
  onChangeInstruction: (ins: OptionInstruction) => void;
  onChangeQty: (q: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-mono">
          <span
            className={`${
              leg.contract.type === 'call' ? 'text-profit' : 'text-loss'
            } font-bold uppercase`}
          >
            {leg.contract.type}
          </span>{' '}
          <span className="text-white">{leg.contract.strike}</span>{' '}
          <span className="text-gray-400">{leg.contract.expiration}</span>{' '}
          <span className="text-gray-500">
            (Δ {leg.contract.delta.toFixed(2)} · IV {(leg.contract.iv * 100).toFixed(0)}%)
          </span>
        </div>
        <button onClick={onRemove} className="text-gray-500 hover:text-loss text-xs">
          ×
        </button>
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <select
          value={leg.instruction}
          onChange={(e) => onChangeInstruction(e.target.value as OptionInstruction)}
          className="input text-xs py-1 flex-1"
        >
          <option value="BUY_TO_OPEN">Buy to open</option>
          <option value="SELL_TO_OPEN">Sell to open</option>
          <option value="BUY_TO_CLOSE">Buy to close</option>
          <option value="SELL_TO_CLOSE">Sell to close</option>
        </select>
        <input
          type="number"
          min={1}
          value={leg.quantity}
          onChange={(e) => onChangeQty(Math.max(1, Number(e.target.value)))}
          className="input text-xs py-1 w-20 font-mono text-right"
        />
        <span className="text-[10px] text-gray-500 font-mono">
          @ ${((leg.contract.bid + leg.contract.ask) / 2).toFixed(2)}
        </span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'profit' | 'loss';
}) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/5 p-2">
      <div className="text-[9px] uppercase tracking-widest text-gray-500">{label}</div>
      <div
        className={`text-sm font-mono font-semibold mt-0.5 ${
          tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-white'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
