import { describe, expect, it } from 'vitest';
import {
  bearing,
  direction,
  GARDEN_RADIUS,
  heightAt,
  inLake,
  LAKE,
  pathDistance,
  PLAZA_CENTER,
  PLAZA_RADIUS,
  placeTrees,
  railRadius,
  RAIL_RADIUS,
  SLICE_RADIUS,
  surfaceAt,
  TERRAIN,
  terrainHeights,
} from '../../src/logic/worldLayout';
import { GROUPS, PhysicsWorld } from '../../src/world/colliders';

describe('world frame', () => {
  it('axis 8 is at bearing 90', () => {
    expect(bearing(8)).toBe(90);
  });

  it('axis 16 points south', () => {
    const d = direction(16);
    expect(d.x).toBeCloseTo(0, 9);
    expect(d.z).toBeCloseTo(-1, 9);
  });

  it('axis 8 points east (-X), matching the controller and moon bearings', () => {
    const d = direction(8);
    expect(d.x).toBeCloseTo(-1, 9);
    expect(d.z).toBeCloseTo(0, 9);
  });

  it('PLAZA_CENTER is on axis 16 at 170 m', () => {
    const d = direction(16);
    expect(PLAZA_CENTER.x).toBeCloseTo(d.x * 170, 9);
    expect(PLAZA_CENTER.z).toBeCloseTo(d.z * 170, 9);
    expect(PLAZA_CENTER.y).toBe(0);
  });

  it('keeps the brief constants', () => {
    expect(GARDEN_RADIUS).toBe(450);
    expect(LAKE).toEqual({ center: { x: -40, z: 220 }, rx: 70, rz: 35 });
    expect(RAIL_RADIUS).toBe(300);
    expect(SLICE_RADIUS).toBe(70);
  });
});

describe('paths and surfaces', () => {
  it('a point on axis 3 beyond 60 m is on a path; a point between axes is not', () => {
    const d = direction(3);
    expect(pathDistance(d.x * 200, d.z * 200)).toBeCloseTo(0, 6);
    const mid = { x: -Math.sin(((3.5 * 11.25) * Math.PI) / 180) * 200, z: Math.cos(((3.5 * 11.25) * Math.PI) / 180) * 200 };
    expect(pathDistance(mid.x, mid.z)).toBeGreaterThan(10);
  });

  it('paths start at 60 m', () => {
    expect(pathDistance(0, 50)).toBe(Infinity);
  });

  it('southern paths (135..225) are cobble, the rest gravel, lawns grass', () => {
    const s = direction(14); // 157.5
    expect(surfaceAt(s.x * 300, s.z * 300)).toBe('cobble');
    const n = direction(2); // 22.5
    expect(surfaceAt(n.x * 300, n.z * 300)).toBe('gravel');
    const lawn = (5.5 * 11.25 * Math.PI) / 180;
    expect(surfaceAt(-Math.sin(lawn) * 200, Math.cos(lawn) * 200)).toBe('grass');
    expect(surfaceAt(PLAZA_CENTER.x + PLAZA_RADIUS - 1, PLAZA_CENTER.z)).toBe('cobble');
  });
});

describe('terrain', () => {
  it('is flat within ±0.5 m, 0 on paths and the plaza, carved 1.5 m in the lake', () => {
    let max = 0;
    for (let x = -500; x <= 500; x += 37) for (let z = -500; z <= 500; z += 41) if (!inLake(x, z, 2)) max = Math.max(max, Math.abs(heightAt(x, z)));
    expect(max).toBeLessThanOrEqual(0.5);
    const d = direction(20);
    expect(heightAt(d.x * 250, d.z * 250)).toBe(0);
    expect(heightAt(PLAZA_CENTER.x + 10, PLAZA_CENTER.z - 5)).toBe(0);
    expect(heightAt(LAKE.center.x, LAKE.center.z)).toBeCloseTo(-1.5, 6);
  });

  it('heightfield collider matches heightAt (orientation check on the asymmetric lake)', async () => {
    const p = await PhysicsWorld.create();
    const { rows, cols, heights } = terrainHeights();
    expect(rows).toBe(TERRAIN.size / TERRAIN.cell);
    p.addHeightfield(rows, cols, heights, { x: TERRAIN.size, y: 1, z: TERRAIN.size }, { x: 0, y: 0, z: 0 });
    const down = { x: 0, y: -1, z: 0 };
    // Probes sit off the 2 m grid: Rapier can miss a vertical ray through a heightfield vertex exactly.
    const lake = p.raycast({ x: LAKE.center.x + 0.3, y: 10, z: LAKE.center.z + 0.3 }, down, 20, GROUPS.WORLD)!;
    expect(lake.point.y).toBeCloseTo(-1.5, 2);
    const mirrored = p.raycast({ x: -LAKE.center.x + 0.3, y: 10, z: -LAKE.center.z + 0.3 }, down, 20, GROUPS.WORLD)!;
    expect(mirrored.point.y).toBeGreaterThan(-0.6);
    for (const [x, z] of [
      [13.3, -77.1],
      [-201.5, 143.7],
      [333.1, 5.9],
    ] as const) {
      const hit = p.raycast({ x, y: 10, z }, down, 20, GROUPS.WORLD)!;
      expect(hit.point.y).toBeCloseTo(heightAt(x, z), 1);
    }
  });
});

describe('rail loop', () => {
  it('stays near RAIL_RADIUS and clear of the lake', () => {
    for (let a = 0; a < 360; a += 3) {
      const r = railRadius(a);
      expect(Math.abs(r - RAIL_RADIUS)).toBeLessThan(25);
      const b = (a * Math.PI) / 180;
      expect(inLake(-Math.sin(b) * r, Math.cos(b) * r, 15)).toBe(false);
    }
  });
});

describe('tree placement', () => {
  const trees = placeTrees({ seed: 7 });

  it('places trees only in rings 120..430 m, never on paths, the plaza or the lake', () => {
    expect(trees.length).toBeGreaterThan(500);
    for (const t of trees) {
      const r = Math.hypot(t.x, t.z);
      expect(r).toBeGreaterThanOrEqual(120 - 4);
      expect(r).toBeLessThanOrEqual(430 + 4);
      expect(pathDistance(t.x, t.z)).toBeGreaterThan(3);
      expect(inLake(t.x, t.z, 0)).toBe(false);
      const pd = Math.hypot(t.x - PLAZA_CENTER.x, t.z - PLAZA_CENTER.z);
      expect(pd).toBeGreaterThan(PLAZA_RADIUS + 5);
      // A clear band along the slice boundary: the blocker's 2 m push-back never lands in a trunk.
      expect(Math.abs(pd - SLICE_RADIUS)).toBeGreaterThanOrEqual(4);
    }
  });

  it('keeps about 70% of the free candidate spots', () => {
    const all = placeTrees({ seed: 7, density: 1 });
    expect(trees.length / all.length).toBeGreaterThan(0.65);
    expect(trees.length / all.length).toBeLessThan(0.75);
  });

  it('is deterministic per seed', () => {
    expect(placeTrees({ seed: 7 })).toEqual(trees);
  });
});
