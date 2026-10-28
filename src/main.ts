import { createRenderer, type Backend } from './render/renderer';
import { installHooks, installI18nHooks } from './test/hooks';
import { createI18n, isLocale, loadTables } from './logic/i18n';
import { isFogQuality, type FogQuality } from './logic/fogQuality';
import type { GraphicsOptions } from './logic/presets';
import type { WebGPURenderer } from 'three/webgpu';

/** Graphics used by the fogtest scene until Task 4's presets exist. */
function fogtestOptions(params: URLSearchParams, backend: Backend): GraphicsOptions {
  const q = params.get('fog');
  // On WebGL2 the fog is always the cheapest tier.
  const fog: FogQuality = backend === 'webgl2' ? 'WebGL2Safe' : isFogQuality(q) ? q : 'High';
  const aa = params.get('aa');
  const shadows = params.get('shadows');
  const scale = Number(params.get('renderScale') ?? '1');
  return {
    renderScale: scale > 0 && scale <= 1 ? scale : 1,
    shadows: shadows === 'Off' || shadows === 'Low' || shadows === 'Medium' ? shadows : 'High',
    fog,
    ssao: params.get('ssao') !== '0',
    aa: aa === 'Off' || aa === 'FXAA' || aa === 'SMAA' ? aa : 'TAA',
    motionBlur: params.get('motionBlur') === '1',
    frameCap: 0,
  };
}

async function startFogTest(renderer: WebGPURenderer, params: URLSearchParams, backend: Backend): Promise<void> {
  const { createFogTest } = await import('./render/fogtest');
  const opts = fogtestOptions(params, backend);
  const world = await createFogTest(renderer, opts);
  let frames = 0;
  let last = 0;
  const minInterval = opts.frameCap > 0 ? 1000 / opts.frameCap : 0;

  const resize = (): void => {
    world.camera.aspect = window.innerWidth / window.innerHeight;
    world.camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);

  installHooks({
    frames: () => frames,
    fogDensity: () => world.fog.density,
    fogQuality: () => world.fog.getQuality(),
    setFogQuality: (q: FogQuality) => world.fog.setQuality(q),
    setDofFocus: (m: number | null) => world.post.setDofFocus(m),
    gpuTextures: () => renderer.info.memory.textures,
  });

  await renderer.setAnimationLoop((t: number) => {
    // Small tolerance so a 60 Hz display isn't halved by timer jitter at a 60 cap.
    if (minInterval > 0 && t - last < minInterval - 2) return;
    last = t;
    world.rig.update(world.camera.position);
    world.post.render();
    frames++;
  });
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const params = new URLSearchParams(location.search);
  const forceWebGL = params.has('forceWebGL') && params.get('forceWebGL') !== '0';
  const langParam = params.get('lang');
  const i18n = createI18n(await loadTables(), isLocale(langParam) ? langParam : 'en');
  const applyDocumentLocale = (): void => {
    document.documentElement.lang = i18n.locale();
    document.documentElement.dir = i18n.dir();
  };
  applyDocumentLocale();
  i18n.onChange(applyDocumentLocale);
  const { renderer, backend } = await createRenderer(canvas, {
    forceWebGL,
    trackTimestamp: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x8e9a86, 1);
  renderer.clear();
  window.addEventListener('resize', () => renderer.setSize(window.innerWidth, window.innerHeight, false));
  installHooks({ backend });
  installI18nHooks(i18n);

  if (params.get('scene') === 'fogtest') await startFogTest(renderer, params, backend);

  console.log(`HERO_READY backend=${backend}`);
}

boot().catch((err: unknown) => {
  console.error('HERO_BOOT_FAILED', err);
  throw err;
});
