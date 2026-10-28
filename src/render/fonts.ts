import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-naskh-arabic/400.css';
import '@fontsource/im-fell-english/400.css';
import '@fontsource/amiri/400.css';
import type { Locale } from '../logic/i18n';

/** Sample text per family so the browser fetches the right unicode-range subset. */
const FAMILIES: ReadonlyArray<readonly [family: string, sample: string]> = [
  ['Noto Sans', 'Aa'],
  ['Noto Naskh Arabic', 'متابعة'],
  ['IM Fell English', 'Aa'],
  ['Amiri', 'متابعة'],
];

let loading: Promise<void> | undefined;

/** Resolves once every game font is usable by canvas 2D. Safe to call repeatedly. */
export function loadFonts(): Promise<void> {
  loading ??= Promise.all(
    FAMILIES.map(([family, sample]) => document.fonts.load(`32px "${family}"`, sample)),
  ).then(() => undefined);
  return loading;
}

/** Body font stack for a locale (canvas `font` shorthand). */
export function bodyFont(locale: Locale, px: number): string {
  return locale === 'ar'
    ? `${px}px "Noto Naskh Arabic", "Amiri", serif`
    : `${px}px "Noto Sans", sans-serif`;
}
