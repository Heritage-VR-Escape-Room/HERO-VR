import { describe, it, expect } from 'vitest';
import { createHintScheduler } from '../../src/logic/hints';

describe('hint scheduler', () => {
  it('advances a tier only after 45 s, capped at the last tier', () => {
    const h = createHintScheduler(4);
    expect(h.current()).toBe(0);
    expect(h.request(0)).toBe(0);
    expect(h.request(10)).toBe(0);
    expect(h.request(46)).toBe(1);
    expect(h.request(50)).toBe(1);
    expect(h.request(92)).toBe(2);
    expect(h.request(140)).toBe(3);
    expect(h.request(500)).toBe(3);
    expect(h.current()).toBe(3);
  });

  it('honours a custom gap and single-tier lists', () => {
    const h = createHintScheduler(1);
    expect(h.request(0)).toBe(0);
    expect(h.request(999)).toBe(0);
    const g = createHintScheduler(3, 10);
    g.request(0);
    expect(g.request(10)).toBe(1);
  });
});
