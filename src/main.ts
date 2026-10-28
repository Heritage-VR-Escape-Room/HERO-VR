import { createRenderer, type Backend } from './render/renderer';
import { installHooks, installI18nHooks } from './test/hooks';
import { createI18n, isLocale, loadTables } from './logic/i18n';
import { isFogQuality, type FogQuality } from './logic/fogQuality';
import type { GraphicsOptions } from './logic/presets';
import { createSettingsService } from './logic/settings';
import { localKV } from './logic/storage';
import { shouldRender } from './logic/frameCap';
import { createFixedStep } from './logic/fixedStep';
import { createGameState } from './logic/gameState';
import { isTestMode } from './test/hooks';
import type { I18n } from './logic/i18n';
import type { WebGPURenderer } from 'three/webgpu';

type SettingsService = ReturnType<typeof createSettingsService>;

const PHYSICS_HZ = 60;
const MAX_SUBSTEPS = 5;

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

/** The player's graphics settings; WebGL2 always runs the cheapest fog tier. */
function effectiveGraphics(settings: SettingsService, backend: Backend): GraphicsOptions {
  const g = settings.effectiveGraphics();
  return backend === 'webgl2' ? { ...g, fog: 'WebGL2Safe' } : g;
}

/**
 * `?scene=flat`: the game loop on a flat cobble ground. Physics steps at a
 * fixed 60 Hz; gameplay updates every tick; rendering is gated by the cap.
 */
async function startFlat(
  renderer: WebGPURenderer,
  canvas: HTMLCanvasElement,
  settings: SettingsService,
  backend: Backend,
  i18n: I18n,
  params: URLSearchParams,
): Promise<void> {
  const [
    { PhysicsWorld },
    { createFlatWorld },
    { PlayerController },
    { KeyboardInput },
    { PointerLock },
    { createPauseStub },
    { Interactor },
    { InspectView },
    { createModalSession },
    { createInventory },
    { createInteractPrompt, codeLabel },
    { initDocumentView },
  ] = await Promise.all([
      import('./world/colliders'),
      import('./world/flat'),
      import('./player/controller'),
      import('./player/input'),
      import('./player/pointerLock'),
      import('./ui/pause'),
      import('./interaction/interactor'),
      import('./interaction/inspect'),
      import('./interaction/modal'),
      import('./logic/inventory'),
      import('./ui/prompt'),
      import('./ui/documentView'),
    ]);
  const physics = await PhysicsWorld.create();
  const world = await createFlatWorld(renderer, physics, effectiveGraphics(settings, backend));
  const keyboard = new KeyboardInput(window, () => settings.get().bindings);
  const controller = new PlayerController(physics, world.camera, {
    input: () => keyboard.move(),
    look: () => settings.get(),
  });
  controller.teleport(world.spawn, world.spawnYaw);
  const state = createGameState('menu');
  const pause = createPauseStub();
  const pointerLock = new PointerLock({ canvas, state, pause, controller, clearInput: () => keyboard.clear() });

  const modal = createModalSession({ pointerLock, controller, clearInput: () => keyboard.clear() });
  const inventory = createInventory();
  const inspect = new InspectView({ renderer, camera: world.camera, post: world.post, modal, i18n, canvas });
  initDocumentView({ i18n, onOpenChange: (open) => (open ? modal.enter() : modal.exit()) });
  const interactor = new Interactor({
    physics,
    camera: world.camera,
    target: window,
    bindings: () => settings.get().bindings,
    enabled: () => state.get() === 'playing' && !modal.isActive(),
  });
  const prompt = createInteractPrompt(i18n, () => codeLabel(settings.get().bindings.interact));
  interactor.onFocusChange((i) => prompt.show(i?.promptKey ?? null));
  let testCube: import('./world/testCube').TestCube | undefined;
  if (params.get('props') === 'testcube') {
    const { createTestCube } = await import('./world/testCube');
    testCube = createTestCube(world.scene, physics, (mesh) => inspect.open(mesh));
    interactor.register(testCube.interactable);
  }

  // The post chain is built once; only the frame cap follows settings live.
  let frameCap = effectiveGraphics(settings, backend).frameCap;
  settings.onChange(() => (frameCap = effectiveGraphics(settings, backend).frameCap));

  window.addEventListener('resize', () => {
    world.camera.aspect = window.innerWidth / window.innerHeight;
    world.camera.updateProjectionMatrix();
  });

  let frames = 0;
  const steps: string[] = [];
  if (isTestMode()) controller.footsteps.onStep((s) => steps.push(s));
  installHooks({
    frames: () => frames,
    fogDensity: () => world.fog.density,
    fogQuality: () => world.fog.getQuality(),
    playerPos: () => ({ ...controller.position }),
    playerYaw: () => controller.yawDeg,
    pauseOpen: () => pause.isOpen(),
    gameState: () => state.get(),
    steps: () => [...steps],
    focusedId: () => interactor.focused()?.id ?? null,
    inspectOpen: () => inspect.isOpen(),
    inventory: () => [...inventory.items()],
    placeTestCube: (d: number) => testCube?.place(world.camera, d),
  });

  const fixed = createFixedStep(PHYSICS_HZ, MAX_SUBSTEPS);
  let lastTick: number | null = null;
  let lastRender = 0;
  await renderer.setAnimationLoop((t: number) => {
    const dt = lastTick === null ? 0 : (t - lastTick) / 1000;
    lastTick = t;
    const alpha = fixed.advance(dt, (h) => {
      controller.fixedUpdate(h);
      physics.step(h);
    });
    controller.update(dt, alpha);
    interactor.update();
    if (!shouldRender(t, lastRender, frameCap)) return;
    lastRender = t;
    world.rig.update(world.camera.position);
    world.post.render();
    inspect.render();
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

  const scene = params.get('scene');
  if (scene === 'fogtest') await startFogTest(renderer, params, backend);
  else if (scene === 'flat') await startFlat(renderer, canvas, createSettingsService(localKV()), backend, i18n, params);

  console.log(`HERO_READY backend=${backend}`);
}

boot().catch((err: unknown) => {
  console.error('HERO_BOOT_FAILED', err);
  throw err;
});
