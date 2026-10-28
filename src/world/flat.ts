/**
 * `?scene=flat`: a 100 m flat cobble ground for the player controller, lit
 * and fogged like the fogtest scene (moon, sodium streetlamps, night sky,
 * volumetric fog, post chain).
 */
import {
  Color,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  type WebGPURenderer,
} from 'three/webgpu';
import { createLightingRig, LAMP_COLOR, type LightingRig } from '../render/lighting';
import { VolumetricFog } from '../render/fog';
import { buildPost, type PostChain } from '../render/post';
import { loadNightSky } from '../render/sky';
import { addStreetlampMesh, LAMP_HEAD_Y } from '../render/fogtest';
import type { GraphicsOptions } from '../logic/presets';
import type { PhysicsWorld, Vec3Like } from './colliders';

export const FLAT_SIZE_M = 100;

export interface FlatWorld {
  scene: Scene;
  camera: PerspectiveCamera;
  rig: LightingRig;
  fog: VolumetricFog;
  post: PostChain;
  spawn: Vec3Like;
  /** Spawn view bearing, degrees clockwise from north. */
  spawnYaw: number;
}

export async function createFlatWorld(
  renderer: WebGPURenderer,
  physics: PhysicsWorld,
  opts: GraphicsOptions,
): Promise<FlatWorld> {
  const scene = new Scene();
  const camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
  await loadNightSky(scene);

  const half = FLAT_SIZE_M / 2;
  const cobble = new MeshStandardMaterial({ color: new Color('#4a4d47'), roughness: 0.55, metalness: 0 });
  const ground = new Mesh(new PlaneGeometry(FLAT_SIZE_M, FLAT_SIZE_M), cobble);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  physics.addStaticBox({ x: 0, y: -0.5, z: 0 }, { x: half, y: 0.5, z: half }, 0, { surface: 'cobble' });

  // A double row of lamps running north, so walking reads against light pools in the fog.
  const metal = new MeshStandardMaterial({ color: new Color('#22251f'), roughness: 0.6, metalness: 0.8 });
  const glass = new MeshStandardMaterial({ color: 0x000000, emissive: new Color(LAMP_COLOR), emissiveIntensity: 40 });
  const rig = createLightingRig(scene, renderer, opts.shadows);
  for (let z = -30; z <= 30; z += 12) {
    for (const x of [-4, 4]) {
      addStreetlampMesh(scene, x, z, { metal, glass });
      rig.addStreetlamp(new Vector3(x, LAMP_HEAD_Y, z));
    }
  }

  const fog = new VolumetricFog(renderer, scene, camera);
  fog.setQuality(opts.fog);
  const post = buildPost(renderer, scene, camera, opts, { fog });

  return { scene, camera, rig, fog, post, spawn: { x: 0, y: 0, z: -36 }, spawnYaw: 0 };
}
