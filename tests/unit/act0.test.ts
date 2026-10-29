import { describe, expect, it, vi } from 'vitest';
import { createAct0, MANIFESTO_READ } from '../../src/dialogue/act0';
import { StoryDirector } from '../../src/dialogue/director';
import { createInventory } from '../../src/logic/inventory';

function setup() {
  const play = vi.fn((_lines: unknown, onDone?: () => void) => onDone?.());
  const save = { save: vi.fn() };
  const inventory = createInventory();
  const director = new StoryDirector({ runner: { play }, save, inventory });
  const fly = vi.fn();
  const end = vi.fn();
  const act0 = createAct0({ director, flyFritzTo: fly, showEndCard: end, kiosk: { x: -18, z: -160 } });
  return { director, inventory, save, fly, end, act0 };
}

const far = { x: 6, z: -150 };

describe('Act 0 wiring', () => {
  it('fires the beats in order and ends after the three alcove tasks', () => {
    const { director, inventory, save, fly, end, act0 } = setup();
    act0.start(true);
    act0.update(far, false);
    act0.update({ x: -12, z: -160 }, false);
    act0.lockUsed();
    expect(fly).toHaveBeenCalledWith('pyramid_tip');
    act0.plaqueInspected();
    act0.update(far, true);
    expect(director.state().firedBeats).toEqual(['b1_wake', 'b2_newsstand', 'b4_fritz_arrives', 'b5_latin_translation', 'b7_opening']);
    director.markDisabled('jammer');
    act0.manifestoRead();
    act0.update(far, true);
    expect(end).not.toHaveBeenCalled();
    inventory.add('ticket_printer_part');
    act0.update(far, true);
    act0.update(far, true);
    expect(end).toHaveBeenCalledTimes(1);
    expect(save.save).toHaveBeenLastCalledWith(expect.objectContaining({ checkpointId: 'act0_end' }));
    expect(director.state().disabledObjects).toContain(MANIFESTO_READ);
  });

  it('does not replay the opening for a lock already solved on load', () => {
    const { director, act0 } = setup();
    act0.start(false);
    act0.update(far, true);
    expect(director.state().firedBeats).toEqual([]);
  });
});
