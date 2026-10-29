/**
 * Main-menu background: a world seen from a camera slowly orbiting a
 * viewpoint. Until the plaza exists (Task 13) the world is the fogtest scene;
 * Task 13 passes the plaza and its `menu_orbit` viewpoint instead.
 */
import { Mesh, type PerspectiveCamera, type Texture, type WebGPURenderer } from 'three/webgpu';
import type { GraphicsOptions } from '../logic/presets';
import { createFogTest, type FogTestWorld } from './fogtest';

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

export interface MenuBackdrop {
  world: FogTestWorld;
  /** Move the camera along the orbit and render one frame. */
  render(tSec: number): void;
  dispose(): void;
}

export async function createMenuBackdrop(
  renderer: WebGPURenderer,
  opts: GraphicsOptions,
  viewpoint: OrbitViewpoint = FOGTEST_ORBIT,
): Promise<MenuBackdrop> {
  const world = await createFogTest(renderer, opts);
  world.highlight.setHighlighted([]);
  return {
    world,
    render(tSec) {
      orbitCamera(world.camera, viewpoint, tSec);
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
    },
  };
}
