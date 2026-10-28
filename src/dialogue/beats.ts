/**
 * The Act 0 script as data (spec §7). One-shot story beats are fired through
 * StoryDirector.fire; repeatable barks (fritz_notyet, fritz_nohint,
 * citizen_glare) through StoryDirector.say. Text lives in the locale tables.
 */
import type { Line } from './runner';

const julian = (text: string): Line => ({ speaker: 'spk.julian', text });
const fritz = (text: string): Line => ({ speaker: 'spk.fritz', text });

export const BEATS: Record<string, Line[]> = {
  b1_wake: [julian('dlg.b1.julian')],
  b2_newsstand: [{ speaker: 'spk.owner', text: 'dlg.b2.owner' }],
  b4_fritz_arrives: [fritz('dlg.b4.fritz')],
  b5_latin_translation: [fritz('dlg.b5.fritz')],
  b7_opening: [fritz('dlg.b7.fritz')],
  b9_hook: [julian('dlg.b9.julian'), fritz('dlg.b9.fritz')],
  fritz_notyet: [fritz('dlg.fritz_notyet')],
  fritz_nohint: [fritz('dlg.fritz_nohint')],
  citizen_glare: [{ speaker: 'spk.citizen', text: 'dlg.citizen_glare' }],
};

/** Fritz's tiered hints for the cipher-disc lock (spec §7 hint table), tier 1..4. */
export const LOCK_HINTS: Line[] = [1, 2, 3, 4].map((n) => fritz(`hint.lock.${n}`));

/** The founder's plaque: inscription, the Latin line (Latin in every locale) and its meaning once Fritz translates it. */
export const PLAQUE_KEYS = {
  inscription: 'plaque.inscription',
  latin: 'plaque.latin',
  meaning: 'plaque.latin_meaning',
} as const;

export const USED_KEYS: readonly string[] = [
  ...new Set([
    ...Object.values(BEATS).flatMap((ls) => ls.flatMap((l) => [l.speaker, l.text])),
    ...LOCK_HINTS.flatMap((l) => [l.speaker, l.text]),
    ...Object.values(PLAQUE_KEYS),
  ]),
];
