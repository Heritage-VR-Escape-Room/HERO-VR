/**
 * The Schlossgarten layout at real scale, as pure data and math (no three.js).
 *
 * World frame: 1 unit = 1 m, origin = Schloss tower base, +Z = north, +Y up.
 * Three.js is right-handed, so with +Z north and +Y up, east is -X (the same
 * convention as the player's yaw and the moon's bearing). Radial axis i
 * (0..31) points at compass bearing i * 11.25 degrees.
 */
import type { Surface } from '../world/colliders';

export const AXES = 32;
export const AXIS_STEP_DEG = 360 / AXES;

export const PLAZA_CENTER = { x: 0, y: 0, z: -170 } as const;
export const GARDEN_RADIUS = 450;
export const LAKE = { center: { x: -40, z: 220 }, rx: 70, rz: 35 };
export const RAIL_RADIUS = 300;
export const SLICE_RADIUS = 70;

/** Cobbled plaza disc (flattened, cobble). Task 13 builds the plaza on it. */
export const PLAZA_RADIUS = 35;
/** Radial paths: 6 m wide strips from 60 m outward. */
export const PATH_WIDTH = 6;
export const PATH_START = 60;
/** A gravel ring path just inside the garden edge. */
export const PERIMETER_PATH_RADIUS = 442;
/** Bearings in this range (inclusive) are cobbled; the rest gravel. */
export const COBBLE_BEARINGS = [135, 225] as const;
export const LAKE_DEPTH = 1.5;
/** Gravel bed either side of the rail centre line. */
export const RAIL_BED_HALF = 1.4;

/** Terrain grid: 1200 x 1200 m at 2 m, centred on the origin. */
export const TERRAIN = { size: 1200, cell: 2, noiseAmplitude: 0.5 } as const;

const DEG = Math.PI / 180;

export function bearing(i: number): number {
  return i * AXIS_STEP_DEG;
}

/** Unit vector on the ground for axis i (north = +Z, east = -X). */
export function direction(i: number): { x: number; z: number } {
  return bearingVector(bearing(i));
}

export function bearingVector(deg: number): { x: number; z: number } {
  const b = deg * DEG;
  return { x: -Math.sin(b), z: Math.cos(b) };
}

/** Compass bearing (0..360) of a ground point seen from the origin. */
export function bearingOf(x: number, z: number): number {
  const b = Math.atan2(-x, z) / DEG;
  return b < 0 ? b + 360 : b;
}

/** Distance from the nearest radial path centre line, or Infinity inside PATH_START. */
export function pathDistance(x: number, z: number): number {
  const r = Math.hypot(x, z);
  if (r < PATH_START) return Infinity;
  const b = bearingOf(x, z);
  const nearest = Math.round(b / AXIS_STEP_DEG) * AXIS_STEP_DEG;
  return r * Math.abs(Math.sin((b - nearest) * DEG));
}

/** Bearing of the radial axis nearest to a point. */
export function nearestAxisBearing(x: number, z: number): number {
  return (Math.round(bearingOf(x, z) / AXIS_STEP_DEG) % AXES) * AXIS_STEP_DEG;
}

export function inLake(x: number, z: number, margin = 0): boolean {
  const dx = (x - LAKE.center.x) / (LAKE.rx + margin);
  const dz = (z - LAKE.center.z) / (LAKE.rz + margin);
  return dx * dx + dz * dz <= 1;
}

/** Normalised elliptical radius: 0 at the lake centre, 1 on its shore. */
function lakeRadius(x: number, z: number): number {
  return Math.hypot((x - LAKE.center.x) / LAKE.rx, (z - LAKE.center.z) / LAKE.rz);
}

/** Rail centre-line radius at a bearing: a gently wavy loop around RAIL_RADIUS. */
export function railRadius(bearingDeg: number): number {
  const b = bearingDeg * DEG;
  return RAIL_RADIUS + 14 * Math.sin(3 * b + 0.6) + 6 * Math.cos(5 * b);
}

export function railDistance(x: number, z: number): number {
  return Math.abs(Math.hypot(x, z) - railRadius(bearingOf(x, z)));
}

export function plazaDistance(x: number, z: number): number {
  return Math.hypot(x - PLAZA_CENTER.x, z - PLAZA_CENTER.z);
}

