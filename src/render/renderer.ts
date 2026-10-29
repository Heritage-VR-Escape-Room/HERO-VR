import { WebGPURenderer } from 'three/webgpu';

export type Backend = 'webgpu' | 'webgl2';

export interface RendererOptions {
  forceWebGL: boolean;
  trackTimestamp: boolean;
}

/**
 * Per-stage texture and sampler counts the plaza needs at High: the terrain's
 * ten PBR maps plus the moon's three CSM cascades and four shadowed lamps go
 * past WebGPU's default 16. Asked for only up to what the adapter offers.
 */
export const WANTED_STAGE_TEXTURES = 32;

/** Raise the per-stage texture/sampler limits as far as the adapter allows (at most WANTED_STAGE_TEXTURES). */
export async function stageLimits(): Promise<Record<string, number>> {
  const adapter = await navigator.gpu?.requestAdapter().catch(() => null);
  if (!adapter) return {};
  const pick = (n: number | undefined): number => Math.min(WANTED_STAGE_TEXTURES, n ?? 16);
  return {
    maxSampledTexturesPerShaderStage: pick(adapter.limits.maxSampledTexturesPerShaderStage),
    maxSamplersPerShaderStage: pick(adapter.limits.maxSamplersPerShaderStage),
  };
}

export async function createRenderer(
  canvas: HTMLCanvasElement,
  opts: RendererOptions,
): Promise<{ renderer: WebGPURenderer; backend: Backend }> {
  const renderer = new WebGPURenderer({
    canvas,
    antialias: false,
    forceWebGL: opts.forceWebGL,
    trackTimestamp: opts.trackTimestamp,
    requiredLimits: opts.forceWebGL ? {} : await stageLimits(),
  } as ConstructorParameters<typeof WebGPURenderer>[0]);
  await renderer.init();
  const isWebGPU = (renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend === true;
  return { renderer, backend: isWebGPU ? 'webgpu' : 'webgl2' };
}
