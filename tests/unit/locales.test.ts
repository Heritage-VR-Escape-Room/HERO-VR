import { describe, it, expect } from 'vitest';
import en from '../../public/locales/en.json';
import ar from '../../public/locales/ar.json';
import de from '../../public/locales/de.json';
import { BEATS, USED_KEYS as DIALOGUE_KEYS } from '../../src/dialogue/beats';
import { USED_KEYS as ITEM_KEYS } from '../../src/logic/inventory';
import { USED_KEYS as PROMPT_KEYS } from '../../src/ui/hud';
import { USED_KEYS as DOC_KEYS } from '../../src/ui/documentView';
import { USED_KEYS as INSPECT_KEYS } from '../../src/interaction/inspect';
import { USED_KEYS as LOCK_KEYS } from '../../src/puzzles/cipherLock';
import { USED_KEYS as MENU_KEYS } from '../../src/ui/menu';
import { USED_KEYS as PAUSE_KEYS } from '../../src/ui/pause';
import { USED_KEYS as SETTINGS_KEYS } from '../../src/ui/settingsScreen';
import { USED_KEYS as CREDITS_KEYS } from '../../src/ui/credits';
import { USED_KEYS as END_KEYS } from '../../src/ui/endCard';
import { USED_KEYS as PLAZA_KEYS } from '../../src/logic/plazaLayout';
import { USED_KEYS as JOURNAL_KEYS } from '../../src/logic/journal';
import { USED_KEYS as MAP_KEYS } from '../../src/ui/minimap';
import { INTRO_KEYS } from '../../src/ui/intro';

const tables: Record<string, Record<string, string>> = { en, ar, de };

const beatKeys = Object.values(BEATS).flatMap((lines) => lines.flatMap((l) => [l.speaker, l.text]));
const used = [...new Set([...beatKeys, ...DIALOGUE_KEYS, ...ITEM_KEYS, ...PROMPT_KEYS, ...DOC_KEYS, ...INSPECT_KEYS, ...LOCK_KEYS, ...MENU_KEYS, ...PAUSE_KEYS, ...SETTINGS_KEYS, ...CREDITS_KEYS, ...END_KEYS, ...PLAZA_KEYS, ...JOURNAL_KEYS, ...MAP_KEYS, ...INTRO_KEYS, 'ui.intro.skip', 'ui.circuit.hint', 'ui.lenses.on', 'ui.lenses.off', 'prompt.talk', 'item.spectrum_lenses', 'ui.pad.connected'])];

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

  it('the Act 0 script (new script) is covered', () => {
    for (const id of ['b1_wake', 'b_fritz_intro', 'b2_newsstand', 'b_anvin', 'b_panel', 'b_circuit_solved', 'b_anvin_flees', 'b_lenses', 'b_trails', 'b9_hook', 'fritz_notyet', 'fritz_nohint'])
      expect(BEATS[id]?.length, id).toBeGreaterThan(0);
    for (const k of ['hint.circuit.1', 'hint.circuit.2', 'hint.circuit.3', 'item.spectrum_lenses', 'spk.julian', 'spk.fritz', 'spk.owner', 'spk.anvin', 'prompt.talk'])
      expect(used).toContain(k);
  });

  it("Anvin's and Fritz's hint lines are verbatim from the new script", () => {
    expect(en['dlg.anvin.1']).toContain("I'm Anvin from the city repair crew");
    expect(en['dlg.panel.julian']).toBe('You crossed the wires on purpose... This is a circuit board lock.');
    expect(en['hint.circuit.3']).toBe('Flip Switches 1 and 4, then drag the blue jumper wire to the top-right terminal to complete the circuit!');
  });

  it('the Vanguard directive (new script) names Vance, the missiles, the portal train line and Port Said', () => {
    expect(en['doc.vanguard_manifesto.body']).toMatch(/missile/i);
    expect(en['doc.vanguard_manifesto.body']).toMatch(/portal train line/);
    expect(en['doc.vanguard_manifesto.body']).toMatch(/Port Said/);
    expect(en['doc.vanguard_manifesto.body']).toMatch(/Vanguard Armaments/);
    expect(de['doc.vanguard_manifesto.body']).toMatch(/Testraketen/);
    expect(en['doc.vanguard_manifesto.body']).toMatch(/Director Vance/);
    expect(de['doc.vanguard_manifesto.body']).toMatch(/Port Said/);
    expect(ar['doc.vanguard_manifesto.body']).toMatch(/صواريخ/);
    expect(ar['doc.vanguard_manifesto.body']).toMatch(/بورسعيد/);
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
