import { describe, it, expect, beforeAll } from 'vitest';
import { BoxGeometry, Matrix4 } from 'three/webgpu';
import { GROUPS, PhysicsWorld, interactionGroups } from '../../src/world/colliders';

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = await PhysicsWorld.create();
});

describe('PhysicsWorld', () => {
  it('has gravity -9.81', () => {
    expect(physics.world.gravity.y).toBeCloseTo(-9.81, 5);
  });

  it('collision group bits', () => {
    expect(GROUPS).toEqual({ WORLD: 1, INTERACTABLE: 2, PLAYER: 4, BLOCKER: 8 });
    expect(interactionGroups(GROUPS.PLAYER, GROUPS.WORLD | GROUPS.BLOCKER)).toBe((4 << 16) | 9);
  });

  it('raycasts a static box and reads its surface tag', async () => {
    const p = await PhysicsWorld.create();
    p.addStaticBox({ x: 0, y: -0.5, z: 0 }, { x: 50, y: 0.5, z: 50 }, 0, { surface: 'cobble' });
    const hit = p.raycast({ x: 3, y: 2, z: 3 }, { x: 0, y: -1, z: 0 }, 5, GROUPS.WORLD);
    expect(hit).not.toBeNull();
    expect(hit!.distance).toBeCloseTo(2, 4);
    expect(hit!.point.y).toBeCloseTo(0, 4);
    expect(hit!.data.surface).toBe('cobble');
  });

  it('raycast respects maxDist and the group mask', async () => {
    const p = await PhysicsWorld.create();
    p.addStaticBox({ x: 0, y: -0.5, z: 0 }, { x: 5, y: 0.5, z: 5 }, 0, { surface: 'wood', group: GROUPS.INTERACTABLE });
    expect(p.raycast({ x: 0, y: 2, z: 0 }, { x: 0, y: -1, z: 0 }, 1.5, GROUPS.INTERACTABLE)).toBeNull();
    expect(p.raycast({ x: 0, y: 2, z: 0 }, { x: 0, y: -1, z: 0 }, 5, GROUPS.WORLD)).toBeNull();
    expect(p.raycast({ x: 0, y: 2, z: 0 }, { x: 0, y: -1, z: 0 }, 5, GROUPS.INTERACTABLE)?.data.surface).toBe('wood');
  });

  it('rotY rotates a static box about Y', async () => {
    const p = await PhysicsWorld.create();
    // A 10 m long, 1 m wide wall along X, turned 90 degrees so it runs along Z.
    p.addStaticBox({ x: 0, y: 1, z: 0 }, { x: 5, y: 1, z: 0.5 }, Math.PI / 2);
    expect(p.raycast({ x: 0, y: 1, z: 10 }, { x: 0, y: 0, z: -1 }, 20, GROUPS.WORLD)!.distance).toBeCloseTo(5, 3);
  });

  it('heightfield collider is hit at its height', async () => {
    const p = await PhysicsWorld.create();
    const heights = new Float32Array(9).fill(2);
    p.addHeightfield(2, 2, heights, { x: 20, y: 1, z: 20 }, { x: 0, y: 0, z: 0 }, { surface: 'grass' });
    const hit = p.raycast({ x: 1, y: 10, z: 1 }, { x: 0, y: -1, z: 0 }, 20, GROUPS.WORLD);
    expect(hit!.point.y).toBeCloseTo(2, 3);
    expect(hit!.data.surface).toBe('grass');
  });

  it('trimesh collider applies the matrix', async () => {
    const p = await PhysicsWorld.create();
    const m = new Matrix4().makeTranslation(0, 3, 0);
    p.addTrimesh(new BoxGeometry(2, 2, 2), m, { surface: 'metal' });
    const hit = p.raycast({ x: 0, y: 10, z: 0 }, { x: 0, y: -1, z: 0 }, 20, GROUPS.WORLD);
    expect(hit!.point.y).toBeCloseTo(4, 3);
    expect(hit!.data.surface).toBe('metal');
  });
});
