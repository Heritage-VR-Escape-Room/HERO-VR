/**
 * The Act 0 plaza layout (src/world/placements/plaza.json) and the small
 * pieces of math the plaza needs, kept free of three.js so they unit-test.
 * Positions are world metres; facings are compass bearings (clockwise from
 * north, +Z = north, east = -X).
 */
import placement from '../world/placements/plaza.json';
import { bearingOf, bearingVector } from './worldLayout';

export type V3 = [number, number, number];

export interface PlazaViewpoint {
  position: V3;
  target: V3;
}

export interface PlazaPlacement {
  pyramid: {
    position: V3;
    height: number;
    plinth: { half: number; height: number };
    bodyBaseHalf: number;
    door: { width: number; height: number; sill: number };
    alcoveDepth: number;
    plaque: { width: number; height: number; centerY: number };
  };
  bench: { model: string; position: V3 };
  kiosk: {
    model: string;
    position: V3;
    owner: { model: string; offset: number };
    /** Kiosk-local [x, y, z, yawDeg] of each newspaper stack. */
    newspapers: Array<[number, number, number, number]>;
  };
  citizens: Array<{ model: string; position: V3 }>;
  lamps: { model: string; ring: number; count: number; firstBearing: number; headY: number; topY: number };
  perches: Record<string, { position: V3; facing: number }>;
  viewpoints: Record<string, PlazaViewpoint>;
}

export const PLAZA = placement as unknown as PlazaPlacement;

/** The active puzzle is the lock within this distance of the pyramid door. */
export const LOCK_ACTIVE_RADIUS_M = 6;

/** Compass bearing from one ground point to another. */
export function bearingToward(from: readonly number[], to: readonly number[]): number {
  return bearingOf(to[0]! - from[0]!, to[2]! - from[2]!);
}

/** Ground positions of the ring of streetlamps around the pyramid, lamp 0 at `firstBearing`. */
export function lampPositions(p: PlazaPlacement = PLAZA): Array<{ x: number; z: number; bearing: number }> {
  const [cx, , cz] = p.pyramid.position;
  const { ring, count, firstBearing } = p.lamps;
  return Array.from({ length: count }, (_, i) => {
    const bearing = firstBearing + (i * 360) / count;
    const d = bearingVector(bearing);
    return { x: cx + d.x * ring, z: cz + d.z * ring, bearing };
  });
}

/** Is the cipher lock the active puzzle: the player within 6 m of the door, or focused on the lock. */
export function lockIsActive(player: { x: number; z: number }, door: { x: number; z: number }, focused: boolean): boolean {
  return focused || Math.hypot(player.x - door.x, player.z - door.z) <= LOCK_ACTIVE_RADIUS_M;
}

/** i18n keys the plaza shows: plaque texture and inspect caption, the manifesto document, the prompts. */
export const USED_KEYS: readonly string[] = [
  'plaque.inscription',
  'plaque.latin',
  'plaque.latin_meaning',
  'doc.vanguard_manifesto.title',
  'doc.vanguard_manifesto.body',
  'prompt.inspect',
  'prompt.read',
  'prompt.use',
  'prompt.pickup',
];
