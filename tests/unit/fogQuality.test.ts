import { describe, it, expect } from 'vitest';
import { fogParams, FOG_QUALITIES, isFogQuality } from '../../src/logic/fogQuality';

describe('fogQuality', () => {
  it('fog table matches spec', () => {
    expect(fogParams('WebGL2Safe')).toEqual({ resolutionScale: 0.25, steps: 12, temporal: false });
    expect(fogParams('Low')).toEqual({ resolutionScale: 0.33, steps: 16, temporal: true });
    expect(fogParams('Medium')).toEqual({ resolutionScale: 0.5, steps: 24, temporal: true });
    expect(fogParams('High')).toEqual({ resolutionScale: 0.5, steps: 48, temporal: true });
    expect(fogParams('Ultra')).toEqual({ resolutionScale: 1.0, steps: 64, temporal: true });
  });

  it('lists all five tiers and recognises them', () => {
    expect(FOG_QUALITIES).toEqual(['WebGL2Safe', 'Low', 'Medium', 'High', 'Ultra']);
    for (const q of FOG_QUALITIES) expect(isFogQuality(q)).toBe(true);
    expect(isFogQuality('high')).toBe(false);
    expect(isFogQuality(null)).toBe(false);
  });
});
