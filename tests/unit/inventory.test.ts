import { describe, it, expect, vi } from 'vitest';
import { createInventory } from '../../src/logic/inventory';

describe('inventory', () => {
  it('add twice → second false, no duplicate', () => {
    const inv = createInventory();
    expect(inv.add('key')).toBe(true);
    expect(inv.add('key')).toBe(false);
    expect(inv.items()).toEqual(['key']);
    expect(inv.has('key')).toBe(true);
    expect(inv.has('lens')).toBe(false);
  });

  it('seeds from initial items and fires onAdd only for new items', () => {
    const inv = createInventory(['a']);
    const cb = vi.fn();
    inv.onAdd(cb);
    inv.add('a');
    inv.add('b');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith('b');
    expect(inv.items()).toEqual(['a', 'b']);
  });
});
