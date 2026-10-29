import { describe, it, expect, vi } from 'vitest';
import { canFire, initialStory, reduce, type StoryState } from '../../src/logic/story';
import { StoryDirector } from '../../src/dialogue/director';
import { DialogueRunner, type SubtitleSink, type Line } from '../../src/dialogue/runner';
import { BEATS } from '../../src/dialogue/beats';
import { createSaveService } from '../../src/logic/save';
import { memoryKV } from '../../src/logic/storage';
import { createInventory } from '../../src/logic/inventory';
import { createI18n, type Locale } from '../../src/logic/i18n';
import { createPickup } from '../../src/interaction/pickup';
import type { Object3D } from 'three/webgpu';

const tables: Record<Locale, Record<string, string>> = {
  en: { 'spk.a': 'Ann', 'l.1': 'One', 'l.2': 'Two' },
  ar: { 'spk.a': 'آن', 'l.1': 'واحد', 'l.2': 'اثنان' },
  de: { 'spk.a': 'Anna', 'l.1': 'Eins', 'l.2': 'Zwei' },
};

function fakeRunner() {
  return { play: vi.fn((_lines: Line[], onDone?: () => void) => onDone?.()) };
}

describe('story reducer', () => {
  it('beat fires once', () => {
    let s = initialStory();
    expect(canFire(s, 'b1_wake')).toBe(true);
    s = reduce(s, { type: 'beat', id: 'b1_wake' });
    expect(canFire(s, 'b1_wake')).toBe(false);
    expect(reduce(s, { type: 'beat', id: 'b1_wake' })).toBe(s);
    expect(s.firedBeats).toEqual(['b1_wake']);
  });

  it('reduce is idempotent for item/solved/disabled', () => {
    let s = initialStory();
    for (const type of ['item', 'solved', 'disabled'] as const) {
      s = reduce(s, { type, id: 'x' });
      const again = reduce(s, { type, id: 'x' });
      expect(again).toBe(s);
    }
    expect(s.inventory).toEqual(['x']);
    expect(s.solvedPuzzles).toEqual(['x']);
    expect(s.disabledObjects).toEqual(['x']);
    const c = reduce(s, { type: 'checkpoint', id: 'plaza' });
    expect(c.checkpointId).toBe('plaza');
    expect(reduce(c, { type: 'checkpoint', id: 'plaza' })).toBe(c);
  });

  it('does not mutate the previous state', () => {
    const s = initialStory();
    reduce(s, { type: 'item', id: 'x' });
    expect(s.inventory).toEqual([]);
  });
});

describe('story director', () => {
  it('fire plays a beat once and skips unknown beats', () => {
    const runner = fakeRunner();
    const d = new StoryDirector({ runner, save: createSaveService(memoryKV()) });
    expect(d.fire('b1_wake')).toBe(true);
    expect(d.fire('b1_wake')).toBe(false);
    expect(runner.play).toHaveBeenCalledTimes(1);
    expect(runner.play.mock.calls[0]![0]).toBe(BEATS.b1_wake);
    expect(d.fire('no_such_beat')).toBe(false);
    expect(d.state().firedBeats).toEqual(['b1_wake']);
  });

  it('say plays repeatable lines without recording them', () => {
    const runner = fakeRunner();
    const d = new StoryDirector({ runner, save: createSaveService(memoryKV()) });
    d.say('fritz_nohint');
    d.say('fritz_nohint');
    expect(runner.play).toHaveBeenCalledTimes(2);
    expect(d.state().firedBeats).toEqual([]);
  });

  it('inventory additions are recorded in the story state', () => {
    const inventory = createInventory();
    const d = new StoryDirector({ runner: fakeRunner(), save: createSaveService(memoryKV()), inventory });
    inventory.add('ticket_printer_part');
    d.addItem('lamp');
    expect(d.state().inventory).toEqual(['ticket_printer_part', 'lamp']);
    expect(inventory.items()).toEqual(['ticket_printer_part', 'lamp']);
  });

  it('snapshot → SaveData → restore equals', () => {
    const save = createSaveService(memoryKV());
    const a = new StoryDirector({ runner: fakeRunner(), save, inventory: createInventory() });
    a.fire('b1_wake');
    a.fire('b4_fritz_arrives');
    a.markSolved('cipher_lock');
    a.markDisabled('jammer');
    a.markDisabled('ticket_printer_part_pickup');
    a.addItem('ticket_printer_part');
    a.autosave('pyramid_open');
    const before: StoryState = a.state();
    expect(before.checkpointId).toBe('pyramid_open');

    const data = save.load()!;
    expect(data.firedBeats).toEqual(before.firedBeats);

    const runner = fakeRunner();
    const inventory = createInventory();
    const b = new StoryDirector({ runner, save, inventory });
    const forceSolved = vi.fn();
    const disableJammer = vi.fn();
    const disablePickup = vi.fn();
    const other = vi.fn();
    b.registerPuzzle('cipher_lock', forceSolved);
    b.registerDisableable('jammer', disableJammer);
    b.registerDisableable('unrelated', other);
    b.restore(data);
    // Registered after restore: applied immediately.
    b.registerDisableable('ticket_printer_part_pickup', disablePickup);

    expect(b.state()).toEqual(before);
    expect(forceSolved).toHaveBeenCalledTimes(1);
    expect(disableJammer).toHaveBeenCalledTimes(1);
    expect(disablePickup).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    expect(inventory.items()).toEqual(['ticket_printer_part']);
    expect(runner.play).not.toHaveBeenCalled();
    expect(b.fire('b1_wake')).toBe(false);
  });
});

