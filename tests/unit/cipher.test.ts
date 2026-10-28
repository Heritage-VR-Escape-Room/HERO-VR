import { describe, it, expect } from 'vitest';
import { createCipherDisc, encode } from '../../src/logic/cipher';

describe('cipher', () => {
  it('KARL shifted 14 is YOFZ', () => {
    expect(encode('KARL', 14)).toBe('YOFZ');
  });

  it('the digit sum of 1715 is 14', () => {
    expect([...'1715'].reduce((s, d) => s + Number(d), 0)).toBe(14);
  });

  it('offset 14 decodes Y to K, O to A, F to R, Z to L', () => {
    const d = createCipherDisc();
    d.rotateRing(14);
    expect(['Y', 'O', 'F', 'Z'].map((c) => d.plainUnder(c)).join('')).toBe('KARL');
  });

  it('rotateRing wraps both ways', () => {
    const d = createCipherDisc();
    d.rotateRing(-1);
    expect(d.ringOffset()).toBe(25);
    const e = createCipherDisc();
    e.rotateRing(27);
    expect(e.ringOffset()).toBe(1);
  });

  it('KARL on the tumblers is correct at any ring offset; others are not', () => {
    const d = createCipherDisc();
    expect(d.isCorrect()).toBe(false);
    const set = (target: string) => {
      for (let i = 0; i < 4; i++) while (d.tumbler(i) !== target[i]) d.cycleTumbler(i, 1);
    };
    set('KARL');
    for (let o = 0; o < 26; o++) {
      d.rotateRing(1);
      expect(d.isCorrect()).toBe(true);
    }
    set('KARK');
    expect(d.isCorrect()).toBe(false);
  });

  it('tumblers cycle both directions with wrap', () => {
    const d = createCipherDisc();
    expect(d.tumbler(0)).toBe('A');
    d.cycleTumbler(0, -1);
    expect(d.tumbler(0)).toBe('Z');
    d.cycleTumbler(0, 1);
    expect(d.tumbler(0)).toBe('A');
  });
});
