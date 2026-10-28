import { createRenderer } from './render/renderer';
import { installHooks, installI18nHooks } from './test/hooks';
import { createI18n, isLocale, loadTables } from './logic/i18n';

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
  installHooks({ backend });
  installI18nHooks(i18n);
  console.log(`HERO_READY backend=${backend}`);
}

boot().catch((err: unknown) => {
  console.error('HERO_BOOT_FAILED', err);
  throw err;
});
