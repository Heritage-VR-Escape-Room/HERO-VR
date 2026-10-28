/**
 * `?scene=fogtest`: the render-core proving ground. A 60 m ground plane,
 * four streetlamps on a 10 m square, the moon, the night sky, the volumetric
 * fog and the full post chain. A plaque-sized block carries the highlight.
 */
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  Vector3,
  type WebGPURenderer,
} from 'three/webgpu';
import { createLightingRig, LAMP_COLOR, type LightingRig, type RigQuality } from './lighting';
import { VolumetricFog } from './fog';
import { Highlight } from './highlight';
import { buildPost, type PostChain } from './post';
import { loadNightSky } from './sky';
import type { GraphicsOptions } from '../logic/presets';

export interface FogTestWorld {
  scene: Scene;
  camera: PerspectiveCamera;
  rig: LightingRig;
  fog: VolumetricFog;
  highlight: Highlight;
  post: PostChain;
}

export const LAMP_HEAD_Y = 4.2;

function rigQuality(opts: GraphicsOptions): RigQuality {
  return opts.shadows;
}

export function addStreetlampMesh(scene: Scene, x: number, z: number, mats: { metal: MeshStandardMaterial; glass: MeshStandardMaterial }): void {
  const pole = new Mesh(new CylinderGeometry(0.06, 0.09, LAMP_HEAD_Y, 10), mats.metal);
  pole.position.set(x, LAMP_HEAD_Y / 2, z);
  const cap = new Mesh(new CylinderGeometry(0.08, 0.28, 0.22, 12), mats.metal);
  cap.position.set(x, LAMP_HEAD_Y + 0.2, z);
  const glass = new Mesh(new SphereGeometry(0.12, 16, 8), mats.glass);
  glass.position.set(x, LAMP_HEAD_Y, z);
  // The lamp sits inside its own pole and cap, so they must not shadow its light.
  for (const m of [pole, cap]) m.receiveShadow = true;
  scene.add(pole, cap, glass);
}

export async function createFogTest(
  renderer: WebGPURenderer,
  opts: GraphicsOptions,
): Promise<FogTestWorld> {
  const scene = new Scene();
  const camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.set(1.5, 1.7, 15);
  camera.lookAt(0, 2.4, 0);

  await loadNightSky(scene);

  const stone = new MeshStandardMaterial({ color: new Color('#4a4d47'), roughness: 0.45, metalness: 0 });
  const ground = new Mesh(new PlaneGeometry(60, 60), stone);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const metal = new MeshStandardMaterial({ color: new Color('#22251f'), roughness: 0.6, metalness: 0.8 });
  const glass = new MeshStandardMaterial({ color: 0x000000, emissive: new Color(LAMP_COLOR), emissiveIntensity: 40 });
  const rig = createLightingRig(scene, renderer, rigQuality(opts));
  for (const [x, z] of [
    [-5, -5],
    [5, -5],
    [-5, 5],
    [5, 5],
  ] as const) {
    addStreetlampMesh(scene, x, z, { metal, glass });
    rig.addStreetlamp(new Vector3(x, LAMP_HEAD_Y, z));
  }

  // Blocks that occlude the lamps, so cones and shadows read in the fog.
  const block = new MeshStandardMaterial({ color: new Color('#6b6a60'), roughness: 0.8 });
  const pillars: [number, number, number, number][] = [
    [0, 0, 1.2, 3.2],
    [-3.2, 2.5, 0.6, 2.2],
    [3.4, -2, 0.7, 1.6],
    [9, -9, 2, 6],
    [-10, -7, 1.5, 4],
  ];
  for (const [x, z, w, h] of pillars) {
    const m = new Mesh(new BoxGeometry(w, h, w), block);
    m.position.set(x, h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }
  const plaque = new Mesh(new BoxGeometry(0.9, 0.6, 0.06), new MeshStandardMaterial({ color: new Color('#5a4630'), roughness: 0.4, metalness: 0.7 }));
  plaque.position.set(0, 1.5, 0.63);
  plaque.castShadow = true;
  scene.add(plaque);

  const fog = new VolumetricFog(renderer, scene, camera);
  fog.setQuality(opts.fog);
  const highlight = new Highlight(scene, camera);
  highlight.setHighlighted([plaque]);
  const post = buildPost(renderer, scene, camera, opts, { fog, highlight });

  return { scene, camera, rig, fog, highlight, post };
}
