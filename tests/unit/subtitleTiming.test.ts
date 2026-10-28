import { describe, it, expect } from 'vitest';
import { durationFor } from '../../src/logic/subtitleTiming';

describe('subtitle timing', () => {
  it('short lines get the 2 s floor', () => {
    expect(durationFor('Hi')).toBe(2);
  });
  it('long lines are capped at 8 s', () => {
    expect(durationFor('a'.repeat(300))).toBe(8);
  });
  it('mid-length lines scale with length', () => {
    expect(durationFor('a'.repeat(45))).toBeCloseTo(4.2);
  });
});
