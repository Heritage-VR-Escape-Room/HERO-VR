/**
 * Model loader: GLB files under public/assets/<slug>/<slug>.glb (made by tools/assets/optimize.mjs).
 * Meshopt-compressed geometry (MeshoptDecoder) and KTX2 textures (transcoder in public/basis/) are both supported;
 * models without KTX2 textures never need `setAssetRenderer`.
 */
import type { WebGPURenderer } from 'three/webgpu';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export type { GLTF };

const BASE = import.meta.env.BASE_URL;

export function modelUrl(slug: string, base: string = BASE): string {
  return `${base}assets/${slug}/${slug}.glb`;
}

let ktx2: KTX2Loader | undefined;
let loader: GLTFLoader | undefined;
const cache = new Map<string, Promise<GLTF>>();

/** Give the loader the renderer so KTX2 textures transcode to a format the GPU supports. Call once after renderer init. */
export function setAssetRenderer(renderer: WebGPURenderer): void {
  ktx2 ??= new KTX2Loader().setTranscoderPath(`${BASE}basis/`);
  ktx2.detectSupport(renderer);
  loader = undefined; // rebuilt with the KTX2 loader attached
}

function getLoader(): GLTFLoader {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    if (ktx2) loader.setKTX2Loader(ktx2);
  }
  return loader;
}

/** Load (and cache) a model by slug. The same GLTF object is returned on repeat calls: clone `scene` to place copies. */
export function loadModel(slug: string): Promise<GLTF> {
  let p = cache.get(slug);
  if (!p) {
    p = getLoader().loadAsync(modelUrl(slug));
    p.catch(() => cache.delete(slug)); // allow a retry after a failed fetch
    cache.set(slug, p);
  }
  return p;
}

export function clearModelCache(): void {
  cache.clear();
}
