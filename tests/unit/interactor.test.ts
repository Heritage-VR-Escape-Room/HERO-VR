import { describe, expect, it } from 'vitest';
import { Object3D, PerspectiveCamera } from 'three/webgpu';
import { Interactor, type Interactable } from '../../src/interaction/interactor';
import { GROUPS, PhysicsWorld } from '../../src/world/colliders';
import { DEFAULT_BINDINGS } from '../../src/logic/bindings';

function setup(physics: PhysicsWorld): { interactor: Interactor; item: Interactable } {
  const camera = new PerspectiveCamera();
  camera.position.set(0, 1.6, 0);
  camera.lookAt(0, 1.6, 5); // looking along +Z
  camera.updateMatrixWorld();
  const interactor = new Interactor({
    physics,
    camera,
    target: new EventTarget(),
    bindings: () => DEFAULT_BINDINGS,
    enabled: () => true,
  });
  const item: Interactable = { id: 'jammer', promptKey: 'prompt.use', object: new Object3D(), canInteract: () => true, interact: () => {} };
  interactor.register(item);
  // The interactable sits 1.8 m ahead.
  physics.addStaticBox({ x: 0, y: 1.6, z: 1.8 }, { x: 0.2, y: 0.2, z: 0.1 }, 0, { group: GROUPS.INTERACTABLE, id: 'jammer' });
  return { interactor, item };
}

describe('Interactor occlusion', () => {
  it('focuses an interactable with nothing in the way', async () => {
    const physics = await PhysicsWorld.create();
    const { interactor } = setup(physics);
    interactor.update();
    expect(interactor.focused()?.id).toBe('jammer');
  });

  it('a nearer WORLD collider (the closed door) blocks it', async () => {
    const physics = await PhysicsWorld.create();
    const { interactor } = setup(physics);
    const door = physics.addStaticBox({ x: 0, y: 1.6, z: 1.0 }, { x: 0.5, y: 0.6, z: 0.02 });
    interactor.update();
    expect(interactor.focused()).toBeNull();
    // Opening the door removes its collider; the jammer is reachable again.
    physics.removeCollider(door);
    interactor.update();
    expect(interactor.focused()?.id).toBe('jammer');
  });

  it('a WORLD collider behind the interactable does not block it', async () => {
    const physics = await PhysicsWorld.create();
    const { interactor } = setup(physics);
    physics.addStaticBox({ x: 0, y: 1.6, z: 2.1 }, { x: 0.5, y: 0.6, z: 0.05 });
    interactor.update();
    expect(interactor.focused()?.id).toBe('jammer');
  });
});
