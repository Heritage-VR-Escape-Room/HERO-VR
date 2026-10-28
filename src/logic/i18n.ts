export type Locale = 'en' | 'ar' | 'de';

export const LOCALES: readonly Locale[] = ['en', 'ar', 'de'];

export interface I18n {
  t(key: string, vars?: Record<string, string | number>): string;
  locale(): Locale;
  setLocale(l: Locale): void;
  onChange(cb: (l: Locale) => void): () => void;
  dir(): 'rtl' | 'ltr';
}

export function isLocale(v: unknown): v is Locale {
  return v === 'en' || v === 'ar' || v === 'de';
}

export function createI18n(tables: Record<Locale, Record<string, string>>, initial: Locale): I18n {
  let current = initial;
  const listeners = new Set<(l: Locale) => void>();

  return {
    t(key, vars) {
      const raw = tables[current][key];
      if (raw === undefined) return '#' + key;
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (m, name: string) =>
        name in vars ? String(vars[name]) : m,
      );
    },
    locale: () => current,
    setLocale(l) {
      if (l === current) return;
      current = l;
      for (const cb of [...listeners]) cb(l);
    },
    onChange(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    dir: () => (current === 'ar' ? 'rtl' : 'ltr'),
  };
}

/** Fetch the three locale tables from /locales (served from public/). */
export async function loadTables(base = import.meta.env.BASE_URL): Promise<Record<Locale, Record<string, string>>> {
  const entries = await Promise.all(
    LOCALES.map(async (l) => {
      const res = await fetch(`${base}locales/${l}.json`);
      if (!res.ok) throw new Error(`locale ${l}: HTTP ${res.status}`);
      return [l, (await res.json()) as Record<string, string>] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<Locale, Record<string, string>>;
}
