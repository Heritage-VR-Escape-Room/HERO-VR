import { describe, it, expect } from 'vitest';
import en from '../../public/locales/en.json';
import ar from '../../public/locales/ar.json';
import de from '../../public/locales/de.json';
import { BEATS, USED_KEYS as DIALOGUE_KEYS } from '../../src/dialogue/beats';
import { USED_KEYS as ITEM_KEYS } from '../../src/logic/inventory';
import { USED_KEYS as PROMPT_KEYS } from '../../src/ui/prompt';
import { USED_KEYS as DOC_KEYS } from '../../src/ui/documentView';
import { USED_KEYS as INSPECT_KEYS } from '../../src/interaction/inspect';
import { USED_KEYS as LOCK_KEYS } from '../../src/puzzles/cipherLock';

const tables: Record<string, Record<string, string>> = { en, ar, de };

const beatKeys = Object.values(BEATS).flatMap((lines) => lines.flatMap((l) => [l.speaker, l.text]));
const used = [...new Set([...beatKeys, ...DIALOGUE_KEYS, ...ITEM_KEYS, ...PROMPT_KEYS, ...DOC_KEYS, ...INSPECT_KEYS, ...LOCK_KEYS])];

describe('locales', () => {
  it('every key used in BEATS, hints, docs, items and ui exists in en, ar and de with non-empty values', () => {
    const missing: string[] = [];
    for (const [l, t] of Object.entries(tables))
      for (const k of used) if (typeof t[k] !== 'string' || t[k]!.trim() === '') missing.push(`${l}:${k}`);
    expect(missing).toEqual([]);
  });

  it('the three tables have the same keys', () => {
    const keys = (t: Record<string, string>) => Object.keys(t).sort();
    expect(keys(ar)).toEqual(keys(en));
    expect(keys(de)).toEqual(keys(en));
  });

  it('the Act 0 script is covered', () => {
    for (const id of ['b1_wake', 'b2_newsstand', 'b4_fritz_arrives', 'b5_latin_translation', 'b7_opening', 'b9_hook', 'fritz_notyet', 'fritz_nohint'])
      expect(BEATS[id]?.length, id).toBeGreaterThan(0);
    for (const k of ['hint.lock.1', 'hint.lock.2', 'hint.lock.3', 'hint.lock.4', 'item.ticket_printer_part', 'spk.julian', 'spk.fritz', 'spk.owner'])
      expect(used).toContain(k);
  });

  it('the Latin line stays Latin in every locale', () => {
    for (const t of Object.values(tables)) expect(t['plaque.latin']).toBe('ANNI NATALIS SUMMA ROTAM VERTIT');
  });

  it('English beat lines are verbatim from the spec', () => {
    expect(en['dlg.b1.julian']).toBe('Where... what is this air?');
    expect(en['dlg.b2.owner']).toBe('Foreign tankers are poisoning the Rhine! Read it yourself! Port Said did this!');
    expect(en['dlg.b7.fritz']).toBe("KARL! The founder's own name guards the door. Vanguard has a sense of humour.");
    expect(en['hint.lock.4']).toBe('K-A-R-L. Spin it in.');
  });
});
