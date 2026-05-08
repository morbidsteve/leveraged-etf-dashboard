'use client';

import { useEffect, useState } from 'react';

interface Shortcut {
  keys: string[];
  description: string;
  category: string;
}

const SHORTCUTS: Shortcut[] = [
  // Navigation
  { keys: ['?'], description: 'Show this help', category: 'Help' },
  { keys: ['/'], description: 'Open command palette / search', category: 'Navigation' },
  { keys: ['n'], description: 'New trade', category: 'Navigation' },
  { keys: ['c'], description: 'Open calculator', category: 'Navigation' },
  { keys: ['r'], description: 'Refresh data', category: 'Navigation' },

  // Chart
  { keys: ['Click bar'], description: 'Set anchor for VWAP (when aVWAP toggle is armed)', category: 'Chart' },
  { keys: ['Drag stop chip'], description: 'Move stop-loss line on the chart', category: 'Chart' },
  { keys: ['Cmd/Ctrl', 'Shift', 'P'], description: 'Toggle perf overlay', category: 'Chart' },

  // Voice
  { keys: ['Hold 🎤'], description: 'Push-to-talk voice command', category: 'Voice' },

  // Routes
  { keys: ['Visit /journal'], description: 'Trade journal (notes + tags)', category: 'Routes' },
  { keys: ['Visit /replay'], description: 'Replay strategies on historical candles', category: 'Routes' },
  { keys: ['Visit /compare'], description: 'Multi-chart compare view', category: 'Routes' },
  { keys: ['Visit /watch'], description: 'Mobile-first BUY/SELL signal view', category: 'Routes' },
];

/**
 * Press '?' anywhere to open. Esc or click backdrop to close. Lists
 * every keyboard shortcut + chart gesture + voice command grouped
 * by category. Doesn't fire while typing in an input.
 */
export default function HotkeyHelpOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.isContentEditable
      )
        return;
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!open) return null;

  const categories = Array.from(new Set(SHORTCUTS.map((s) => s.category)));

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-label="Keyboard shortcuts help"
    >
      <div
        className="card max-w-2xl w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-header flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-white">Keyboard shortcuts</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Press <Kbd>?</Kbd> anywhere to open · <Kbd>Esc</Kbd> to close
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-[11px] uppercase tracking-widest text-gray-500 hover:text-white"
          >
            ✕
          </button>
        </div>
        <div className="card-body space-y-4">
          {categories.map((cat) => (
            <div key={cat}>
              <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">
                {cat}
              </div>
              <div className="space-y-1">
                {SHORTCUTS.filter((s) => s.category === cat).map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="text-gray-300">{s.description}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      {s.keys.map((k, j) => (
                        <span key={j} className="flex items-center gap-1">
                          {j > 0 && <span className="text-gray-600">+</span>}
                          <Kbd>{k}</Kbd>
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/15 text-white">
      {children}
    </kbd>
  );
}
