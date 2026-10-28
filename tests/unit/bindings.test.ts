import { describe, it, expect } from 'vitest';
import { DEFAULT_BINDINGS, rebind } from '../../src/logic/bindings';

describe('bindings', () => {
  it('Escape rejected as reserved', () => {
    expect(rebind(DEFAULT_BINDINGS, 'interact', 'Escape')).toEqual({ ok: false, reason: 'reserved' });
  });
  it('binding interact to KeyW swaps with forward', () => {
    const r = rebind(DEFAULT_BINDINGS, 'interact', 'KeyW');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.bindings.interact).toBe('KeyW');
      expect(r.bindings.forward).toBe('KeyE');
    }
    expect(DEFAULT_BINDINGS.forward).toBe('KeyW');
  });
  it('plain rebind to a free key', () => {
    const r = rebind(DEFAULT_BINDINGS, 'hint', 'KeyJ');
    expect(r.ok && r.bindings.hint).toBe('KeyJ');
  });
});
