/**
 * Main-menu background: a world seen from a camera slowly orbiting a
 * viewpoint. The world comes from a factory: the game passes the plaza and
 * its `menu_orbit` viewpoint (world/plazaBackdrop.ts); the fogtest scene is
 * the default for anything else.
 */
import { Mesh, type PerspectiveCamera, type Scene, type Texture, type WebGPURenderer } from 'three/webgpu';
import type { GraphicsOptions } from '../logic/presets';
import { createFogTest } from './fogtest';
import type { VolumetricFog } from './fog';
import type { Highlight } from './highlight';
import type { LightingRig } from './lighting';
import type { PostChain } from './post';

export interface OrbitViewpoint {
  /** Point the camera circles and looks at (world metres). */
  target: { x: number; y: number; z: number };
  radius: number;
  /** Camera height above the ground (m). */
  height: number;
  /** Seconds per full turn. */
  periodSec: number;
}

/** Fogtest stand-in for the plaza's `menu_orbit`. */
export const FOGTEST_ORBIT: OrbitViewpoint = { target: { x: 0, y: 2.2, z: 0 }, radius: 14, height: 2.4, periodSec: 150 };

/** Place `camera` on the orbit at time `tSec` (clockwise seen from above). */
export function orbitCamera(camera: PerspectiveCamera, vp: OrbitViewpoint, tSec: number): void {
  const a = (tSec / vp.periodSec) * Math.PI * 2;
  camera.position.set(vp.target.x + Math.sin(a) * vp.radius, vp.height, vp.target.z + Math.cos(a) * vp.radius);
  camera.lookAt(vp.target.x, vp.target.y, vp.target.z);
}

/** What the backdrop needs from a world. */
export interface BackdropWorld {
  scene: Scene;
  camera: PerspectiveCamera;
  rig: LightingRig;
  fog: VolumetricFog;
  highlight: Highlight;
  post: PostChain;
}

export interface BackdropSource {
  world: BackdropWorld;
  viewpoint: OrbitViewpoint;
  /** Per rendered frame, after the camera is placed (animated props). */
  update?(dtSec: number): void;
  /** Frees anything beyond the scene graph (physics). */
  dispose?(): void;
}

export type BackdropFactory = (renderer: WebGPURenderer, opts: GraphicsOptions) => Promise<BackdropSource>;

export const fogtestBackdrop: BackdropFactory = async (renderer, opts) => ({
  world: await createFogTest(renderer, opts),
  viewpoint: FOGTEST_ORBIT,
});

export interface MenuBackdrop {
  world: BackdropWorld;
  /** Move the camera along the orbit and render one frame. */
  render(tSec: number): void;
  dispose(): void;
}

export async function createMenuBackdrop(
  renderer: WebGPURenderer,
  opts: GraphicsOptions,
  factory: BackdropFactory = fogtestBackdrop,
): Promise<MenuBackdrop> {
  const source = await factory(renderer, opts);
  const { world, viewpoint } = source;
  world.highlight.setHighlighted([]);
  let last: number | null = null;
  return {
    world,
    render(tSec) {
      orbitCamera(world.camera, viewpoint, tSec);
      source.update?.(last === null ? 0 : Math.min(tSec - last, 0.1));
      last = tSec;
      world.rig.update(world.camera.position);
      world.post.render();
    },
    dispose() {
      world.post.dispose();
      world.fog.dispose();
      world.highlight.dispose();
      world.rig.dispose();
      world.scene.traverse((o) => {
        if (o instanceof Mesh) {
          o.geometry.dispose();
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
        }
      });
      (world.scene.background as Texture | null)?.dispose();
      source.dispose?.();
    },
  };
}
