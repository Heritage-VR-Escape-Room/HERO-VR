import './render/fonts';
import './ui/styles.css';
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
import { createInventory, type Inventory } from './logic/inventory';
import { createSaveService } from './logic/save';
import { DialogueRunner } from './dialogue/runner';
import { StoryDirector } from './dialogue/director';
import { createSubtitles } from './ui/subtitles';
import { loadModel, setAssetRenderer } from './world/assets';
import { createFpsMeter } from './logic/fpsMeter';
import { applyGraphics } from './render/liveGraphics';
import { createSettingsScreen, type SettingsScreen } from './ui/settingsScreen';
import { createCredits } from './ui/credits';
import { codeLabel } from './ui/dom';

type SettingsService = ReturnType<typeof createSettingsService>;
type SaveService = ReturnType<typeof createSaveService>;

/** Everything that lives for the whole page, whichever scene runs. */
interface Session {
  renderer: WebGPURenderer;
  canvas: HTMLCanvasElement;
  backend: Backend;
  i18n: I18n;
  params: URLSearchParams;
  settings: SettingsService;
  save: SaveService;
  inventory: Inventory;
  director: StoryDirector;
  runner: DialogueRunner;
  settingsScreen: SettingsScreen;
  /** Rendered frames per second over the last 3 s (any scene). */
  meter: ReturnType<typeof createFpsMeter>;
}

/**
 * Back to the main menu by reloading without the scene: the game world has no
 * full teardown yet, and a reload frees everything. Test, language and
 * backend flags survive.
 */
