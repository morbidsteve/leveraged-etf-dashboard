'use client';

import { useEffect, useState } from 'react';

const SHORTCUTS: { keys: string[]; desc: string }[] = [
  { keys: ['⌘', 'K'], desc: 'Open command palette (also Ctrl+K)' },
  { keys: ['?'], desc: 'Show this help' },
  { keys: ['/'], desc: 'Focus search' },
  { keys: ['N'], desc: 'New trade' },
  { keys: ['C'], desc: 'Position calculator' },
  { keys: ['R'], desc: 'Refresh data' },
  { keys: ['Esc'], desc: 'Close drawer / palette / modal' },
  { keys: ['↑', '↓'], desc: 'Navigate palette / lists' },
  { keys: ['↵'], desc: 'Select / confirm' },
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
      </div>
    </div>
  );
}
