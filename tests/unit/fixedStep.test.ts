import { describe, it, expect } from 'vitest';
import { createFixedStep } from '../../src/logic/fixedStep';

describe('fixedStep', () => {
  it('steps at 60 Hz and carries the remainder', () => {
    const fs = createFixedStep(60, 5);
    const steps: number[] = [];
    let alpha = fs.advance(1 / 120, (dt) => steps.push(dt));
    expect(steps).toEqual([]);
    expect(alpha).toBeCloseTo(0.5, 6);
    alpha = fs.advance(1 / 120, (dt) => steps.push(dt));
    expect(steps).toHaveLength(1);
    expect(steps[0]).toBeCloseTo(1 / 60, 9);
    expect(alpha).toBeCloseTo(0, 6);
  });

  it('caps at 5 substeps and drops the backlog', () => {
    const fs = createFixedStep(60, 5);
    let n = 0;
    fs.advance(1, () => n++);
    expect(n).toBe(5);
    n = 0;
    fs.advance(1 / 60, () => n++);
    expect(n).toBe(1);
  });
});