function goToMainMenu(params: URLSearchParams): void {
  const keep = new URLSearchParams();
  for (const k of ['test', 'lang', 'forceWebGL']) {
    const v = params.get(k);
    if (v !== null) keep.set(k, v);
  }
  const q = keep.toString();
  location.assign(`${location.pathname}${q ? `?${q}` : ''}`);
}

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
async function startFlat(session: Session): Promise<void> {
  const { renderer, canvas, settings, backend, i18n, params, inventory, director, runner, meter } = session;
  const [
    { PhysicsWorld },
    { createFlatWorld },
    { PlayerController },
    { KeyboardInput },
    { PointerLock },
    { createPauseMenu },
    { Interactor },
    { InspectView },
    { createModalSession },
    { createHud },
    { initDocumentView },
    { createEndCard },
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
      import('./ui/hud'),
      import('./ui/documentView'),
      import('./ui/endCard'),
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
  const toMenu = (): void => goToMainMenu(params);
  const pause = createPauseMenu({
    i18n,
    onResume: () => pointerLock.request(),
    onSettings: () => session.settingsScreen.open(),
    onMainMenu: toMenu,
  });
  const pointerLock = new PointerLock({ canvas, state, pause, controller, clearInput: () => keyboard.clear() });
  // Dialogue timing stops with the game.
  state.onChange((s) => (s === 'paused' ? runner.pause() : runner.resume()));

  const modal = createModalSession({ pointerLock, controller, clearInput: () => keyboard.clear() });
  const inspect = new InspectView({ renderer, camera: world.camera, post: world.post, modal, i18n, canvas });
  initDocumentView({ i18n, onOpenChange: (open) => (open ? modal.enter() : modal.exit()) });
  const interactor = new Interactor({
    physics,
    camera: world.camera,
    target: window,
    bindings: () => settings.get().bindings,
    enabled: () => state.get() === 'playing' && !modal.isActive(),
  });
  const hud = createHud(i18n, () => codeLabel(settings.get().bindings.interact));
  interactor.onFocusChange((i) => hud.showPrompt(i?.promptKey ?? null));
  const endCard = createEndCard(i18n, toMenu);
  const showEndCard = (): void => {
    modal.enter();
    endCard.show();
  };
  const props = new Set((params.get('props') ?? '').split(',').filter(Boolean));
  let testCube: import('./world/testCube').TestCube | undefined;
  if (props.has('testcube')) {
    const { createTestCube } = await import('./world/testCube');
    testCube = createTestCube(world.scene, physics, (mesh) => inspect.open(mesh));
    interactor.register(testCube.interactable);
  }
  let lock: import('./puzzles/cipherLock').CipherLock | undefined;
  if (props.has('lock')) {
    const { createLockProp } = await import('./world/lockProp');
    lock = createLockProp(world.scene, physics, world.spawn, world.spawnYaw, {
      director,
      modal,
      camera: world.camera,
      canvas,
      target: window,
      bindings: () => settings.get().bindings,
      i18n,
    });
    interactor.register(lock.interactable);
  }

  // Companion Fritz: perches come from ?props=perches, otherwise he sits at a home perch.
  const [{ Fritz }, { createHintScheduler }, { LOCK_HINT_KEYS, LOCK_PUZZLE_ID }, { Vector3 }] = await Promise.all([
    import('./companion/fritz'),
    import('./logic/hints'),
    import('./puzzles/cipherLock'),
    import('three/webgpu'),
  ]);
  let clockOverride: number | null = null;
  const now = (): number => clockOverride ?? performance.now() / 1000;
  let cawCount = 0;
  const fritz = new Fritz({
    runner,
    director,
    highlight: world.highlight,
    now,
    onSound: () => cawCount++,
  });
  world.scene.add(fritz.root);
  const sx = world.spawn.x;
  const sz = world.spawn.z;
  if (props.has('perches')) {
    fritz.addPerch('p1', new Vector3(sx - 6, 1.2, sz + 2), 90);
    fritz.addPerch('p2', new Vector3(sx + 6, 1.2, sz + 2), -90);
    fritz.addPerch('p3', new Vector3(sx + 0.5, 1.5, sz + 2), 180); // 2 m dead ahead, facing the player
    fritz.place('p1');
  } else {
    fritz.addPerch('home', new Vector3(sx + 1.5, 1.6, sz + 1.5), 0);
    fritz.place('home');
  }

  // The active puzzle is the lock while the player is within 6 m of it (distance only; Task 13 replaces this stub with focus-aware logic).
  const ACTIVE_RADIUS_M = 6;
  let lockHint: import('./companion/fritz').HintablePuzzle | null = null;
  if (lock) {
    const { addDummyPlaque } = await import('./world/lockProp');
    const plaque = addDummyPlaque(lock);
    lock.parts.innerRing.name = 'ring';
    for (const f of lock.parts.tumblerFaces) f.name = 'tumbler';
    lockHint = {
      id: LOCK_PUZZLE_ID,
      hintKeys: LOCK_HINT_KEYS,
      scheduler: createHintScheduler(LOCK_HINT_KEYS.length),
      targets: [[plaque], [plaque], [lock.parts.innerRing], lock.parts.tumblerFaces],
    };
  }
  let activePuzzle: import('./companion/fritz').HintablePuzzle | null = null;
  const setActivePuzzle = (p: import('./companion/fritz').HintablePuzzle | null): void => {
    activePuzzle = p;
  };
  const requestHint = (): void => fritz.hint(activePuzzle);
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.code !== settings.get().bindings.hint || state.get() !== 'playing') return;
    requestHint();
  });

  // Graphics follow the settings live; each part rebuilds only when its own options change.
  let frameCap = effectiveGraphics(settings, backend).frameCap;
  settings.onChange(() => {
    const g = effectiveGraphics(settings, backend);
    frameCap = g.frameCap;
    applyGraphics(world, g);
  });

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
    renderFps: () => meter.fps(),
    gpuTextures: () => renderer.info.memory.textures,
    showEndCard,
    steps: () => [...steps],
    focusedId: () => interactor.focused()?.id ?? null,
    inspectOpen: () => inspect.isOpen(),
    inventory: () => [...inventory.items()],
    placeTestCube: (d: number) => testCube?.place(world.camera, d),
    lockTumblerPoints: () => lock?.tumblerScreenPoints() ?? [],
    setClock: (t: number | null) => (clockOverride = t),
    requestHint,
    fritz: {
      flyTo: (id: string) => fritz.flyTo(id),
      state: () => fritz.state,
      position: () => ({ x: fritz.position.x, y: fritz.position.y, z: fritz.position.z }),
      perch: () => fritz.currentPerch(),
      highlighted: () => fritz.highlightedObjects().map((o) => o.name),
      caws: () => cawCount,
    },
    lock: lock && {
      rotate: (n: number) => lock.rotate(n),
      setTumblers: (s: string) => lock.setTumblers(s),
      pull: () => lock.pull(),
      state: () => lock.state(),
    },
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
    lock?.update(dt);
    if (lockHint) {
      const p = lock!.parts.root.position;
      const near = Math.hypot(controller.position.x - p.x, controller.position.z - p.z) <= ACTIVE_RADIUS_M;
      if (near !== (activePuzzle === lockHint)) setActivePuzzle(near ? lockHint : null);
    }
    fritz.update(dt);
    interactor.update();
    const st = state.get();
    hud.setMode(endCard.isOpen() ? 'hidden' : st === 'playing' && !modal.isActive() ? 'playing' : st === 'menu' ? 'click-to-play' : 'hidden');
    if (!shouldRender(t, lastRender, frameCap)) return;
    lastRender = t;
    world.rig.update(world.camera.position);
    world.post.render();
    inspect.render();
    frames++;
    meter.tick(t);
  });
}

