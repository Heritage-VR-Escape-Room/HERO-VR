import { describe, expect, it, vi } from 'vitest';
import { createAct0, MANIFESTO_READ } from '../../src/dialogue/act0';
import { StoryDirector } from '../../src/dialogue/director';
import { createInventory } from '../../src/logic/inventory';

function setup() {
  const play = vi.fn((_lines: unknown, onDone?: () => void) => onDone?.());
  const save = { save: vi.fn() };
  const inventory = createInventory();
  const director = new StoryDirector({ runner: { play }, save, inventory });
  const follow = vi.fn();
  const leave = vi.fn();
  const end = vi.fn();
  const act0 = createAct0({
    director,
    fritzArrive: async () => {},
    fritzFollow: follow,
    anvinLeave: leave,
    showEndCard: end,
    places: { kiosk: { x: -18, z: -160 }, anvin: { x: -2.7, z: -174.7 }, trailEnd: { x: 1.5, z: -110 } },
  });
  return { director, save, follow, leave, end, act0 };
}

const bench = { x: 6, z: -150 };
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Act 0 wiring (new script)', () => {
  it('wake, Fritz introduces himself and follows, Anvin, the panel, the solve, the lenses, the trail', async () => {
    const { director, save, follow, leave, end, act0 } = setup();
    act0.start(true);
    await flush();
    expect(director.state().firedBeats).toEqual(['b1_wake', 'b_fritz_intro']);
    expect(follow).toHaveBeenCalledWith(true);
    act0.update(bench, false, false);
    act0.update({ x: -12, z: -160 }, false, false);
    act0.update({ x: -2, z: -178 }, false, false);
    act0.panelUsed();
    act0.update({ x: -2, z: -178 }, true, false);
    expect(leave).toHaveBeenCalled();
    act0.lensesTaken();
    act0.update({ x: 0, z: -172 }, true, true);
    expect(director.state().firedBeats).toEqual([
      'b1_wake', 'b_fritz_intro', 'b2_newsstand', 'b_anvin', 'b_panel', 'b_circuit_solved', 'b_anvin_flees', 'b_lenses', 'b_trails',
    ]);
    // Without the lenses the trail's end means nothing.
    act0.update({ x: 1.5, z: -110 }, true, false);
    expect(end).not.toHaveBeenCalled();
    act0.update({ x: 1.5, z: -110 }, true, true);
    act0.update({ x: 1.5, z: -110 }, true, true);
    expect(end).toHaveBeenCalledTimes(1);
    expect(save.save).toHaveBeenLastCalledWith(expect.objectContaining({ checkpointId: 'act0_end' }));
  });

  it('Continue: no replayed solve lines; Fritz follows again; Anvin stays gone', () => {
    const { director, follow, leave, act0 } = setup();
    for (const id of ['b1_wake', 'b_fritz_intro', 'b_anvin_flees']) director.fire(id);
    act0.start(false);
    expect(follow).toHaveBeenCalledWith(true);
    expect(leave).toHaveBeenCalled();
    const before = director.state().firedBeats.length;
    act0.update(bench, true, false);
    expect(director.state().firedBeats.length).toBe(before);
  });

  it('records the manifesto once', () => {
    const { director, save, act0 } = setup();
    act0.manifestoRead();
    act0.manifestoRead();
    expect(director.state().disabledObjects).toEqual([MANIFESTO_READ]);
    expect(save.save).toHaveBeenCalledTimes(1);
  });
});
