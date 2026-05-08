'use client';

import { useEffect, useState } from 'react';
import { perfAll } from '@/lib/perf';

/**
 * Toggleable performance overlay. Press Cmd/Ctrl-Shift-P to show/hide.
 * Refreshes 4× per second while visible.
 *
 * Reads samples from /lib/perf — any code path that calls perfStart()
 * or measureSync() shows up here automatically.
 */
export default function PerfOverlay() {
  const [visible, setVisible] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setVisible((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [visible]);

  if (!visible) return null;
  const stats = perfAll();
  const rows = Object.entries(stats).sort((a, b) => b[1].mean - a[1].mean);

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] card max-w-sm shadow-2xl"
      key={tick}
      role="dialog"
      aria-label="Performance overlay"
    >
      <div className="card-header flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">Perf</h3>
        <button
          onClick={() => setVisible(false)}
          className="text-[10px] uppercase tracking-widest text-gray-500 hover:text-white"
        >
          ✕
        </button>
      </div>
      <div className="card-body">
        {rows.length === 0 ? (
          <div className="text-xs text-gray-500 italic">
            No samples yet — interact with the chart.
          </div>
        ) : (
          <table className="text-[11px] font-mono w-full">
            <thead>
              <tr className="text-gray-500 text-[9px] uppercase tracking-widest">
                <th className="text-left">Name</th>
                <th className="text-right">last</th>
                <th className="text-right">p50</th>
                <th className="text-right">p95</th>
                <th className="text-right">n</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([name, s]) => (
                <tr key={name}>
                  <td className="text-gray-300 truncate pr-2">{name}</td>
                  <td
                    className={`text-right ${
                      s.last > 50 ? 'text-loss' : s.last > 16 ? 'text-amber-300' : 'text-profit'
                    }`}
                  >
                    {s.last.toFixed(1)}
                  </td>
                  <td className="text-right text-gray-300">{s.p50.toFixed(1)}</td>
                  <td className="text-right text-gray-300">{s.p95.toFixed(1)}</td>
                  <td className="text-right text-gray-500">{s.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="text-[10px] text-gray-600 italic mt-2">
          Cmd/Ctrl + Shift + P to toggle. Green &lt;16ms (60fps) · amber &lt;50ms · red &gt;50ms.
        </div>
      </div>
    </div>
  );
}
