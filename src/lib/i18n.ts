/**
 * Minimal i18n scaffolding. NO third-party dependency; just a tiny
 * `t(key, vars?)` function backed by a flat string-bag per locale.
 *
 * Goal: get the bones in place so future translation work is mechanical.
 * Default locale is English; un-translated keys fall back to English.
 *
 * Usage:
 *   import { t, setLocale } from '@/lib/i18n';
 *   t('signal.buy')                          // "BUY"
 *   t('trade.opened', { ticker: 'SOXL' })   // "Trade opened: SOXL"
 *
 * To add a new language, drop a file under src/locales/<code>.ts that
 * exports a Record<string, string>, and import it below.
 */

import en from '@/locales/en';
import es from '@/locales/es';

export type Locale = 'en' | 'es';

const BAGS: Record<Locale, Record<string, string>> = {
  en,
  es,
};

let currentLocale: Locale = 'en';

export function setLocale(loc: Locale): void {
  currentLocale = loc;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem('etf-locale', loc);
    } catch {
      // ignore
    }
  }
}

export function getLocale(): Locale {
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem('etf-locale');
      if (stored === 'en' || stored === 'es') {
        currentLocale = stored;
      }
    } catch {
      // ignore
    }
  }
  return currentLocale;
}

/** Translate a key with optional variable substitution.
 *  Variables are referenced as {name} in the source string. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const loc = getLocale();
  const bag = BAGS[loc] ?? BAGS.en;
  let s = bag[key] ?? BAGS.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return s;
}
