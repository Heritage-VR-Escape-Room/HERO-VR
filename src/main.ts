import { createRenderer } from './render/renderer';
import { installHooks } from './test/hooks';

async function boot(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const params = new URLSearchParams(location.search);
  const forceWebGL = params.has('forceWebGL') && params.get('forceWebGL') !== '0';
  const { renderer, backend } = await createRenderer(canvas, {
    forceWebGL,
    trackTimestamp: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x8e9a86, 1);
  renderer.clear();
  installHooks({ backend });
  console.log(`HERO_READY backend=${backend}`);
}

boot().catch((err: unknown) => {
  console.error('HERO_BOOT_FAILED', err);
  throw err;
});