/**
 * The main menu over the orbiting backdrop. New Game and Continue tear the
 * backdrop down and start the game world (`flat` until Task 16 wires Act 0).
 */
async function startMenu(session: Session): Promise<void> {
  const { renderer, settings, backend, i18n, save, director, meter } = session;
  const [{ createMenuBackdrop }, { createMainMenu, createAutoPick }] = await Promise.all([
    import('./render/menuBackdrop'),
    import('./ui/menu'),
  ]);
  const backdrop = await createMenuBackdrop(renderer, effectiveGraphics(settings, backend));
  const { world } = backdrop;
  const autoPick = createAutoPick(settings);

  let frameCap = effectiveGraphics(settings, backend).frameCap;
  const unsubSettings = settings.onChange(() => {
    const g = effectiveGraphics(settings, backend);
    frameCap = g.frameCap;
    applyGraphics(world, g);
  });
  const resize = (): void => {
    world.camera.aspect = window.innerWidth / window.innerHeight;
    world.camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);

  let leaving = false;
  const enterGame = async (restore: boolean): Promise<void> => {
    if (leaving) return;
    leaving = true;
    menu.hide();
    await renderer.setAnimationLoop(null);
    unsubSettings();
    window.removeEventListener('resize', resize);
    backdrop.dispose();
    const data = restore ? save.load() : null;
    if (data) director.restore(data);
    await startFlat(session);
  };
  const menu = createMainMenu({
    i18n,
    save,
    settingsScreen: session.settingsScreen,
    credits: createCredits(i18n),
    onContinue: () => void enterGame(true),
    onNewGame: () => void enterGame(false),
  });
  menu.show();

  let frames = 0;
  let lastRender = 0;
  installHooks({
    frames: () => frames,
    fogQuality: () => world.fog.getQuality(),
    gpuTextures: () => renderer.info.memory.textures,
    renderFps: () => meter.fps(),
    menuOpen: () => menu.isOpen(),
  });
  await renderer.setAnimationLoop((t: number) => {
    // The first-launch benchmark measures uncapped; afterwards the cap applies.
    if (!autoPick.running() && !shouldRender(t, lastRender, frameCap)) return;
    lastRender = t;
    backdrop.render(t / 1000);
    frames++;
    meter.tick(t);
    autoPick.tick(t);
  });
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const params = new URLSearchParams(location.search);
  const forceWebGL = params.has('forceWebGL') && params.get('forceWebGL') !== '0';
  const kv = localKV();
  const settings = createSettingsService(kv);
  // ?lang= overrides the saved language for this page only.
  const langParam = params.get('lang');
  const i18n = createI18n(await loadTables(), isLocale(langParam) ? langParam : settings.get().locale);
  const applyDocumentLocale = (): void => {
    document.documentElement.lang = i18n.locale();
    document.documentElement.dir = i18n.dir();
  };
  applyDocumentLocale();
  i18n.onChange(applyDocumentLocale);
  let lastLocale = settings.get().locale;
  settings.onChange((s) => {
    if (s.locale === lastLocale) return;
    lastLocale = s.locale;
    i18n.setLocale(s.locale);
  });
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
  setAssetRenderer(renderer);
  installHooks({ loadModelInfo: async (slug) => (await import('./test/modelInfo')).describeModel(await loadModel(slug)) });

  // Dialogue and story state live for the whole session, whatever the scene.
  const save = createSaveService(kv);
  const inventory = createInventory();
  const runner = new DialogueRunner(i18n, createSubtitles(settings));
  const director = new StoryDirector({ runner, save, inventory });
  installHooks({
    fireBeat: (id: string) => director.fire(id),
    storyState: () => structuredClone(director.state()),
    dialoguePlaying: () => runner.isPlaying(),
    settings: () => structuredClone(settings.get()),
  });

  const session: Session = {
    renderer,
    canvas,
    backend,
    i18n,
    params,
    settings,
    save,
    inventory,
    director,
    runner,
    settingsScreen: createSettingsScreen({ i18n, settings, backend }),
    meter: createFpsMeter(3000),
  };

  const scene = params.get('scene');
  if (scene === 'fogtest') await startFogTest(renderer, params, backend);
  else if (scene === 'flat') await startFlat(session);
  else await startMenu(session);

  console.log(`HERO_READY backend=${backend}`);
}

boot().catch((err: unknown) => {
  console.error('HERO_BOOT_FAILED', err);
  throw err;
});
