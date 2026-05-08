'use client';

import { useEffect, useState } from 'react';
import { useOptionsStore, usePriceStore } from '@/store';
import { OptionPosition, OptionContract } from '@/types/options';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/calculations';
import { showToast } from '@/components/UI';
import PnLCurveChart from './PnLCurveChart';
import { probabilityOfProfit } from '@/lib/options/probability';

/**
 * List of open + closed options positions. Each open row shows:
 *  - structure label
 *  - underlying + leg count
 *  - net cost (debit/credit)
 *  - days to nearest expiration
 *  - estimated current value (mark-based, fetched on demand)
 *  - close / roll / delete actions
 *
 * Closed positions show realized P&L.
 */
export default function PositionList() {
  const positions = useOptionsStore((s) => s.positions);
  const closePosition = useOptionsStore((s) => s.closePosition);
  const deletePosition = useOptionsStore((s) => s.deletePosition);

  const open = positions.filter((p) => !p.closedAt);
  const closed = positions.filter((p) => p.closedAt);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-white">
          Open positions ({open.length})
        </h3>
        {open.length === 0 ? (
          <div className="card card-body text-center py-6 text-xs text-gray-500 italic">
            No open options positions
          </div>
        ) : (
          <div className="space-y-2 mt-2">
            {open.map((p) => (
              <OpenRow
                key={p.id}
                position={p}
                onClose={(closeNetValue) => {
                  const trade = closePosition(p.id, closeNetValue);
                  if (trade) {
                    showToast(
                      `Closed ${p.structure} on ${p.underlying} · ${formatCurrency(
                        trade.realizedPnL ?? 0
                      )}`,
                      (trade.realizedPnL ?? 0) >= 0 ? 'success' : 'info'
                    );
                  }
                }}
                onDelete={() => {
                  if (confirm('Delete this position from the journal?')) {
                    deletePosition(p.id);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {closed.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-white">
            Closed ({closed.length})
          </h3>
          <div className="space-y-1 mt-2 font-mono text-[11px] max-h-64 overflow-y-auto">
            {closed
              .slice()
              .reverse()
              .map((p) => (
                <ClosedRow key={p.id} position={p} onDelete={() => deletePosition(p.id)} />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OpenRow({
  position,
  onClose,
  onDelete,
}: {
  position: OptionPosition;
  onClose: (closeNetValue: number) => void;
  onDelete: () => void;
}) {
  const [currentValue, setCurrentValue] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const livePrice = usePriceStore((s) => s.prices[position.underlying]?.price);

  // Find soonest expiration across legs (for "days to live")
  const soonestDte = Math.min(
    ...position.legs.map((l) => {
      const days = Math.ceil((new Date(l.expiration).getTime() - Date.now()) / 86400_000);
      return Math.max(0, days);
    })
  );

  // Refresh: fetch the chain for the underlying, find each leg, sum mark
  // values × signed quantity × 100 to compute current net value.
  const refresh = async () => {
    setRefreshing(true);
    try {
      const resp = await fetch(
        `/api/options/chain?symbol=${encodeURIComponent(position.underlying)}`
      );
      const chain = await resp.json();
      if (!chain.configured) {
        setCurrentValue(null);
        return;
      }
      let total = 0;
      for (const leg of position.legs) {
        const exp = chain.expirations.find(
          (e: { date: string }) => e.date === leg.expiration
        );
        if (!exp) continue;
        const map = leg.type === 'call' ? exp.calls : exp.puts;
        const c: OptionContract | undefined = map[leg.strike];
        if (!c) continue;
        const sign =
          leg.instruction === 'BUY_TO_OPEN' || leg.instruction === 'BUY_TO_CLOSE' ? 1 : -1;
        const mark = (c.bid + c.ask) / 2;
        total += sign * mark * leg.quantity * 100;
      }
      setCurrentValue(total);
    } catch {
      setCurrentValue(null);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    refresh();
    const i = setInterval(refresh, 30_000);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unrealized =
    currentValue == null ? null : -position.netCost - currentValue;
  // Signs: netCost > 0 = paid (debit), so closing for currentValue > 0 (mark)
  // means you'd receive that. Net P&L = received - paid = currentValue - netCost
  // But our sign convention: realized = -netCost - closeNetValue when closing
  // a debit (you paid debit, you sell back for closeNetValue = negative net).
  // Easier framing: P&L = current mark-to-market value - what you paid.
  // For credit positions: opened receiving |netCost|, closing requires paying
  // currentValue (which is positive premium owed). P&L = |netCost| - currentValue.
  const isCredit = position.netCost < 0;
  const mtmPnL =
    currentValue == null
      ? null
      : isCredit
      ? Math.abs(position.netCost) - currentValue
      : currentValue - position.netCost;

  const dteColor =
    soonestDte <= 7 ? 'text-loss' : soonestDte <= 21 ? 'text-amber-300' : 'text-gray-400';

  return (
    <div className="card glass-hover p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-white text-sm">
            {position.underlying} · {position.structure}
          </div>
          <div className="text-[10px] text-gray-500 font-mono">
            Opened {format(position.openedAt, 'MMM dd HH:mm')} · {position.legs.length} legs
          </div>
          <div className="text-[10px] text-gray-400 font-mono mt-0.5 truncate">
            {position.legs
              .map(
                (l) =>
                  `${l.instruction === 'BUY_TO_OPEN' ? '+' : '-'}${l.quantity} ${l.type[0].toUpperCase()}${l.strike}`
              )
              .join(' · ')}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-xs font-mono ${dteColor}`}>{soonestDte}d</div>
          <div className="text-[9px] uppercase tracking-widest text-gray-500">to expiry</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-white/5">
        <Stat
          label={isCredit ? 'Credit' : 'Debit'}
          value={formatCurrency(Math.abs(position.netCost))}
        />
        <Stat
          label="Mark"
          value={currentValue == null ? '—' : formatCurrency(currentValue)}
        />
        <Stat
          label="Unrealized"
          value={mtmPnL == null ? '—' : formatCurrency(mtmPnL)}
          tone={mtmPnL == null ? undefined : mtmPnL >= 0 ? 'profit' : 'loss'}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-500 pt-1">
        <div>
          Max profit:{' '}
          <span className="text-profit font-mono">
            {position.maxProfit === Infinity ? '∞' : formatCurrency(position.maxProfit)}
          </span>
        </div>
        <div>
          Max loss:{' '}
          <span className="text-loss font-mono">
            {position.maxLoss === Infinity ? '∞' : formatCurrency(position.maxLoss)}
          </span>
        </div>
        {position.breakevens.length > 0 && (
          <div className="col-span-2">
            BE:{' '}
            <span className="text-white font-mono">
              {position.breakevens.map((b) => `$${b.toFixed(2)}`).join(' / ')}
            </span>
          </div>
        )}
      </div>

      {/* POP + P&L curve at expiration */}
      {livePrice && (
        <div className="pt-2 space-y-1">
          <div className="flex items-center justify-between">
            <div className="text-[9px] uppercase tracking-widest text-gray-500">
              P&L at expiration
            </div>
            {(() => {
              // Use the soonest leg's expiration to compute years-to-expiry,
              // and approximate IV from the position's first leg fill (rough).
              const yrs = Math.max(0.001, soonestDte / 252);
              const pop = probabilityOfProfit(position, livePrice, yrs, 0.30);
              return (
                <div className="text-[10px] text-gray-400 font-mono">
                  POP <span className="text-white">{(pop * 100).toFixed(0)}%</span>
                </div>
              );
            })()}
          </div>
          <PnLCurveChart position={position} underlyingPrice={livePrice} />
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-white/5">
        <button
          onClick={refresh}
          disabled={refreshing}
          className="text-[10px] uppercase tracking-widest text-gray-500 hover:text-white"
        >
          {refreshing ? '…' : 'Refresh'}
        </button>
        <div className="flex-1" />
        <button
          onClick={() => {
            if (currentValue == null) {
              showToast('No current value yet — click Refresh first', 'info');
              return;
            }
            onClose(currentValue);
          }}
          className="btn btn-primary text-xs"
        >
          Close at mark
        </button>
        <button
          onClick={onDelete}
          className="text-[10px] uppercase tracking-widest text-loss hover:brightness-125"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function ClosedRow({
  position,
  onDelete,
}: {
  position: OptionPosition;
  onDelete: () => void;
}) {
  const pnl = position.realizedPnL ?? 0;
  return (
    <div
      className={`flex items-center gap-2 p-1.5 rounded ${
        pnl >= 0 ? 'bg-profit/5' : 'bg-loss/5'
      }`}
    >
      <span className="text-gray-500 shrink-0">
        {position.closedAt ? format(position.closedAt, 'MM/dd HH:mm') : '—'}
      </span>
      <span className="text-white shrink-0 uppercase">{position.underlying}</span>
      <span className="text-gray-400 shrink-0">{position.structure}</span>
      <span className="text-gray-500 truncate">
        {position.legs.length} legs
      </span>
      <span
        className={`ml-auto shrink-0 font-mono ${pnl >= 0 ? 'text-profit' : 'text-loss'}`}
      >
        {pnl >= 0 ? '+' : ''}
        {formatCurrency(pnl)}
      </span>
      <button onClick={onDelete} className="text-gray-600 hover:text-loss text-[10px]">
        ×
      </button>
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
    <div className="rounded-lg bg-white/[0.03] border border-white/5 p-1.5">
      <div className="text-[9px] uppercase tracking-widest text-gray-500">{label}</div>
      <div
        className={`text-xs font-mono font-semibold mt-0.5 ${
          tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-white'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
