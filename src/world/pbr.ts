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

export type TexRes = '1k' | '2k' | '4k';

const BASE = import.meta.env.BASE_URL;
const cache = new Map<string, Promise<PbrSet>>();
const ORDER: readonly TexRes[] = ['1k', '2k', '4k'];

/**
 * Largest texture resolution the graphics preset allows. A decoded 4k set
 * takes ~250 MB of video memory, which integrated GPUs don't have. Takes
 * effect for sets loaded afterwards (a preset change applies on the next load).
 */
let budget: TexRes = '2k';
export function setTextureBudget(r: TexRes): void {
  budget = r;
}

/** `res` is the file suffix wanted, e.g. '2k' for diff_2k.webp, capped by the budget. */
export function loadPbrSet(slug: string, wanted: Exclude<TexRes, '1k'>): Promise<PbrSet> {
  const res = ORDER[Math.min(ORDER.indexOf(wanted), ORDER.indexOf(budget))]!;
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
