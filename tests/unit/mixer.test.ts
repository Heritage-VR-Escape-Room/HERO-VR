import { describe, expect, it } from 'vitest';
import { volumeGain } from '../../src/audio/mixer';

describe('mixer', () => {
  it('gain is the slider squared, clamped to 0..1', () => {
    expect(volumeGain(0)).toBe(0);
    expect(volumeGain(0.5)).toBeCloseTo(0.25);
    expect(volumeGain(1)).toBe(1);
    expect(volumeGain(2)).toBe(1);
    expect(volumeGain(-1)).toBe(0);
  });
});
