import { describe, it, expect, vi } from 'vitest';
import { createI18n, type Locale } from '../../src/logic/i18n';
import en from '../../public/locales/en.json';
import ar from '../../public/locales/ar.json';
import de from '../../public/locales/de.json';

const tables: Record<Locale, Record<string, string>> = {
  en: { ...en, x: 'Founded {year}' },
  ar,
  de,
};

describe('i18n', () => {
  it('missing key returns #key', () => {
    const i = createI18n(tables, 'en');
    expect(i.t('nope.key')).toBe('#nope.key');
  });

  it('interpolates {year}', () => {
    const i = createI18n(tables, 'en');
    expect(i.t('x', { year: 1715 })).toBe('Founded 1715');
  });

  it('setLocale fires onChange once and switches text', () => {
    const i = createI18n(tables, 'en');
    const cb = vi.fn();
    i.onChange(cb);
    i.setLocale('de');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith('de');
    expect(i.t('ui.menu.continue')).toBe('Fortsetzen');
  });

  it('dir is rtl only for ar', () => {
    const i = createI18n(tables, 'en');
    expect(i.dir()).toBe('ltr');
    i.setLocale('ar');
    expect(i.dir()).toBe('rtl');
    i.setLocale('de');
    expect(i.dir()).toBe('ltr');
  });
});
