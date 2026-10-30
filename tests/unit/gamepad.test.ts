import { describe, expect, it } from 'vitest';
import { deadzone, Gamepads, PAD } from '../../src/player/gamepad';

function fakePad(buttons: boolean[], axes: number[]): Gamepad {
  return {
    connected: true,
    axes,
    buttons: buttons.map((pressed) => ({ pressed, value: pressed ? 1 : 0, touched: pressed })),
  } as unknown as Gamepad;
}

describe('gamepad', () => {
  it('dead zone: nothing inside it, rescaled from zero just outside, full at the edge', () => {
    expect(deadzone(0.1, 0.1)).toEqual({ x: 0, y: 0 });
    const just = deadzone(0.2, 0);
    expect(just.x).toBeGreaterThan(0);
    expect(just.x).toBeLessThan(0.05);
    expect(deadzone(1, 0).x).toBeCloseTo(1);
  });

  it('just-pressed edges, stick axes (forward = up), and no pad', () => {
    let pad: Gamepad | null = fakePad(Array(17).fill(false), [0, -1, 0.5, 0]);
    const g = new Gamepads(() => [pad]);
    g.poll();
    expect(g.connected()).toBe(true);
    expect(g.move().y).toBeCloseTo(1);
    expect(g.look().x).toBeGreaterThan(0);
    const b = Array(17).fill(false);
    b[PAD.A] = true;
    pad = fakePad(b, [0, 0, 0, 0]);
    g.poll();
    expect(g.pressed(PAD.A)).toBe(true);
    g.poll();
    expect(g.pressed(PAD.A)).toBe(false);
    expect(g.isDown(PAD.A)).toBe(true);
    pad = null;
    g.poll();
    expect(g.connected()).toBe(false);
    expect(g.move()).toEqual({ x: 0, y: 0 });
  });

  it('menu navigation repeats while held', () => {
    const b = Array(17).fill(false);
    b[PAD.DOWN] = true;
    const g = new Gamepads(() => [fakePad(b, [0, 0, 0, 0])]);
    g.poll();
    expect(g.nav(0.016, 'vertical')).toBe(1);
    expect(g.nav(0.1, 'vertical')).toBe(0);
    expect(g.nav(0.35, 'vertical')).toBe(1);
  });
});
