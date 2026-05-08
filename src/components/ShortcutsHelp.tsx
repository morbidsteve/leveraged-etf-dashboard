'use client';

import { useEffect, useState } from 'react';

const SHORTCUTS: { keys: string[]; desc: string }[] = [
  { keys: ['⌘', 'K'], desc: 'Open command palette (universal jump — ~50+ commands)' },
  { keys: ['?'], desc: 'Show this help' },
  { keys: ['/'], desc: 'Focus search' },
  { keys: ['N'], desc: 'New trade' },
  { keys: ['C'], desc: 'Position calculator' },
  { keys: ['R'], desc: 'Refresh data' },
  { keys: ['Esc'], desc: 'Close drawer / palette / modal' },
  { keys: ['↑', '↓'], desc: 'Navigate palette / lists' },
  { keys: ['↵'], desc: 'Select / confirm' },
];

const PALETTE_TIPS: { hint: string; example: string }[] = [
  { hint: 'Type a ticker', example: 'soxl, tqqq, nvda' },
  { hint: 'Type "open"', example: 'opens any drawer' },
  { hint: 'Type "build"', example: 'options templates per ticker' },
  { hint: 'Type "manage"', example: 'manage any open position' },
  { hint: 'Type "kill"', example: 'kill switch — disable all auto strategies' },
  { hint: 'Type "settings"', example: 'jump to any settings tab' },
  { hint: 'Type "chart"', example: 'change interval / range / indicators' },
  { hint: 'Type "alert"', example: 'toggle position auto-alerts' },
  { hint: 'Type "refresh"', example: 'force-refresh all live data' },
  { hint: 'Type "export"', example: 'download a full backup' },
];

/**
 * Modal overlay listing every keyboard shortcut. Triggered by `?` (or
 * Cmd+K → "shortcuts") via the etf-show-shortcuts-help window event.
 */
export default function ShortcutsHelp() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener('etf-show-shortcuts-help', show);
    return () => window.removeEventListener('etf-show-shortcuts-help', show);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center"
      onClick={() => setOpen(false)}
    >
      <div
        className="glass-strong rounded-xl w-full max-w-md mx-4 shadow-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Keyboard shortcuts</h2>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-white text-xs"
            >
              Esc
            </button>
          </div>
        </div>
        <div className="p-4 space-y-2">
          {SHORTCUTS.map((s) => (
            <div key={s.desc} className="flex items-center justify-between text-sm">
              <span className="text-gray-300">{s.desc}</span>
              <span className="flex items-center gap-1">
                {s.keys.map((k, i) => (
                  <kbd key={i} className="kbd">
                    {k}
                  </kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
        <div className="border-t border-white/10 px-4 py-3 space-y-1.5">
          <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2">
            Cmd+K examples
          </div>
          {PALETTE_TIPS.map((t) => (
            <div key={t.hint} className="flex items-center justify-between text-xs">
              <span className="text-gray-300">{t.hint}</span>
              <span className="text-gray-500 font-mono">{t.example}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
