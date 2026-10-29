import { describe, expect, it } from 'vitest';
import { MAX_FOG_LIGHTS, pickFogLights, type FogLightCandidate } from '../../src/logic/fogLights';

const lamp = (id: string, x: number, z: number, halo: boolean): FogLightCandidate & { id: string } => ({ id, x, y: 4, z, halo });

describe('pickFogLights', () => {
  it('keeps at most `max` lights, nearest first', () => {
    const c = Array.from({ length: 30 }, (_, i) => lamp(`p${i}`, i * 2, 0, true));
    const got = pickFogLights(c, { x: 0, y: 0, z: 0 }, MAX_FOG_LIGHTS, 100);
    expect(got).toHaveLength(MAX_FOG_LIGHTS);
    expect(MAX_FOG_LIGHTS).toBeLessThanOrEqual(12);
    expect(got.map((l) => l.id)).toEqual(c.slice(0, MAX_FOG_LIGHTS).map((l) => l.id));
  });

  it('drops lights outside the fog reach (horizontal distance)', () => {
    const c = [lamp('near', 10, 0, true), lamp('far', 0, 80, true)];
    expect(pickFogLights(c, { x: 0, y: 50, z: 0 }, 12, 64).map((l) => l.id)).toEqual(['near']);
  });

  it('ranks halos (point lights) before cones (spot lights), so every lamp in reach keeps its halo', () => {
    const c: Array<FogLightCandidate & { id: string }> = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      c.push(lamp(`spot${i}`, Math.sin(a) * 22, Math.cos(a) * 22 + 10, false));
      c.push(lamp(`halo${i}`, Math.sin(a) * 22, Math.cos(a) * 22 + 10, true));
    }
    const got = pickFogLights(c, { x: 0, y: 2, z: 0 }, 12, 64).map((l) => l.id);
    expect(got).toHaveLength(12);
    for (let i = 0; i < 8; i++) expect(got).toContain(`halo${i}`);
    // The four cones that made it are the four nearest lamps' cones.
    const spots = got.filter((id) => id.startsWith('spot'));
    expect(spots).toHaveLength(4);
    const dist = (id: string): number => {
      const l = c.find((x) => x.id === id)!;
      return Math.hypot(l.x, l.z);
    };
    const maxKept = Math.max(...spots.map(dist));
    const dropped = c.filter((l) => !l.halo && !spots.includes(l.id)).map((l) => dist(l.id));
    for (const d of dropped) expect(d).toBeGreaterThanOrEqual(maxKept - 1e-9);
  });
});