describe('pickup wiring', () => {
  it('a pickup records item + disabled object, and restore re-hides it', () => {
    const save = createSaveService(memoryKV());
    const inventory = createInventory();
    const d = new StoryDirector({ runner: fakeRunner(), save, inventory });
    const obj = { visible: true } as Object3D;
    const p = createPickup({ id: 'part_pickup', itemId: 'ticket_printer_part', object: obj, inventory, onPicked: (id) => d.markDisabled(id) });
    p.interact();
    d.autosave('alcove');
    expect(d.state().inventory).toEqual(['ticket_printer_part']);
    expect(d.state().disabledObjects).toEqual(['part_pickup']);

    const inv2 = createInventory();
    const d2 = new StoryDirector({ runner: fakeRunner(), save, inventory: inv2 });
    const obj2 = { visible: true } as Object3D;
    const onPicked = vi.fn();
    const p2 = createPickup({ id: 'part_pickup', itemId: 'ticket_printer_part', object: obj2, inventory: inv2, onPicked });
    d2.registerDisableable('part_pickup', p2.markPicked);
    d2.restore(save.load()!);
    expect(obj2.visible).toBe(false);
    expect(p2.canInteract()).toBe(false);
    expect(inv2.items()).toEqual(['ticket_printer_part']);
    expect(onPicked).not.toHaveBeenCalled();
  });
});

describe('dialogue runner', () => {
  function sink() {
    const shown: { speaker: string; text: string; dir: string }[] = [];
    const s: SubtitleSink & { shown: typeof shown; hidden: number } = {
      shown,
      hidden: 0,
      show(l) {
        shown.push({ speaker: l.speaker, text: l.text, dir: l.dir });
      },
      hide() {
        s.hidden++;
      },
    };
    return s;
  }

  it('plays lines in order with their durations, then calls onDone', () => {
    vi.useFakeTimers();
    try {
      const i18n = createI18n(tables, 'en');
      const out = sink();
      const r = new DialogueRunner(i18n, out);
      const done = vi.fn();
      r.play(
        [
          { speaker: 'spk.a', text: 'l.1', duration: 1 },
          { speaker: 'spk.a', text: 'l.2' },
        ],
        done,
      );
      expect(r.isPlaying()).toBe(true);
      expect(out.shown.at(-1)).toEqual({ speaker: 'Ann', text: 'One', dir: 'ltr' });
      vi.advanceTimersByTime(999);
      expect(out.shown.at(-1)!.text).toBe('One');
      vi.advanceTimersByTime(1);
      expect(out.shown.at(-1)!.text).toBe('Two');
      vi.advanceTimersByTime(2000); // durationFor('Two') = 2
      expect(done).toHaveBeenCalledTimes(1);
      expect(r.isPlaying()).toBe(false);
      expect(out.hidden).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-resolves the current line on locale change', () => {
    vi.useFakeTimers();
    try {
      const i18n = createI18n(tables, 'en');
      const out = sink();
      const r = new DialogueRunner(i18n, out);
      r.play([{ speaker: 'spk.a', text: 'l.1', duration: 5 }]);
      i18n.setLocale('ar');
      expect(out.shown.at(-1)).toEqual({ speaker: 'آن', text: 'واحد', dir: 'rtl' });
      r.skip();
      expect(r.isPlaying()).toBe(false);
      i18n.setLocale('de');
      expect(out.shown.at(-1)!.text).toBe('واحد'); // nothing playing: no redraw
    } finally {
      vi.useRealTimers();
    }
  });

  it('skip advances to the next line', () => {
    vi.useFakeTimers();
    try {
      const i18n = createI18n(tables, 'en');
      const out = sink();
      const r = new DialogueRunner(i18n, out);
      const done = vi.fn();
      r.play(
        [
          { speaker: 'spk.a', text: 'l.1', duration: 5 },
          { speaker: 'spk.a', text: 'l.2', duration: 5 },
        ],
        done,
      );
      r.skip();
      expect(out.shown.at(-1)!.text).toBe('Two');
      r.skip();
      expect(done).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(20_000);
      expect(done).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('pause holds the current line; resume continues with the time left', () => {
    vi.useFakeTimers();
    try {
      const i18n = createI18n(tables, 'en');
      const out = sink();
      const r = new DialogueRunner(i18n, out);
      const done = vi.fn();
      r.play([{ speaker: 'spk.a', text: 'l.1', duration: 3 }], done);
      vi.advanceTimersByTime(1000);
      r.pause();
      r.pause(); // idempotent
      vi.advanceTimersByTime(60_000);
      expect(r.isPlaying()).toBe(true);
      expect(done).not.toHaveBeenCalled();
      r.resume();
      vi.advanceTimersByTime(1999);
      expect(done).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(done).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a line started while paused waits for resume', () => {
    vi.useFakeTimers();
    try {
      const i18n = createI18n(tables, 'en');
      const r = new DialogueRunner(i18n, sink());
      const done = vi.fn();
      r.pause();
      r.play([{ speaker: 'spk.a', text: 'l.1', duration: 1 }], done);
      vi.advanceTimersByTime(10_000);
      expect(done).not.toHaveBeenCalled();
      r.resume();
      vi.advanceTimersByTime(1000);
      expect(done).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
