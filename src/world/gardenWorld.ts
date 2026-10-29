/**
 * `?scene=garden`: the whole Schlossgarten at real scale (terrain, trees,
 * lake and fountain, railway, the Schloss) under the night lighting rig,
 * volumetric fog and post chain. The player starts on the plaza; the slice
 * blockers keep them within SLICE_RADIUS of it. The garden has no lamps of
 * its own (fog cost scales with lamp count); Task 13 adds the plaza's.
 */
import { PerspectiveCamera, Scene, Vector3, type WebGPURenderer } from 'three/webgpu';
import { createLightingRig } from '../render/lighting';
import { VolumetricFog } from '../render/fog';
import { buildPost } from '../render/post';
import { Highlight } from '../render/highlight';
import { loadNightSky } from '../render/sky';
import { heightAt } from '../logic/worldLayout';
import type { GraphicsOptions } from '../logic/presets';
import type { PhysicsWorld } from './colliders';
import type { FlatWorld } from './flat';
import { createTerrain, type Terrain } from './terrain';
import { createGarden, type Garden, type TreeConfig, type TreeDetailLevel } from './garden';
import { createSchloss, type SchlossPlacement } from './schloss';
import { addSliceBlockers, SliceBoundary, type BlockerConfig, type BoundaryDeps } from './blockers';
import placement from './placements/garden.json';

export interface Viewpoint {
  position: [number, number, number];
  lookAt: [number, number, number];
  up: [number, number, number];
  fov: number;
  /** Debug views above the fog volume show the scene without fog. */
  fogBypass: boolean;
}

export const GARDEN_PLACEMENT = placement as unknown as {
  spawn: { position: [number, number, number]; yaw: number };
  viewpoints: Record<string, Viewpoint>;
  schloss: SchlossPlacement;
  fountain: { position: [number, number, number] };
  trees: TreeConfig;
  blockers: BlockerConfig;
};

const FOV = 60;
const FAR_M = 900;
const DEBUG_FAR_M = 2500;

export interface GardenWorld extends FlatWorld {
  terrain: Terrain;
  garden: Garden;
  boundary: SliceBoundary;
  groundHeight(x: number, z: number): number;
  /** Per rendered frame, after the camera is placed. */
  update(): void;
  /** Tree LOD distances and shadows follow the shadow setting. */
  applyDetail(opts: GraphicsOptions): void;
  /** Put the camera on a named debug viewpoint (null returns it to the player). Returns false for an unknown name. */
  setViewpoint(name: string | null): boolean;
  /** The viewpoint currently overriding the player camera, if any. */
  viewpoint(): string | null;
}

/** Tree detail tier for a graphics setting (Task 17 may give trees their own option). */
export function treeDetailLevel(opts: GraphicsOptions): TreeDetailLevel {
  return opts.shadows;
}

export async function createGardenWorld(
  renderer: WebGPURenderer,
  physics: PhysicsWorld,
  opts: GraphicsOptions,
  boundaryDeps: BoundaryDeps,
): Promise<GardenWorld> {
  const P = GARDEN_PLACEMENT;
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, FAR_M);
  await loadNightSky(scene);

  const [terrain, schloss, garden] = await Promise.all([
    createTerrain(physics),
    createSchloss(physics, P.schloss),
    createGarden(renderer, physics, P.trees, { x: P.fountain.position[0], z: P.fountain.position[2] }, treeDetailLevel(opts)),
  ]);
  scene.add(terrain.root, schloss, garden.root);
  addSliceBlockers(physics, P.blockers);
  const boundary = new SliceBoundary(P.blockers, boundaryDeps);

  const rig = createLightingRig(scene, renderer, opts.shadows);
  const fog = new VolumetricFog(renderer, scene, camera);
  fog.setQuality(opts.fog);
  const highlight = new Highlight(scene, camera);
  const post = buildPost(renderer, scene, camera, opts, { fog, highlight });

  const [sx, , sz] = P.spawn.position;
  let active: string | null = null;
  const placeOnViewpoint = (vp: Viewpoint): void => {
    camera.position.set(...vp.position);
    camera.up.set(...vp.up);
    camera.lookAt(new Vector3(...vp.lookAt));
  };

  return {
    scene,
    camera,
    rig,
    fog,
    post,
    highlight,
    terrain,
    garden,
    boundary,
    spawn: { x: sx, y: heightAt(sx, sz), z: sz },
    spawnYaw: P.spawn.yaw,
    groundHeight: heightAt,
    update(): void {
      if (active) placeOnViewpoint(P.viewpoints[active]!);
      garden.update(camera);
    },
    applyDetail(next: GraphicsOptions): void {
      garden.setDetail(treeDetailLevel(next));
    },
    setViewpoint(name: string | null): boolean {
      if (name !== null && !P.viewpoints[name]) return false;
      active = name;
      const vp = name ? P.viewpoints[name]! : null;
      camera.fov = vp?.fov ?? FOV;
      camera.far = vp ? DEBUG_FAR_M : FAR_M;
      camera.updateProjectionMatrix();
      if (!vp) camera.up.set(0, 1, 0);
      else placeOnViewpoint(vp);
      fog.setDebugBypass(vp?.fogBypass ?? false);
      return true;
    },
    viewpoint: () => active,
  };
}
