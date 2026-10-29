/**
 * Main-menu backdrop source: the Schlossgarten with the plaza, seen from the
 * plaza's `menu_orbit` viewpoint. Physics exists only because the world
 * builders register colliders; nothing steps it.
 */
import type { I18n } from '../logic/i18n';
import type { BackdropFactory } from '../render/menuBackdrop';
import { PhysicsWorld } from './colliders';
import { createGardenWorld } from './gardenWorld';
import { createPlaza } from './plaza';

export function plazaBackdrop(i18n: I18n): BackdropFactory {
  return async (renderer, opts) => {
    const physics = await PhysicsWorld.create();
    const world = await createGardenWorld(renderer, physics, opts, { now: () => 0, bark: () => {} });
    const plaza = await createPlaza({ physics, i18n, rig: world.rig });
    world.scene.add(plaza.root);
    world.fog.syncLights();
    return {
      world,
      viewpoint: plaza.menuOrbit,
      update: (dt) => {
        world.update();
        plaza.update(dt, world.camera.position);
      },
      dispose: () => {
        plaza.pyramid.plaqueText.dispose();
        physics.dispose();
      },
    };
  };
}
