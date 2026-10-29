/**
 * Poly Haven style PBR texture sets under public/assets/<slug>/ (diffuse,
 * normal, and ARM = ambient occlusion / roughness / metalness), loaded once
 * per slug and set to repeat.
 */
import { NoColorSpace, RepeatWrapping, SRGBColorSpace, TextureLoader, type Texture } from 'three/webgpu';

export interface PbrSet {
  diff: Texture;
  nor: Texture;
  arm: Texture;
}

const BASE = import.meta.env.BASE_URL;
const cache = new Map<string, Promise<PbrSet>>();

/** `res` is the file suffix, e.g. '2k' for diff_2k.webp. */
export function loadPbrSet(slug: string, res: '2k' | '4k'): Promise<PbrSet> {
  const key = `${slug}/${res}`;
  let p = cache.get(key);
  if (!p) {
    const loader = new TextureLoader();
    const load = async (name: string, srgb: boolean): Promise<Texture> => {
      const t = await loader.loadAsync(`${BASE}assets/${slug}/${name}_${res}.webp`);
      t.wrapS = t.wrapT = RepeatWrapping;
      t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
      t.anisotropy = 8;
      return t;
    };
    p = Promise.all([load('diff', true), load('nor', false), load('arm', false)]).then(([diff, nor, arm]) => ({ diff, nor, arm }));
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}
