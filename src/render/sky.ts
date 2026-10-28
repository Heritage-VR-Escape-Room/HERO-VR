/**
 * Night sky: an HDRI used as both background and environment at low intensity.
 * Placeholder: Poly Haven "Kloppenheim 07 (Pure Sky)", CC0 (see ASSET_CREDITS.md).
 * Task 11's asset manifest takes over the path later.
 */
import { EquirectangularReflectionMapping, type Scene, type Texture } from 'three/webgpu';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

export const SKY_INTENSITY = 0.25;
export const NIGHT_HDRI_URL = `${import.meta.env.BASE_URL}assets/hdri_night/kloppenheim_07_puresky_1k.hdr`;

export async function loadNightSky(scene: Scene, url: string = NIGHT_HDRI_URL): Promise<Texture> {
  const tex = await new HDRLoader().loadAsync(url);
  tex.mapping = EquirectangularReflectionMapping;
  scene.background = tex;
  scene.environment = tex;
  scene.backgroundIntensity = SKY_INTENSITY;
  scene.environmentIntensity = SKY_INTENSITY;
  return tex;
}
