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

/** Below this many textures per shader stage, shadows above 'Low' fail to compile on the terrain. */
export const SHADOW_STAGE_TEXTURES = 20;

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
): Promise<{ renderer: WebGPURenderer; backend: Backend; stageTextures: number }> {
  const renderer = new WebGPURenderer({
    canvas,
    antialias: false,
    forceWebGL: opts.forceWebGL,
    trackTimestamp: opts.trackTimestamp,
    requiredLimits: opts.forceWebGL ? {} : await stageLimits(),
  } as ConstructorParameters<typeof WebGPURenderer>[0]);
  await renderer.init();
  const be = renderer.backend as unknown as {
    isWebGPUBackend?: boolean;
    device?: { limits: { maxSampledTexturesPerShaderStage: number; maxSamplersPerShaderStage: number } };
    gl?: WebGL2RenderingContext;
  };
  const isWebGPU = be.isWebGPUBackend === true;
  // Textures one fragment shader may sample on this device (the terrain at High needs ~20).
  const stageTextures = isWebGPU
    ? Math.min(be.device?.limits.maxSampledTexturesPerShaderStage ?? 16, be.device?.limits.maxSamplersPerShaderStage ?? 16)
    : ((be.gl?.getParameter(be.gl.MAX_TEXTURE_IMAGE_UNITS) as number | undefined) ?? 16);
  return { renderer, backend: isWebGPU ? 'webgpu' : 'webgl2', stageTextures };
}
