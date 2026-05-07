'use client';

import { Strategy } from '@/types/strategy';

/**
 * Strategy sharing via URL hash. Hash-not-query so the value never
 * leaves the browser (servers don't see hash fragments).
 *
 *   #s=eyJuYW1lI...
 *
 * Encoding: JSON -> URL-safe base64. Round-trips entry/exit/stop conditions,
 * size, mode, ticker, and cooldown. IDs and timestamps are stripped.
 */

type ShareableStrategy = Omit<Strategy, 'id' | 'createdAt' | 'updatedAt' | 'enabled'>;

const HASH_KEY = 's';

function strategyToShareable(s: Strategy): ShareableStrategy {
  return {
    name: s.name,
    ticker: s.ticker,
    mode: 'paper',  // always import as paper, regardless of source
    size: s.size,
    rsiConfig: s.rsiConfig,
    entry: s.entry,
    exit: s.exit,
    stopLoss: s.stopLoss,
    cooldownMinutes: s.cooldownMinutes,
  };
}

function urlSafe(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function urlUnsafe(s: string): string {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return b64;
}

export function encodeStrategy(s: Strategy): string {
  const shareable = strategyToShareable(s);
  const json = JSON.stringify(shareable);
  if (typeof window === 'undefined') return '';
  const b64 = urlSafe(btoa(unescape(encodeURIComponent(json))));
  return b64;
}

export function decodeStrategy(encoded: string): ShareableStrategy | null {
  if (typeof window === 'undefined') return null;
  try {
    const json = decodeURIComponent(escape(atob(urlUnsafe(encoded))));
    const obj = JSON.parse(json);
    // Light shape check
    if (
      typeof obj !== 'object' ||
      typeof obj.name !== 'string' ||
      typeof obj.ticker !== 'string' ||
      !obj.entry ||
      !obj.exit
    ) {
      return null;
    }
    return obj as ShareableStrategy;
  } catch {
    return null;
  }
}

export function buildShareUrl(s: Strategy, base?: string): string {
  const encoded = encodeStrategy(s);
  const origin = base ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${origin}/#${HASH_KEY}=${encoded}`;
}

/** Read an incoming shared strategy from window.location.hash, then clear it. */
export function consumeIncomingStrategy(): ShareableStrategy | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const v = params.get(HASH_KEY);
  if (!v) return null;
  const decoded = decodeStrategy(v);
  if (!decoded) return null;
  // Clear the hash so reloads don't re-import
  history.replaceState(null, '', window.location.pathname + window.location.search);
  return decoded;
}

export function shareableToAddInput(s: ShareableStrategy): Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    ...s,
    enabled: false, // imports always start disabled
    mode: 'paper',
  };
}
