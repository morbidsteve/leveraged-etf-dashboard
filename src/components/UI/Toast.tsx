'use client';

import { useEffect, useState } from 'react';

export type ToastKind = 'success' | 'info' | 'error';

export interface ToastOptions {
  kind?: ToastKind;
  message: string;
  durationMs?: number;
}

/**
 * Tiny global toast system. Fire from anywhere via the `etf-toast` window
 * event:
 *
 *   showToast('Strategy enabled', 'success');
 *   showToast('Failed to save', 'error');
 *
 * Mount once at the app root (already handled in src/app/page.tsx).
 */
export function showToast(message: string, kind: ToastKind = 'success', durationMs = 3000) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ToastOptions>('etf-toast', {
      detail: { message, kind, durationMs },
    })
  );
}

interface ActiveToast {
  id: number;
  kind: ToastKind;
  message: string;
}

export default function ToastHost() {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);

  useEffect(() => {
    let nextId = 1;
    const handler = (e: Event) => {
      const ev = e as CustomEvent<ToastOptions>;
      const opt = ev.detail;
      const id = nextId++;
      const t: ActiveToast = {
        id,
        kind: opt.kind ?? 'success',
        message: opt.message,
      };
      setToasts((prev) => [...prev, t]);
      const dur = opt.durationMs ?? 3000;
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== id));
      }, dur);
    };
    window.addEventListener('etf-toast', handler);
    return () => window.removeEventListener('etf-toast', handler);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[120] flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-3 py-2 rounded-lg backdrop-blur-md border shadow-lg text-sm pointer-events-auto ${
            t.kind === 'success'
              ? 'bg-profit/15 border-profit/40 text-profit'
              : t.kind === 'error'
              ? 'bg-loss/15 border-loss/40 text-loss'
              : 'bg-accent/15 border-accent/40 text-accent-light'
          }`}
        >
          <span className="font-medium">{t.kind === 'success' ? '✓' : t.kind === 'error' ? '✗' : 'ℹ'}</span>{' '}
          {t.message}
        </div>
      ))}
    </div>
  );
}
