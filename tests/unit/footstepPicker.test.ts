import { describe, expect, it } from 'vitest';
import { createPicker } from '../../src/logic/footstepPicker';

describe('footstep picker', () => {
  it('never repeats last index over 1000 draws (count 4)', () => {
    const p = createPicker(4);
    let last = -1;
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const { index, pitch } = p.next();
      expect(index).not.toBe(last);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(4);
      expect(pitch).toBeGreaterThanOrEqual(0.95);
      expect(pitch).toBeLessThanOrEqual(1.05);
      seen.add(index);
      last = index;
    }
    expect(seen.size).toBe(4);
  });

  it('a single variant always returns 0', () => {
    const p = createPicker(1);
    for (let i = 0; i < 10; i++) expect(p.next().index).toBe(0);
  });
});
