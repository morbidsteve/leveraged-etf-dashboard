'use client';

import { useMemo } from 'react';
import { usePriceStore } from '@/store';
import { classifyRegime, regimeColor, regimeLabel } from '@/lib/regime';

/**
 * Tiny regime-classification chip. Reads the SELECTED ticker's candles
 * and shows the current regime label color-coded. Lives in the dashboard
 * header next to the layout switcher.
 */
export default function RegimeChip() {
  const candles = usePriceStore((s) => s.candles);
  const selectedTicker = usePriceStore((s) => s.selectedTicker);

  const reading = useMemo(() => {
    const c = candles[selectedTicker] ?? [];
    if (c.length < 30) return null;
    return classifyRegime(c);
  }, [candles, selectedTicker]);

  if (!reading) return null;

  const color = regimeColor(reading.regime);
  const label = regimeLabel(reading.regime);

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded border"
      style={{
        borderColor: `${color}40`,
        backgroundColor: `${color}15`,
        color,
      }}
      title={reading.description}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {selectedTicker} · {label}
    </span>
  );
}
