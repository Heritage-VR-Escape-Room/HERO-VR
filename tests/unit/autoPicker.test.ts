import { describe, it, expect } from 'vitest';
import { pickPreset } from '../../src/logic/autoPicker';

describe('autoPicker', () => {
  it.each([
    [35, 'Medium', 'Low'],
    [35, 'Low', 'Low'],
    [95, 'Medium', 'High'],
    [95, 'High', 'High'],
    [60, 'Medium', 'Medium'],
    [95, 'Ultra', 'Ultra'],
  ] as const)('(%d,%s)->%s', (fps, cur, want) => {
    expect(pickPreset(fps, cur)).toBe(want);
  });
});
