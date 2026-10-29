/**
 * Applies graphics options to a running world. Each part changes only when
 * an option it depends on changed: fog tier (uniforms), shadow quality (rig
 * rebuilds the moon; the fog then re-collects its lights), and the post
 * chain (rebuilt only on render scale / AA / SSAO / motion blur changes).
 */
import type { GraphicsOptions } from '../logic/presets';
import type { VolumetricFog } from './fog';
import type { LightingRig } from './lighting';
import type { PostChain } from './post';

export interface GraphicsTarget {
  post: Pick<PostChain, 'setOptions'>;
  fog: Pick<VolumetricFog, 'getQuality' | 'setQuality' | 'syncLights'>;
  rig: Pick<LightingRig, 'setQuality'>;
}

export function applyGraphics(world: GraphicsTarget, opts: GraphicsOptions): void {
  if (world.fog.getQuality() !== opts.fog) world.fog.setQuality(opts.fog);
  if (world.rig.setQuality(opts.shadows)) world.fog.syncLights();
  world.post.setOptions(opts);
}
