/**
 * Which local lights scatter in the volumetric fog. Every fog light is looped
 * over at every raymarch step, so the set is capped: lights beyond the fog
 * volume's reach are dropped, halos (point lights) rank before cones (spot
 * lights) so every lamp in reach keeps its glow, and each kind is taken
 * nearest first.
 */
export const MAX_FOG_LIGHTS = 12;

export interface FogLightCandidate {
  x: number;
  y: number;
  z: number;
  /** A point light (lamp halo, indicator); false for a spot light's cone. */
  halo: boolean;
}

export function pickFogLights<T extends FogLightCandidate>(
  candidates: readonly T[],
  center: { x: number; y: number; z: number },
  max: number,
  reach: number,
): T[] {
  const d = (c: T): number => Math.hypot(c.x - center.x, c.z - center.z);
  return candidates
    .map((c, i) => ({ c, i, dist: d(c) }))
    .filter((e) => e.dist <= reach)
    .sort((a, b) => Number(b.c.halo) - Number(a.c.halo) || a.dist - b.dist || a.i - b.i)
    .slice(0, Math.max(0, max))
    .map((e) => e.c);
}