const smoothstep = (e0: number, e1: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Ground material weights (grass, gravel, cobble) at a point; they sum to 1. */
export function surfaceWeights(x: number, z: number): [number, number, number] {
  const r = Math.hypot(x, z);
  const half = PATH_WIDTH / 2;
  const plaza = smoothstep(PLAZA_RADIUS + 0.6, PLAZA_RADIUS - 0.6, plazaDistance(x, z));
  // The radial path, faded in over its first metre.
  // Paths stop at the lake shore.
  const onPath = inLake(x, z, 1) ? 0 : smoothstep(half + 0.35, half - 0.35, pathDistance(x, z));
  const ring = smoothstep(half + 0.35, half - 0.35, Math.abs(r - PERIMETER_PATH_RADIUS));
  const forecourt = smoothstep(PATH_START + 0.5, PATH_START - 0.5, r);
  const rail = smoothstep(RAIL_BED_HALF + 0.3, RAIL_BED_HALF - 0.3, railDistance(x, z));
  const b = nearestAxisBearing(x, z);
  const cobblePath = b >= COBBLE_BEARINGS[0] && b <= COBBLE_BEARINGS[1] ? onPath : 0;
  const cobble = Math.max(plaza, cobblePath);
  const gravel = Math.min(1 - cobble, Math.max(onPath - cobblePath, ring, forecourt, rail));
  return [1 - cobble - gravel, gravel, cobble];
}

/** The footstep surface at a point: whichever material dominates. */
export function surfaceAt(x: number, z: number): Surface {
  const [g, gr, c] = surfaceWeights(x, z);
  if (c >= gr && c >= g) return 'cobble';
  return gr >= g ? 'gravel' : 'grass';
}

/** Deterministic 2D value noise in [-1, 1]. */
function hash2(ix: number, iz: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967295) * 2 - 1;
}

function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz) + (hash2(ix + 1, iz) - hash2(ix, iz)) * sx;
  const b = hash2(ix, iz + 1) + (hash2(ix + 1, iz + 1) - hash2(ix, iz + 1)) * sx;
  return a + (b - a) * sz;
}

/**
 * Ground height: gentle ±0.5 m undulation, exactly 0 on paths, the forecourt
 * and the plaza (blended over a few metres), and the lake carved 1.5 m deep.
 */
export function heightAt(x: number, z: number): number {
  const half = PATH_WIDTH / 2;
  const n = valueNoise(x / 38, z / 38) * 0.7 + valueNoise(x / 13 + 31.7, z / 13 - 11.3) * 0.3;
  const r = Math.hypot(x, z);
  const flat = Math.max(
    smoothstep(half + 4, half, pathDistance(x, z)),
    smoothstep(half + 4, half, Math.abs(r - PERIMETER_PATH_RADIUS)),
    smoothstep(PATH_START + 4, PATH_START, r),
    smoothstep(SLICE_RADIUS + 10, SLICE_RADIUS + 2, plazaDistance(x, z)),
    smoothstep(RAIL_BED_HALF + 4, RAIL_BED_HALF, railDistance(x, z)),
  );
  let h = TERRAIN.noiseAmplitude * n * (1 - flat);
  const lr = lakeRadius(x, z);
  if (lr < 1.15) {
    // Shore blends to the flat bank, then the bed drops to LAKE_DEPTH.
    h *= smoothstep(0.95, 1.15, lr);
    h -= LAKE_DEPTH * smoothstep(1.0, 0.8, lr);
  }
  return h === 0 ? 0 : h; // no -0
}

/**
 * Heights for a Rapier heightfield over the whole terrain: (rows+1) x (cols+1)
 * in column-major order; rows run along Z, columns along X.
 */
export function terrainHeights(): { rows: number; cols: number; heights: Float32Array } {
  const n = TERRAIN.size / TERRAIN.cell;
  const half = TERRAIN.size / 2;
  const heights = new Float32Array((n + 1) * (n + 1));
  for (let col = 0; col <= n; col++) {
    const x = -half + col * TERRAIN.cell;
    for (let row = 0; row <= n; row++) {
      heights[col * (n + 1) + row] = heightAt(x, -half + row * TERRAIN.cell);
    }
  }
  return { rows: n, cols: n, heights };
}

/* ---------------------------------------------------------------- Schloss */

/** Blockout wing footprints (centre line segments, metres) used by the trees' clearance. */
export const SCHLOSS = {
  mainWing: { length: 170, height: 18, depth: 20, centerZ: -12 },
  sideWing: { length: 120, height: 18, depth: 18, bearings: [135, 225] as const },
  tower: { height: 51, base: 14 },
} as const;

/** Each wing as a segment from a to b on the ground. */
export interface WingSegment {
  a: { x: number; z: number };
  b: { x: number; z: number };
  halfDepth: number;
}

