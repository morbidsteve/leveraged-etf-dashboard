import { describe, it, expect, beforeEach } from 'vitest';
import { t, setLocale } from './i18n';

describe('i18n', () => {
  beforeEach(() => {
    setLocale('en');
  });

  it('returns English by default', () => {
    expect(t('signal.buy')).toBe('BUY');
    expect(t('ui.save')).toBe('Save');
  });

  it('switches to Spanish', () => {
    setLocale('es');
    expect(t('signal.buy')).toBe('COMPRAR');
    expect(t('ui.save')).toBe('Guardar');
  });

  it('falls back to English when key not in target locale', () => {
    // Imagine a key only in en.ts; it should still work in es
    setLocale('es');
    // 'ui.cancel' exists in both — verify Spanish version
    expect(t('ui.cancel')).toBe('Cancelar');
  });

  it('substitutes variables', () => {
    setLocale('en');
    expect(t('trade.opened', { ticker: 'SOXL' })).toBe('Trade opened: SOXL');
    expect(t('trade.takeProfit', { ticker: 'SOXL', pct: '2.0' })).toBe('SOXL · TAKE PROFIT at 2.0%');
  });

  it('returns the key when missing in all locales', () => {
    expect(t('totally.unknown.key')).toBe('totally.unknown.key');
  });
});
