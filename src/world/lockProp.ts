/**
 * `?props=lock`: the cipher-disc lock on a stone slab, a couple of metres
 * ahead of the flat scene's spawn, facing the player. Stands in for the
 * pyramid base until Task 13.
 */
import { BoxGeometry, Color, Mesh, MeshStandardMaterial, type Scene } from 'three/webgpu';
import type { PhysicsWorld, Vec3Like } from './colliders';
import { GROUPS } from './colliders';
import { LOCK_PUZZLE_ID, CipherLock, type CipherLockDeps } from '../puzzles/cipherLock';

const PANEL_Y = 1.5;
const SLAB = { w: 1.1, h: 2.4, d: 0.5 };

export function createLockProp(
  scene: Scene,
  physics: PhysicsWorld,
  spawn: Vec3Like,
  spawnYawDeg: number,
  deps: Omit<CipherLockDeps, 'parts'>,
  distance = 1.8,
): CipherLock {
  const b = (spawnYawDeg * Math.PI) / 180;
  // Spawn view direction is (-sin b, 0, cos b); the panel faces back at the player.
  const px = spawn.x - Math.sin(b) * distance;
  const pz = spawn.z + Math.cos(b) * distance;
  const rotY = Math.atan2(Math.sin(b), -Math.cos(b));

  const lock = new CipherLock(deps);
  lock.parts.root.position.set(px, PANEL_Y, pz);
  lock.parts.root.rotation.y = rotY;
  scene.add(lock.parts.root);

  const slab = new Mesh(
    new BoxGeometry(SLAB.w, SLAB.h, SLAB.d),
    new MeshStandardMaterial({ color: new Color('#5b5d55'), roughness: 0.85 }),
  );
  // Slab front face sits just behind the frame (local z = -0.03).
  slab.position.set(0, SLAB.h / 2 - PANEL_Y, -0.03 - SLAB.d / 2);
  lock.parts.root.add(slab);

  const back = { x: Math.sin(rotY) * (-0.03 - SLAB.d / 2), z: Math.cos(rotY) * (-0.03 - SLAB.d / 2) };
  physics.addStaticBox(
    { x: px + back.x, y: SLAB.h / 2, z: pz + back.z },
    { x: SLAB.w / 2, y: SLAB.h / 2, z: SLAB.d / 2 },
    rotY,
    { group: GROUPS.INTERACTABLE, id: LOCK_PUZZLE_ID },
  );
  return lock;
}
