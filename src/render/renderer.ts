import { WebGPURenderer } from 'three/webgpu';

export type Backend = 'webgpu' | 'webgl2';

export interface RendererOptions {
  forceWebGL: boolean;
  trackTimestamp: boolean;
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
  });
  await renderer.init();
  const isWebGPU = (renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend === true;
  return { renderer, backend: isWebGPU ? 'webgpu' : 'webgl2' };
}
