import { describe, expect, it } from 'vitest';
import { addSliceBlockers, SliceBoundary, type BlockerConfig } from '../../src/world/blockers';
import { GROUPS, PhysicsWorld } from '../../src/world/colliders';
import { PLAZA_CENTER, SLICE_RADIUS } from '../../src/logic/worldLayout';

const cfg: BlockerConfig = { radius: 1, spacing: 1.2, height: 4, triggerMargin: 0.5, pushBack: 2, barkCooldownSec: 8 };

describe('slice blockers', () => {
  it('rings the plaza with BLOCKER cylinders whose inner faces sit on SLICE_RADIUS', async () => {
    const p = await PhysicsWorld.create();
    const n = addSliceBlockers(p, cfg);
    expect(n).toBeGreaterThan(300);
    for (const brg of [0, 37, 90, 200, 271.3]) {
      const b = (brg * Math.PI) / 180;
      const dir = { x: -Math.sin(b), y: 0, z: Math.cos(b) };
      const hit = p.raycast({ x: PLAZA_CENTER.x, y: 1, z: PLAZA_CENTER.z }, dir, 100, GROUPS.BLOCKER)!;
      expect(hit.distance).toBeGreaterThanOrEqual(SLICE_RADIUS - 0.01);
      expect(hit.distance).toBeLessThan(SLICE_RADIUS + 0.25); // gaps between cylinders are shallow
      expect(p.raycast({ x: PLAZA_CENTER.x, y: 1, z: PLAZA_CENTER.z }, dir, 100, GROUPS.WORLD)).toBeNull();
    }
  });

  it('pushes the player 2 m back toward the plaza and barks with a cooldown', () => {
    let t = 0;
    let barks = 0;
    const boundary = new SliceBoundary(cfg, { now: () => t, bark: () => barks++ });
    expect(boundary.check({ x: 0, y: 0, z: PLAZA_CENTER.z - 60 })).toBeNull();
    const at = { x: 0, y: 0, z: PLAZA_CENTER.z - 69.4 };
    const back = boundary.check(at)!;
    expect(back.z).toBeCloseTo(PLAZA_CENTER.z - 67.4, 6);
    expect(back.x).toBeCloseTo(0, 6);
    expect(barks).toBe(1);
    t = 3;
    expect(boundary.check(at)).not.toBeNull();
    expect(barks).toBe(1);
    t = 9;
    boundary.check(at);
    expect(barks).toBe(2);
  });
});
