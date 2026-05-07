'use client';

/**
 * Wrapper around the browser Notification API with safe defaults.
 * No-ops gracefully when the API is unavailable or permission is denied.
 */

export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export function getPermissionState(): NotificationPermissionState {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestPermission(): Promise<NotificationPermissionState> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return 'default';
  }
}

interface FireOptions {
  title: string;
  body: string;
  tag?: string;          // dedupe tag (same tag → replaces previous)
  silent?: boolean;
  requireInteraction?: boolean;
}

export function fireNotification(opts: FireOptions): void {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(opts.title, {
      body: opts.body,
      tag: opts.tag,
      silent: opts.silent ?? true, // we have our own sound
      requireInteraction: opts.requireInteraction ?? false,
    });
  } catch {
    // Silent failure — desktop notifications are best-effort
  }
}
