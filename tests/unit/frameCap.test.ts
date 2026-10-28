import { describe, it, expect } from 'vitest';
import { shouldRender } from '../../src/logic/frameCap';

describe('frameCap', () => {
  it('cap30: 20ms->false, 33ms->true', () => {
    expect(shouldRender(1020, 1000, 30)).toBe(false);
    expect(shouldRender(1033, 1000, 30)).toBe(true);
  });
  it('cap0 always true', () => {
    expect(shouldRender(1000, 1000, 0)).toBe(true);
  });
});
