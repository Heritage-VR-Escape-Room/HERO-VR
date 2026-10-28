import { describe, it, expect } from 'vitest';
import { KeyboardInput } from '../../src/player/input';
import { DEFAULT_BINDINGS, type ActionName } from '../../src/logic/bindings';

function key(type: 'keydown' | 'keyup', code: string): Event {
  return Object.assign(new Event(type), { code });
}

describe('KeyboardInput', () => {
  it('maps KeyboardEvent.code through the current bindings', () => {
    const target = new EventTarget();
    let bindings: Record<ActionName, string> = { ...DEFAULT_BINDINGS };
    const kb = new KeyboardInput(target, () => bindings);
    target.dispatchEvent(key('keydown', 'KeyW'));
    expect(kb.isDown('forward')).toBe(true);
    expect(kb.move().forward).toBe(true);
    bindings = { ...bindings, forward: 'ArrowUp' };
    expect(kb.isDown('forward')).toBe(false);
    target.dispatchEvent(key('keydown', 'ArrowUp'));
    expect(kb.isDown('forward')).toBe(true);
    target.dispatchEvent(key('keyup', 'ArrowUp'));
    expect(kb.isDown('forward')).toBe(false);
  });

  it('clear() drops held keys; blur clears too; dispose detaches', () => {
    const target = new EventTarget();
    const kb = new KeyboardInput(target, () => DEFAULT_BINDINGS);
    target.dispatchEvent(key('keydown', 'ShiftLeft'));
    expect(kb.move().sprint).toBe(true);
    kb.clear();
    expect(kb.move().sprint).toBe(false);
    target.dispatchEvent(key('keydown', 'KeyC'));
    target.dispatchEvent(new Event('blur'));
    expect(kb.move().crouch).toBe(false);
    kb.dispose();
    target.dispatchEvent(key('keydown', 'KeyW'));
    expect(kb.isDown('forward')).toBe(false);
  });
});
