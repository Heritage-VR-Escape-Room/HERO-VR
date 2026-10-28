/**
 * A 0.4 m cube on an INTERACTABLE collider, added to the flat scene by
 * `?props=testcube`. e2e tests place it at an exact distance from the camera.
 */
import { BoxGeometry, Color, Mesh, MeshStandardMaterial, Vector3, type Camera, type Scene } from 'three/webgpu';
import type { Interactable } from '../interaction/interactor';
import { GROUPS, type PhysicsWorld } from './colliders';
import type { Collider } from '@dimforge/rapier3d-compat';

export const TEST_CUBE_ID = 'testcube';
const SIZE = 0.4;

export interface TestCube {
  mesh: Mesh;
  interactable: Interactable;
  /** Put the cube's near face `distance` metres from the camera, straight ahead at eye height. */
  place(camera: Camera, distance: number): void;
}

export function createTestCube(scene: Scene, physics: PhysicsWorld, onInteract: (mesh: Mesh) => void): TestCube {
  const mesh = new Mesh(
    new BoxGeometry(SIZE, SIZE, SIZE),
    new MeshStandardMaterial({ color: new Color('#b08d57'), roughness: 0.5, metalness: 0.3 }),
  );
  mesh.position.set(0, 100, 0);
  scene.add(mesh);

  let collider: Collider | null = null;
  const dir = new Vector3();
  return {
    mesh,
    interactable: {
      id: TEST_CUBE_ID,
      promptKey: 'prompt.inspect',
      object: mesh,
      canInteract: () => true,
      interact: () => onInteract(mesh),
    },
    place(camera, distance) {
      camera.getWorldDirection(dir);
      mesh.position.copy(camera.position).addScaledVector(dir, distance + SIZE / 2);
      mesh.rotation.set(0, 0, 0);
      if (collider) physics.world.removeCollider(collider, true);
      const h = SIZE / 2;
      collider = physics.addStaticBox(mesh.position, { x: h, y: h, z: h }, 0, { group: GROUPS.INTERACTABLE, id: TEST_CUBE_ID });
    },
  };
}
