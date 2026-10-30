import './render/fonts';
import './ui/styles.css';
import { createRenderer, SHADOW_STAGE_TEXTURES, type Backend } from './render/renderer';
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
import { setTextureBudget } from './world/pbr';
import { textureResFor } from './logic/presets';
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
  location.assign(urlKeeping(params));
}

/** This page's URL with only the test, language and backend flags, plus `extra`. */
function urlKeeping(params: URLSearchParams, extra: Record<string, string> = {}): string {
  const keep = new URLSearchParams();
  for (const k of ['test', 'lang', 'forceWebGL']) {
    const v = params.get(k);
    if (v !== null) keep.set(k, v);
  }
  for (const [k, v] of Object.entries(extra)) keep.set(k, v);
  const q = keep.toString();
  return `${location.pathname}${q ? `?${q}` : ''}`;
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

/** Textures per shader stage the device allows (set at boot). */
let stageTextures = 32;

/**
 * The player's graphics settings, limited by the device: WebGL2 always runs
 * the cheapest fog tier, and devices with few textures per shader stage keep
 * shadows at Low (the terrain shader would fail to compile otherwise).
 */
function effectiveGraphics(settings: SettingsService, backend: Backend): GraphicsOptions {
  const g = settings.effectiveGraphics();
  const shadows = stageTextures < SHADOW_STAGE_TEXTURES && (g.shadows === 'Medium' || g.shadows === 'High') ? 'Low' : g.shadows;
  return { ...g, shadows, fog: backend === 'webgl2' ? 'WebGL2Safe' : g.fog };
}

type GameScene = 'flat' | 'garden';

/**
 * The game loop on a world: `?scene=flat` (a flat cobble ground) or
 * `?scene=garden` (the Schlossgarten). Physics steps at a fixed 60 Hz;
 * gameplay updates every tick; rendering is gated by the cap.
 */
async function startGame(session: Session, sceneName: GameScene, opts: { newGame?: boolean } = {}): Promise<void> {
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
  const garden =
    sceneName === 'garden'
      ? await (await import('./world/gardenWorld')).createGardenWorld(renderer, physics, effectiveGraphics(settings, backend), {
          now: () => performance.now() / 1000,
          // A bark never cuts into a story line.
          bark: () => void (runner.isPlaying() || director.say('fritz_notyet')),
        })
      : null;
  const world = garden ?? (await createFlatWorld(renderer, physics, effectiveGraphics(settings, backend)));
  // The Act 0 plaza stands on the garden's plaza disc.
  const plaza = garden
    ? await (await import('./world/plaza')).createPlaza({
        physics,
        i18n,
        rig: world.rig,
        onJammerDisabled: () => {
          director.markDisabled('jammer');
          director.autosave('jammer');
        },
      })
    : null;
  if (garden && plaza) {
    world.scene.add(plaza.root);
    for (const [name, vp] of Object.entries(plaza.viewpoints)) garden.addViewpoint(name, vp);
    world.fog.syncLights(); // the plaza's lamps join the fog (nearest ones, capped)
  }
  const keyboard = new KeyboardInput(window, () => settings.get().bindings);
  const controller = new PlayerController(physics, world.camera, {
    input: () => keyboard.move(),
    look: () => settings.get(),
  });
  if (plaza) {
    // Act 0 opens on the wake bench, looking at the pyramid.
    const { PLAZA, bearingToward } = await import('./logic/plazaLayout');
    const wake = PLAZA.viewpoints.wake!;
    const [bx, , bz] = wake.position;
    controller.teleport({ x: bx, y: garden!.groundHeight(bx, bz), z: bz }, bearingToward(wake.position, wake.target));
  } else controller.teleport(world.spawn, world.spawnYaw);
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
  let act0: import('./dialogue/act0').Act0 | null = null;
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
  const lockDeps = {
    director,
    modal,
    camera: world.camera,
    canvas,
    target: window,
    bindings: () => settings.get().bindings,
    i18n,
  };
  if (plaza) {
    const [{ CipherLock }, { createDocumentInteractable }, { createPickup }] = await Promise.all([
      import('./puzzles/cipherLock'),
      import('./interaction/documents'),
      import('./interaction/pickup'),
    ]);
    const pyr = plaza.pyramid;
    lock = new CipherLock({ ...lockDeps, parts: pyr.lockParts });
    const lockUse = lock.interactable;
    interactor.register({ ...lockUse, interact: () => (act0?.lockUsed(), lockUse.interact()) });
    interactor.register({
      id: 'plaque',
      promptKey: 'prompt.inspect',
      object: pyr.plaque,
      canInteract: () => true,
      // After Fritz has translated the Latin, the inspect view shows its meaning.
      interact: () => (
        act0?.plaqueInspected(),
        inspect.open(pyr.plaque, {
          textKey: director.state().firedBeats.includes('b5_latin_translation') ? 'plaque.latin_meaning' : undefined,
        })),
    });
    interactor.register(pyr.jammer.interactable);
    director.registerDisableable('jammer', () => pyr.jammer.disable(true));
    const manifesto = createDocumentInteractable({ id: 'manifesto', docKey: 'vanguard_manifesto', object: pyr.manifesto });
    interactor.register({ ...manifesto, interact: () => (act0?.manifestoRead(), manifesto.interact()) });
    const part = createPickup({
      id: 'ticket_printer_part',
      itemId: 'ticket_printer_part',
      object: pyr.ticketPart,
      inventory,
      onPicked: (id) => {
        director.markDisabled(id);
        director.autosave(id);
      },
    });
    interactor.register(part);
    director.registerDisableable(part.id, part.markPicked);
  } else if (props.has('lock')) {
    const { createLockProp } = await import('./world/lockProp');
    lock = createLockProp(world.scene, physics, world.spawn, world.spawnYaw, lockDeps);
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
  if (plaza) {
    await plaza.attachFritz(fritz);
    fritz.place(director.state().firedBeats.includes('b4_fritz_arrives') ? 'pyramid_tip' : 'lamp_3');
    const [{ createAct0 }, { PLAZA }] = await Promise.all([import('./dialogue/act0'), import('./logic/plazaLayout')]);
    const [kx, , kz] = PLAZA.kiosk.position;
    act0 = createAct0({
      director,
      flyFritzTo: (id) => void fritz.flyTo(id),
      showEndCard,
      kiosk: { x: kx, z: kz },
    });
  } else if (props.has('perches')) {
    fritz.addPerch('p1', new Vector3(sx - 6, 1.2, sz + 2), 90);
    fritz.addPerch('p2', new Vector3(sx + 6, 1.2, sz + 2), -90);
    fritz.addPerch('p3', new Vector3(sx + 0.5, 1.5, sz + 2), 180); // 2 m dead ahead, facing the player
    fritz.place('p1');
  } else {
    fritz.addPerch('home', new Vector3(sx + 1.5, 1.6, sz + 1.5), 0);
    fritz.place('home');
  }

  // The active puzzle is the lock while the player is within 6 m of its door or focused on it.
  const { lockIsActive } = await import('./logic/plazaLayout');
  let lockHint: import('./companion/fritz').HintablePuzzle | null = null;
  if (lock) {
    const plaque = plaza ? plaza.pyramid.plaque : (await import('./world/lockProp')).addDummyPlaque(lock);
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
    garden?.applyDetail(g);
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
    renderInfo: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries }),
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
      perches: () => fritz.perchIds(),
    },
    jammer: plaza ? {
      state: () => plaza.pyramid.jammer.state(),
      disable: () => plaza.pyramid.jammer.interactable.interact(),
    } : undefined,
    plaqueLocale: () => plaza?.pyramid.plaqueText.drawnLocale() ?? null,
    activePuzzle: () => activePuzzle?.id ?? null,
    fogLightCount: () => world.fog.scatteringLights().length,
    teleport: (x: number, z: number, yaw: number, pitch = 0) => controller.teleport({ x, y: garden?.groundHeight(x, z) ?? 0, z }, yaw, pitch),
    viewpoint: (name: string | null) => garden?.setViewpoint(name) ?? false,
    lookFrom: (position: [number, number, number], target: [number, number, number], fov = 40) => {
      garden?.addViewpoint('debug', { position, lookAt: target, up: [0, 1, 0], fov, fogBypass: false });
      return garden?.setViewpoint('debug') ?? false;
    },
    cameraPose: () => {
      const dir = world.camera.getWorldDirection(new Vector3());
      const p = world.camera.position;
      return { x: p.x, y: p.y, z: p.z, lookX: dir.x, lookY: dir.y, lookZ: dir.z };
    },
    fogDebugBypass: () => world.fog.debugBypass(),
    treeStats: () => garden?.garden.stats() ?? null,
    lock: lock && {
      rotate: (n: number) => lock.rotate(n),
      setTumblers: (s: string) => lock.setTumblers(s),
      pull: () => lock.pull(),
      state: () => lock.state(),
    },
  });

  if (act0 && opts.newGame) {
    // Wake up: fade in from black, then Julian's first line.
    const black = document.createElement('div');
    black.style.cssText = 'position:fixed;inset:0;background:#000;pointer-events:none;z-index:50;transition:opacity 3s ease-in';
    document.body.append(black);
    requestAnimationFrame(() => requestAnimationFrame(() => (black.style.opacity = '0')));
    black.addEventListener('transitionend', () => black.remove());
  }
  act0?.start(opts.newGame ?? false);

  // First launch: measure this machine in the game itself and pick a preset.
  const autoPick = (await import('./ui/menu')).createAutoPick(settings);

  const fixed = createFixedStep(PHYSICS_HZ, MAX_SUBSTEPS);
  let lastTick: number | null = null;
  let lastRender = 0;
  await renderer.setAnimationLoop((t: number) => {
    const dt = lastTick === null ? 0 : (t - lastTick) / 1000;
    lastTick = t;
    const alpha = fixed.advance(dt, (h) => {
      controller.fixedUpdate(h);
      physics.step(h);
      const back = garden?.boundary.check(controller.position);
      if (back) controller.teleport({ ...back, y: garden!.groundHeight(back.x, back.z) }, controller.yawDeg, controller.pitchDeg);
    });
    controller.update(dt, alpha);
    garden?.update(); // debug viewpoint override and tree LOD, every tick so a capped frame never shows the player camera
    lock?.update(dt);
    if (lockHint) {
      const door = plaza ? plaza.pyramid.doorCenter : lock!.parts.root.position;
      const active = lockIsActive(controller.position, door, lock!.state().focused);
      if (active !== (activePuzzle === lockHint)) setActivePuzzle(active ? lockHint : null);
    }
    plaza?.update(dt, world.camera.position);
    act0?.update(controller.position, lock?.state().solved ?? false);
    fritz.update(dt);
    interactor.update();
    const st = state.get();
    hud.setMode(endCard.isOpen() ? 'hidden' : st === 'playing' && !modal.isActive() ? 'playing' : st === 'menu' ? 'click-to-play' : 'hidden');
    // The first-launch benchmark measures uncapped; afterwards the cap applies.
    if (!autoPick.running() && !shouldRender(t, lastRender, frameCap)) return;
    lastRender = t;
    world.rig.update(world.camera.position);
    world.post.render();
    inspect.render();
    frames++;
    meter.tick(t);
    autoPick.tick(t);
  });
}