export function schlossSegments(): WingSegment[] {
  const m = SCHLOSS.mainWing;
  const half = m.length / 2;
  const segs: WingSegment[] = [{ a: { x: -half, z: m.centerZ }, b: { x: half, z: m.centerZ }, halfDepth: m.depth / 2 }];
  for (const brg of SCHLOSS.sideWing.bearings) {
    const d = bearingVector(brg);
    // The south-east wing starts at the east end of the main wing (east = -X).
    const start = { x: d.x < 0 ? -half : half, z: m.centerZ };
    segs.push({
      a: start,
      b: { x: start.x + d.x * SCHLOSS.sideWing.length, z: start.z + d.z * SCHLOSS.sideWing.length },
      halfDepth: SCHLOSS.sideWing.depth / 2,
    });
  }
  return segs;
}

function segmentDistance(x: number, z: number, a: { x: number; z: number }, b: { x: number; z: number }): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const t = Math.min(1, Math.max(0, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz)));
  return Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
}

export function schlossDistance(x: number, z: number): number {
  let d = Math.hypot(x, z) - SCHLOSS.tower.base / 2;
  for (const s of schlossSegments()) d = Math.min(d, segmentDistance(x, z, s.a, s.b) - s.halfDepth);
  return d;
}

/* ------------------------------------------------------------------ Trees */

export interface TreeSpot {
  x: number;
  z: number;
  /** Index into the species list. */
  species: number;
  scale: number;
  /** Rotation about Y, radians. */
  rotation: number;
}

export interface TreePlacementOptions {
  seed: number;
  /** Fraction of free candidate spots that get a tree. */
  density?: number;
  rings?: readonly [number, number];
  /** Radial and along-ring candidate spacing (m). */
  spacing?: number;
  jitter?: number;
  /** Relative share of each species. */
  shares?: readonly number[];
  scaleRange?: readonly [number, number];
  clearance?: Partial<TreeClearance>;
}

export interface TreeClearance {
  /** Trunk distance from a path centre line. */
  path: number;
  lake: number;
  /** Distance from the plaza centre: trees stand around the plaza, inside the slice, but never on it. */
  plaza: number;
  rail: number;
  schloss: number;
  /** Half-width of a tree-free band along the slice boundary, so the blocker push-back never lands in a trunk. */
  sliceEdge: number;
}

const DEFAULT_CLEARANCE: TreeClearance = {
  path: 5,
  lake: 10,
  plaza: PLAZA_RADIUS + 8,
  rail: 5,
  schloss: 14,
  sliceEdge: 4,
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Trees on concentric rings between rings[0] and rings[1], jittered, keeping
 * `density` of the candidate spots that are clear of paths, the plaza, the
 * lake, the rail and the Schloss. Deterministic for a seed.
 */
export function placeTrees(opts: TreePlacementOptions): TreeSpot[] {
  const {
    seed,
    density = 0.7,
    rings = [120, 430],
    spacing = 11,
    jitter = 3.5,
    shares = [0.45, 0.55],
    scaleRange = [0.85, 1.15],
  } = opts;
  const clear = { ...DEFAULT_CLEARANCE, ...opts.clearance };
  const rand = mulberry32(seed);
  const shareSum = shares.reduce((a, b) => a + b, 0);
  const out: TreeSpot[] = [];
  for (let r = rings[0]; r <= rings[1] + 1e-6; r += spacing) {
    const count = Math.floor((2 * Math.PI * r) / spacing);
    const phase = rand() * Math.PI * 2;
    for (let k = 0; k < count; k++) {
      // Draw every random number up front so the stream does not depend on the clearance checks.
      const ja = rand();
      const jr = rand();
      const keep = rand();
      const sp = rand() * shareSum;
      const sc = rand();
      const rot = rand();
      const a = phase + (k / count) * Math.PI * 2;
      const rr = Math.min(rings[1], Math.max(rings[0], r + (jr * 2 - 1) * jitter));
      const along = ((ja * 2 - 1) * jitter) / rr;
      const x = Math.sin(a + along) * rr;
      const z = Math.cos(a + along) * rr;
      if (pathDistance(x, z) < clear.path) continue;
      if (Math.abs(Math.hypot(x, z) - PERIMETER_PATH_RADIUS) < clear.path) continue;
      if (inLake(x, z, clear.lake)) continue;
      const pd = plazaDistance(x, z);
      if (pd < clear.plaza || Math.abs(pd - SLICE_RADIUS) < clear.sliceEdge) continue;
      if (railDistance(x, z) < clear.rail) continue;
      if (schlossDistance(x, z) < clear.schloss) continue;
      if (keep >= density) continue;
      let species = 0;
      for (let acc = shares[0]!; sp > acc && species < shares.length - 1; acc += shares[++species]!);
      out.push({ x, z, species, scale: scaleRange[0] + sc * (scaleRange[1] - scaleRange[0]), rotation: rot * Math.PI * 2 });
    }
  }
  return out;
}
