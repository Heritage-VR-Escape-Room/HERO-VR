import { describe, expect, it } from 'vitest';
import { evaluate, initialCircuit, isSolved, TERMINALS, toggle, plug } from '../../src/logic/circuit';

describe('circuit bridge', () => {
  it('starts dead: every switch open, jumper in the bottom-right terminal', () => {
    const c = initialCircuit();
    expect(c.switches).toEqual([false, false, false, false]);
    expect(c.jumper).toBe('BR');
    const e = evaluate(c);
    expect(e.live).toEqual(['A']);
    expect(e.short).toBe(false);
    expect(isSolved(c)).toBe(false);
  });

  it('switches 1 and 4 with the jumper top-right solve it (Fritz tier 3)', () => {
    let c = initialCircuit();
    c = toggle(toggle(c, 0), 3);
    c = plug(c, 'TR');
    const e = evaluate(c);
    expect(e.short).toBe(false);
    expect(e.live).toEqual(['A', 'C', 'D', 'B', 'OUT']);
    expect(isSolved(c)).toBe(true);
  });

  it('a crossed red wire shorts the board once its node is live', () => {
    let c = plug(toggle(toggle(initialCircuit(), 0), 3), 'TR');
    expect(evaluate(toggle(c, 1)).short).toBe(true); // switch 2: A to ground
    expect(isSolved(toggle(c, 1))).toBe(false);
    expect(evaluate(toggle(c, 2)).short).toBe(true); // switch 3: C to ground
    // Switch 3 is harmless while C is dead.
    c = toggle(initialCircuit(), 2);
    expect(evaluate(c).short).toBe(false);
  });

  it('the jumper only completes the circuit in the top-right terminal', () => {
    const base = toggle(toggle(initialCircuit(), 0), 3);
    for (const t of TERMINALS) expect(isSolved(plug(base, t))).toBe(t === 'TR');
  });

  it('partial routes light up to where they stop', () => {
    expect(evaluate(toggle(initialCircuit(), 0)).live).toEqual(['A', 'C', 'D']);
  });
});