/**
 * The main menu over the orbiting backdrop. New Game and Continue tear the
 * backdrop down and start the game world (`flat` until Task 16 wires Act 0).
 */
async function startMenu(session: Session): Promise<void> {
  const { renderer, canvas, i18n, save } = session;
  const { createMainMenu } = await import('./ui/menu');
  // The menu background is a still of the plaza (menu-backdrop.webp, drifting
  // in CSS): the menu builds no 3D world, so it is light on any GPU and the
  // game loads its world once. The graphics auto-pick runs in the game.
  canvas.style.visibility = 'hidden';
  document.body.classList.add('menu-still');
  let leaving = false;
  const enterGame = (restore: boolean): void => {
    if (leaving) return;
    leaving = true;
    menu.hide();
    location.assign(urlKeeping(session.params, { play: restore ? 'continue' : 'new' }));
  };
  const menu = createMainMenu({
    i18n,
    save,
    settingsScreen: session.settingsScreen,
    credits: createCredits(i18n),
    onContinue: () => enterGame(true),
    onNewGame: () => enterGame(false),
  });
  menu.show();

  let frames = 0;
  installHooks({
    frames: () => frames,
    gpuTextures: () => renderer.info.memory.textures,
    menuOpen: () => menu.isOpen(),
  });
  const tick = (): void => {
    frames++;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
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
  const created = await createRenderer(canvas, {
    forceWebGL,
    trackTimestamp: false,
  });
  const { renderer, backend } = created;
  stageTextures = created.stageTextures;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x8e9a86, 1);
  renderer.clear();
  window.addEventListener('resize', () => renderer.setSize(window.innerWidth, window.innerHeight, false));
  installHooks({ backend, stageTextures: () => stageTextures });
  installI18nHooks(i18n);
  setAssetRenderer(renderer);
  setTextureBudget(textureResFor(settings.get().preset));
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
  const play = params.get('play');
  if (play === 'new' || play === 'continue') {
    // A reload mid-game goes back to the main menu.
    history.replaceState(null, '', urlKeeping(params));
    const data = play === 'continue' ? save.load() : null;
    if (data) director.restore(data);
    await startGame(session, 'garden', { newGame: !data });
  } else if (scene === 'fogtest') await startFogTest(renderer, params, backend);
  else if (scene === 'flat' || scene === 'garden') await startGame(session, scene);
  else await startMenu(session);

  console.log(`HERO_READY backend=${backend}`);
}

boot().catch((err: unknown) => {
  console.error('HERO_BOOT_FAILED', err);
  throw err;
});
