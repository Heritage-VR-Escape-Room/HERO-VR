import { describe, it, expect } from 'vitest';
import { Footsteps, SPRINT_STRIDE_M, WALK_STRIDE_M } from '../../src/player/footsteps';
import { PhysicsWorld } from '../../src/world/colliders';

describe('Footsteps', () => {
  it('strides are 0.55 m walking, 0.75 m sprinting', () => {
    expect(WALK_STRIDE_M).toBe(0.55);
    expect(SPRINT_STRIDE_M).toBe(0.75);
  });

  it('emits the surface under the feet every 0.55 m walked', async () => {
    const p = await PhysicsWorld.create();
    p.addStaticBox({ x: 0, y: -0.5, z: 0 }, { x: 5, y: 0.5, z: 5 }, 0, { surface: 'gravel' });
    p.addStaticBox({ x: 20, y: -0.5, z: 0 }, { x: 5, y: 0.5, z: 5 }, 0, { surface: 'wood' });
    const f = new Footsteps(p);
    const got: string[] = [];
    f.onStep((s) => got.push(s));
    const feet = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 10; i++) f.update(0.1, false, feet); // 1.0 m
    expect(got).toEqual(['gravel']);
    for (let i = 0; i < 2; i++) f.update(0.1, false, feet); // 1.2 m
    expect(got).toEqual(['gravel', 'gravel']);
    f.update(0.55, false, { x: 20, y: 0, z: 0 });
    expect(got).toEqual(['gravel', 'gravel', 'wood']);
  });

  it('sprinting uses 0.75 m', async () => {
    const p = await PhysicsWorld.create();
    p.addStaticBox({ x: 0, y: -0.5, z: 0 }, { x: 5, y: 0.5, z: 5 }, 0, { surface: 'grass' });
    const f = new Footsteps(p);
    let n = 0;
    f.onStep(() => n++);
    for (let i = 0; i < 7; i++) f.update(0.1, true, { x: 0, y: 0, z: 0 });
    expect(n).toBe(0);
    f.update(0.1, true, { x: 0, y: 0, z: 0 });
    expect(n).toBe(1);
  });

  it('no surface tag means no step sound', async () => {
    const p = await PhysicsWorld.create();
    p.addStaticBox({ x: 0, y: -0.5, z: 0 }, { x: 5, y: 0.5, z: 5 }, 0);
    const f = new Footsteps(p);
    let n = 0;
    f.onStep(() => n++);
    f.update(1, false, { x: 0, y: 0, z: 0 });
    expect(n).toBe(0);
  });
});
