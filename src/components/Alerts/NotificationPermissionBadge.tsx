'use client';

import { useEffect, useState } from 'react';
import {
  getPermissionState,
  requestPermission,
  NotificationPermissionState,
} from '@/lib/notify';

/**
 * Tiny pill in the top bar that nudges the user to enable browser notifications.
 * Hides itself once permission is 'granted' or 'unsupported'.
 */
export default function NotificationPermissionBadge() {
  const [state, setState] = useState<NotificationPermissionState>('default');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setState(getPermissionState());
  }, []);

  if (state === 'granted' || state === 'unsupported') return null;

  const handleClick = async () => {
    setPending(true);
    const next = await requestPermission();
    setState(next);
    setPending(false);
  };

  return (
    <button
      onClick={handleClick}
      disabled={pending || state === 'denied'}
      className="text-[10px] uppercase tracking-widest px-2 py-1 rounded-md border border-accent/40 bg-accent/10 text-accent-light hover:brightness-125 transition disabled:opacity-50"
      title={
        state === 'denied'
          ? 'Notifications blocked. Enable in browser settings.'
          : 'Enable browser notifications for live signals'
      }
    >
      {pending ? 'Asking...' : state === 'denied' ? 'Notif blocked' : '🔔 Enable alerts'}
    </button>
  );
}
