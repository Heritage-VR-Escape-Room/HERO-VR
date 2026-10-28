# Shadows of the Mist: Act 0 Vertical Slice Implementation Plan (Pure Web)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable, portfolio-grade browser game slice of Act 0. The player wakes in the foggy Schlossgarten, solves the KARL cipher-disc lock with Fritz's help, and reaches the end-of-slice card. All core systems (settings, save, EN/AR/DE localization, menus) are built so later acts can reuse them.

**Architecture:**
- **Pure logic modules** (cipher, hints, save, settings, story state, layout math) have no Three.js imports and are unit-tested with Vitest.
- **Render and gameplay modules** wrap Three.js `WebGPURenderer` (TSL node materials and post-processing), Rapier physics and the DOM.
- **UI** is plain HTML/CSS over the canvas, so the browser handles Arabic shaping and RTL natively.
- **World content** comes from placement JSON plus GLB assets at real-world scale. Origin is the Schloss tower base, +Z is north.
- **End-to-end checks** run in headed Chrome through Playwright, using a `window.__hero` test API that exists only with `?test=1`.

**Tech Stack:**
- TypeScript 7.0, Vite 8.3, three 0.186.1 (`three/webgpu`, `three/tsl`, addons)
- Libraries: `@dimforge/rapier3d-compat` 0.21, `@gltf-transform/cli` 4.5 (meshopt + KTX2)
- Testing: Vitest 5.0, `@playwright/test` 1.64
- Fonts: `@fontsource` packages (OFL)
- Asset tooling: Python 3.11 (fetch and credits); portable Blender 4.5 at `.local/bin/HERO-VR-scans/tools/blender-4.5.14-windows-x64` (scale and pivot fixes, optional AO bakes)

**Spec:** `docs/specs/2026-10-28-act0-vertical-slice-design.md`. Read it fully before any task. §7 holds the beats, dialogue, the cipher and the hint lines; §9 holds the graphics direction.

## Global Constraints

- **Project:** root is `C:\Users\Work\.local\bin\shadows-of-the-mist`. It's a new local git repo with **no remote**: never add a remote, never push.
- **Commits:** never add Claude co-author trailers or "Generated with Claude Code".
- **Platform:** desktop browsers only, keyboard and mouse only. No VR, no gamepad, no mobile.
- **Rendering:** `WebGPURenderer` with WebGPU primary and its automatic WebGL2 fallback. On WebGL2, fog is forced to tier `WebGL2Safe`.
- **Languages:** `en`, `ar`, `de`. Arabic is shaped and right-to-left everywhere text appears, including the in-world plaque and documents.
- **Assets:**
  - Free only. Allowed licenses are **CC0**, **CC-BY** and **OFL** (fonts). NC and ND are rejected.
  - Every third-party asset is listed in `ASSET_CREDITS.md` and the in-game credits.
  - **No team scans** from `HERO-VR-scans`.
- **Sketchfab token:** read from the file `C:\Users\Work\Desktop\API.txt`, whose path is given by the env var `SOM_SKETCHFAB_TOKEN_FILE`. Never print, log, bundle or commit it.
- **Saving:** autosave after every puzzle.
- **Frame-rate cap:** a 30 / 60 / unlimited setting.
- **Performance targets:**
  - High: 60 fps at 1080p on the RTX 2070 Max-Q dev laptop.
  - Low: a steady 30 fps on integrated GPUs (hard requirement).
- **Fog:** volumetric, tint `#8E9A86`. It **never thins** in the slice; no code path lowers its density at runtime.
- **World frame:** 1 unit = 1 m, origin = Schloss tower base, +Z = north.
  - Radial axis `i` (0..31) sits at bearing `i * 11.25°` clockwise from north.
  - Garden radius **450 m**. Plaza center **(0, 0, −170)** on axis 16.
- **Commands** (from the project root):
  - `npm test` (Vitest, single run)
  - `npm run e2e` (Playwright)
  - `npm run build`, then `npm run preview` (port 4173)
  - `npm run dev` (port 5173)

## Review Focus

1. **Corrupt, old or blocked storage.** Covers malformed JSON, an older `version`, and `localStorage` throwing (private mode or blocked site data). The game boots with defaults, "Continue" is hidden, and it never hangs on loading. → Task 4 tests.
2. **The browser releases pointer lock** (Esc, alt-tab, a click outside). The game opens the pause menu and freezes look and move input. No spinning camera, no dead input after resume. → Task 5 e2e test.
3. **Language switch while text is on screen** (a subtitle, an open document, a hint, the plaque texture). Everything re-resolves, and `dir` flips on the root and on every in-world canvas text. → Task 2 and Task 7 tests.
4. **Continue after an autosave between beats.** Example: saved right after the lock opened, before the jammer was disabled. On reload the door is open, the jammer is still on, no item is duplicated, and played beats don't replay. → Task 16 e2e test.
5. **No WebGPU.** The build boots on the WebGL2 backend with fog `WebGL2Safe` and no errors. Test with Chrome launched with `--disable-features=WebGPU` plus a `?forceWebGL=1` override. → Task 1 e2e test.

---

## File Map

```
shadows-of-the-mist/
  index.html                 canvas + #ui root (lang/dir set at runtime)
  package.json, tsconfig.json, vite.config.ts, playwright.config.ts, vitest.config.ts
  src/
    main.ts                  boot: storage → settings → i18n → renderer → menu
    logic/                   PURE, unit-tested, no three imports
      cipher.ts  hints.ts  inventory.ts  story.ts  save.ts  settings.ts  presets.ts
      fogQuality.ts  autoPicker.ts  bindings.ts  frameCap.ts  subtitleTiming.ts
      worldLayout.ts  storage.ts  i18n.ts  footstepPicker.ts
    render/    renderer.ts  post.ts  fog.ts  lighting.ts  highlight.ts  sky.ts  canvasText.ts
    world/     assets.ts  terrain.ts  garden.ts  schloss.ts  plaza.ts  colliders.ts
               placements/plaza.json  placements/garden.json
    player/    controller.ts  pointerLock.ts  footsteps.ts
    interaction/ interactor.ts  inspect.ts  documents.ts  pickup.ts
    dialogue/  runner.ts  director.ts  beats.ts
    puzzles/   cipherLock.ts
    companion/ fritz.ts
    ui/        menu.ts  pause.ts  settingsScreen.ts  hud.ts  subtitles.ts  documentView.ts
               credits.ts  endCard.ts  styles.css
    audio/     mixer.ts  ambience.ts
    test/      hooks.ts (window.__hero, only with ?test=1)  bench.ts
  public/
    locales/en.json  ar.json  de.json
    assets/<slug>/...        optimized GLB / KTX2 / audio (fetched, credited)
    credits.json
  tools/assets/  fetch_assets.py  manifest.json  optimize.mjs  make_credits.py  blender/fix_transform.py
  tests/unit/*.test.ts   tests/e2e/*.spec.ts
  ASSET_CREDITS.md
  docs/specs/  docs/plans/
```

---

### Task 1: Scaffold, renderer boot, test harnesses

**Files:**
- Create: `package.json`. Dependencies: `three@0.186.1`, `@dimforge/rapier3d-compat@0.21.0`. Dev dependencies: `@types/three@0.186.0`, `vite@8.3.5`, `typescript@7.0.2`, `vitest@5.0.5`, `@playwright/test@1.64.1`, `@gltf-transform/cli@4.5.1`.
  - Scripts: `dev`, `build` (`tsc --noEmit && vite build`), `preview`, `test` (`vitest run`), `e2e` (`playwright test`).
- Create: `tsconfig.json` (strict), `vite.config.ts` (`build.target: 'es2022'`, no inline assets above 4 KB), `vitest.config.ts` (`tests/unit`, env `node`), `playwright.config.ts`.
  - Playwright: Chrome channel, **headed**, viewport 1920×1080, `webServer` = `npm run preview` on port 4173, and a second project `no-webgpu` with launch arg `--disable-features=WebGPU`.
- Create: `.gitignore` (`node_modules/`, `dist/`, `test-results/`, `tools/assets/.cache/`, `*.token`).
- Create: `src/render/renderer.ts`
  - `async function createRenderer(canvas: HTMLCanvasElement, opts: { forceWebGL: boolean; trackTimestamp: boolean }): Promise<{ renderer: WebGPURenderer; backend: 'webgpu' | 'webgl2' }>`
  - Uses `new WebGPURenderer({ canvas, antialias: false, forceWebGL, trackTimestamp })` then `await renderer.init()`. Detects the backend via `renderer.backend.isWebGPUBackend`.
- Create: `src/main.ts`. Boots the renderer, draws a cleared frame, and logs exactly `HERO_READY backend=<webgpu|webgl2>`.
- Create: `tests/unit/harness.test.ts` (`expect(2 + 2).toBe(4)`) and `tests/e2e/boot.spec.ts`.

- [ ] **Step 1:** `git init`, `npm install`, then commit the docs folder (spec + plan) as the first commit.
- [ ] **Step 2:** Write `boot.spec.ts`:
  - `boots on WebGPU`: open `/`, wait for a console line matching `HERO_READY backend=webgpu`, and assert no `pageerror`. Default project.
  - `falls back to WebGL2`: open `/?forceWebGL=1` and expect `backend=webgl2`. Runs in both projects. The `no-webgpu` project also loads `/` and expects `backend=webgl2` (Review Focus 5).
- [ ] **Step 3:** Run `npm test` and `npm run build && npm run e2e`. Expected: e2e FAILS before `main.ts` logs the line; the unit test passes.
- [ ] **Step 4:** Implement `renderer.ts` and `main.ts`. Run again. Expected: all PASS.
- [ ] **Step 5:** Commit `chore: scaffold, WebGPU renderer boot, unit + e2e harness`.

### Task 2: i18n, RTL and in-world canvas text

**Files:**
- Create: `src/logic/i18n.ts`
  - `type Locale = 'en' | 'ar' | 'de'`
  - `createI18n(tables: Record<Locale, Record<string,string>>, initial: Locale)` returns `{ t(key: string, vars?: Record<string,string|number>): string; locale(): Locale; setLocale(l: Locale): void; onChange(cb: (l: Locale) => void): () => void; dir(): 'rtl' | 'ltr' }`.
  - A missing key returns `'#' + key`. `{name}` placeholders are interpolated.
- Create: `public/locales/en.json`, `ar.json`, `de.json`. Flat keys with namespaces `ui.*`, `dlg.*`, `doc.*`, `hint.*`, `spk.*`, `item.*`. Seed `ui.menu.continue` (Continue / متابعة / Fortsetzen) and `ui.menu.new` (New Game / لعبة جديدة / Neues Spiel).
- Create: `src/render/canvasText.ts`
  - `function drawText(ctx: CanvasRenderingContext2D, text: string, opts: { dir: 'rtl'|'ltr'; font: string; color: string; maxWidth: number; lineHeight: number; align: 'start'|'center' }): void`
  - Word-wraps and sets `ctx.direction`.
  - `class LocalizedCanvasTexture` (wraps `THREE.CanvasTexture`) redraws on `i18n.onChange`.
- Fonts: `@fontsource/noto-sans`, `@fontsource/noto-naskh-arabic`, `@fontsource/im-fell-english`, `@fontsource/amiri`. Canvas drawing waits for `document.fonts.load(...)` before the first draw.
- Test: `tests/unit/i18n.test.ts`, `tests/e2e/rtl.spec.ts`

- [ ] **Step 1:** Write the unit tests:
  - `missing key returns #key`
  - `interpolates {year}`: `t('x', { year: 1715 })` → `'Founded 1715'`
  - `setLocale fires onChange once and switches text`: after `setLocale('de')`, `t('ui.menu.continue') === 'Fortsetzen'`
  - `dir is rtl only for ar`
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement. `main.ts` sets `document.documentElement.lang` and `.dir` on every change.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Write `rtl.spec.ts`. With `?test=1&lang=ar`:
  - assert `document.documentElement.dir === 'rtl'`
  - call `__hero.debugCanvasText('ui.menu.new')`, which draws onto a visible debug canvas
  - screenshot to `test-results/rtl-canvas.png`
  - switch to `de` via `__hero.setLocale('de')` and assert `dir === 'ltr'` (Review Focus 3)
- [ ] **Step 6:** Run e2e. Expected: PASS. Open the screenshot and check the Arabic is joined and right-aligned.
- [ ] **Step 7:** Commit `feat: i18n EN/AR/DE with RTL DOM and canvas text`.

### Task 3: Render core (volumetric fog, lighting rig, post chain, highlight)

This is risk-first: it proves the look on both backends before any content exists.

**Files:**
- Create: `src/logic/fogQuality.ts`
  - `type FogQuality = 'WebGL2Safe' | 'Low' | 'Medium' | 'High' | 'Ultra'`
  - `fogParams(q): { resolutionScale: number; steps: number; temporal: boolean }`, with pinned values:

    | Quality | resolutionScale | steps | temporal |
    |---|---|---|---|
    | WebGL2Safe | 0.25 | 12 | false |
    | Low | 0.33 | 16 | true |
    | Medium | 0.5 | 24 | true |
    | High | 0.5 | 48 | true |
    | Ultra | 1.0 | 64 | true |

- Create: `src/render/fog.ts`
  - `class VolumetricFog { constructor(renderer, scene, camera); setQuality(q: FogQuality): void; readonly density: number; }`
  - Built on three's `VolumeNodeMaterial` (as in three's `webgpu_volume_lighting` example) on a camera-following box volume covering the play area.
  - It scatters the moonlight plus all lamp lights, with 3D-noise density drifting at 0.15 m/s and a height falloff (densest below 6 m).
  - Rendered at `resolutionScale` and composited with a depth-aware upsample (`depthAwareBlend`/bilateral), plus temporal accumulation when `temporal`.
  - **No setter for density.**
- Create: `src/render/lighting.ts`
  - `createLightingRig(scene, renderer, quality)`.
  - Moon: `DirectionalLight` color `#9DB3D6`, intensity 0.15, direction from azimuth 200° and elevation 35°. Shadows use `CSMShadowNode` with 3 cascades on High/Ultra, a single 2048 map on Medium, a single 1024 map on Low.
  - Lamps: `ClusteredLighting` (three addon) for many point/spot lights. Streetlamp = a downward `SpotLight` (2200 K ≈ `#FFB65C`, 1200 lm, range 9 m, angle 55°) plus a small `PointLight` halo (range 3 m).
  - `setLampShadows(n: number)`: shadows only on the n lamps nearest the pyramid. Low = 0, Medium = 2, High/Ultra = 4.
- Create: `src/render/post.ts`
  - `buildPost(renderer, scene, camera, opts: GraphicsOptions): { render(): void; dispose(): void; setDofFocus(m: number | null): void }`
  - Chain, all from `three/addons/tsl/display`: scene pass (MRT color + normal + velocity) → GTAO (if `ssao`) → fog composite → Bloom (threshold 1.0, strength 0.6, radius 0.75) → AA (`FXAANode` / `SMAANode` / `TRAANode` per `aa`) → MotionBlur (if `motionBlur`) → color grade via `Lut3DNode` or a TSL lift/gain (shadows toward `#33445E`, highlights toward `#FFB65C`) → ACES tonemap → vignette 0.28 → film grain 0.15 → optional DOF.
  - `renderScale` below 1 renders at reduced resolution and upscales with `FSR1Node`.
- Create: `src/render/highlight.ts`. Wraps `OutlineNode` (copper `#D98A3D`, pulse 1.2 Hz): `setHighlighted(objects: Object3D[]): void`.
- Create: `src/render/sky.ts`. Night HDRI as background and environment, intensity 0.25. This uses a Poly Haven CC0 placeholder fetched ad hoc into `public/assets/hdri_night/` and credited, until Task 11's manifest takes over.
- Test: `tests/unit/fogQuality.test.ts`, `tests/e2e/render.spec.ts`

- [ ] **Step 1:** Write the unit test `fog table matches spec`, asserting all five rows exactly.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `fogQuality.ts`, then `fog.ts`, `lighting.ts`, `post.ts`, `highlight.ts` and `sky.ts`. Add a `?test=1&scene=fogtest` scene: a 60 m ground plane, 4 streetlamps on a 10 m square, the moon and the full post chain.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Write `render.spec.ts`:
  - On both projects, load `fogtest` at each fog quality.
  - Wait for `__hero.frames() > 60` and screenshot to `test-results/fog-<backend>-<q>.png`.
  - Assert no `pageerror`, and that `__hero.fogDensity()` is unchanged after 10 s.
- [ ] **Step 6:** Run e2e and look at the screenshots.
  - WebGPU must show visible light halos and shafts around each lamp, grey-green and drifting.
  - WebGL2Safe must show reduced but present fog.
  - If `VolumeNodeMaterial` can't hit this look, replace it with a custom TSL raymarch pass inside `fog.ts` (same interface) and record that in the Notes section.
- [ ] **Step 7:** Commit `feat: volumetric fog, clustered night lighting, post chain`.

### Task 4: Storage, save, settings, presets (pure logic)

**Files:**
- Create: `src/logic/storage.ts`. `interface KV { get(k: string): string | null; set(k: string, v: string): void; del(k: string): void }`.
  - `localKV()` wraps `localStorage` and swallows every exception: a throwing `get` returns null, a throwing `set` is a no-op that logs one warning.
  - `memoryKV()` is for tests.
- Create: `src/logic/save.ts`
  - `interface SaveData { version: 1; checkpointId: string; solvedPuzzles: string[]; inventory: string[]; firedBeats: string[]; disabledObjects: string[]; savedAtUtc: string }`
  - `createSaveService(kv: KV)` returns `{ save(d: Omit<SaveData,'version'|'savedAtUtc'>): void; load(): SaveData | null; hasValidSave(): boolean; clear(): void }`
  - Key `som.save.v1`. `load` returns null on bad JSON, a wrong version, or a missing or wrong-typed field.
- Create: `src/logic/presets.ts`
  - `type GraphicsPreset = 'Low' | 'Medium' | 'High' | 'Ultra'`
  - `interface GraphicsOptions { renderScale: number; shadows: 'Off'|'Low'|'Medium'|'High'; fog: FogQuality; ssao: boolean; aa: 'Off'|'FXAA'|'SMAA'|'TAA'; motionBlur: boolean; frameCap: 30|60|0 }` (0 = unlimited)
  - `presetOptions(p)`, with pinned values:

    | Preset | renderScale | shadows | fog | ssao | aa | motionBlur | frameCap |
    |---|---|---|---|---|---|---|---|
    | Low | 0.67 | Low | Low | false | FXAA | false | 30 |
    | Medium | 0.85 | Medium | Medium | true | SMAA | false | 60 |
    | High | 1.0 | High | High | true | TAA | false | 60 |
    | Ultra | 1.0 | High | Ultra | true | TAA | true | 0 |

- Create: `src/logic/settings.ts`
  - `interface Settings { version: 1; locale: Locale; mouseSensitivity: number; invertY: boolean; headBob: boolean; bindings: Record<ActionName, string>; preset: GraphicsPreset; custom: GraphicsOptions | null; volumes: { master: number; music: number; sfx: number; ambience: number }; subtitles: boolean; subtitleSize: 'S'|'M'|'L'; presetAutoPicked: boolean }`
  - `defaultSettings()`: locale `en`; sensitivity 1; invertY false; headBob true; preset `Medium`; volumes 1 / 0.7 / 1 / 0.8; subtitles on, size M; bindings = `DEFAULT_BINDINGS`.
  - `createSettingsService(kv)` returns `{ get(): Settings; update(patch: Partial<Settings>): void; onChange(cb): () => void; effectiveGraphics(): GraphicsOptions }`. Key `som.settings.v1`. A corrupt or old stored value falls back to the defaults.
- Create: `src/logic/bindings.ts`
  - `type ActionName = 'forward'|'back'|'left'|'right'|'sprint'|'crouch'|'interact'|'hint'|'pause'|'skip'`
  - `DEFAULT_BINDINGS`: `KeyW`, `KeyS`, `KeyA`, `KeyD`, `ShiftLeft`, `KeyC`, `KeyE`, `KeyH`, `Escape`, `Space`.
  - `rebind(b, action, code): { ok: true; bindings } | { ok: false; reason: 'reserved' }`. `Escape` is reserved. A conflict **swaps** the two actions' codes.
- Create: `src/logic/autoPicker.ts`. `pickPreset(avgFps, current)`: below 40 fps steps down one (floor Low); above 90 fps steps up one (cap High, never Ultra); otherwise keeps `current`.
- Create: `src/logic/frameCap.ts`. `shouldRender(nowMs, lastRenderMs, cap: 30|60|0): boolean`. Returns true when `cap === 0` or `nowMs - lastRenderMs >= 1000/cap - 1`.
- Test: `tests/unit/save.test.ts`, `settings.test.ts`, `bindings.test.ts`, `autoPicker.test.ts`, `frameCap.test.ts`

- [ ] **Step 1:** Write the tests:
  - save: `round-trips lists`, `corrupt JSON → load null, hasValidSave false`, `wrong version → null`, `missing field → null`, `throwing storage → no throw, load null` (Review Focus 1)
  - settings: `defaults`, `persist round-trip (locale ar, invertY true)`, `corrupt → defaults`, `presets table matches spec` (all four rows), `custom overrides preset in effectiveGraphics`
  - bindings: `Escape rejected as reserved`; `binding interact to KeyW swaps with forward` (forward becomes `KeyE`)
  - autoPicker: `(35,Medium)→Low`, `(35,Low)→Low`, `(95,Medium)→High`, `(95,High)→High`, `(60,Medium)→Medium`
  - frameCap: `cap30: 20ms→false, 33ms→true`; `cap0 always true`
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: storage, save, settings, presets, bindings, frame cap`.

### Task 5: Game loop, physics, first-person controller, pointer lock

**Files:**
- Create: `src/main.ts` loop
  - `renderer.setAnimationLoop(tick)`.
  - Physics steps at a fixed 60 Hz (accumulator, max 5 substeps). Gameplay update runs every tick; rendering is gated by `shouldRender` using the effective `frameCap`.
- Create: `src/world/colliders.ts`
  - Rapier world init (`await RAPIER.init()`), gravity −9.81.
  - `addStaticBox(center, halfExtents, rotY)`, `addHeightfield(...)`, `addTrimesh(geometry, matrix)`, `raycast(origin, dir, maxDist, groupMask)`.
  - Collision groups: `WORLD=1`, `INTERACTABLE=2`, `PLAYER=4`, `BLOCKER=8`.
- Create: `src/player/controller.ts`. `class PlayerController` uses a Rapier `KinematicCharacterController` with a capsule of radius 0.3 m and height 1.75 m.
  - Speeds: walk 1.8 m/s, sprint 4.2 m/s, crouch 1.0 m/s. Eye height 1.65 m (1.1 m when crouched). Step offset 0.3 m, slope limit 45°.
  - Look uses `movementX/Y × 0.0022 × mouseSensitivity`, respects `invertY`, and clamps pitch to ±85°.
  - Head-bob amplitude 0.025 m, only when `headBob` is on.
  - `setInputEnabled(on: boolean)` and `teleport(pos, yawDeg)`.
- Create: `src/player/pointerLock.ts`
  - On `pointerlockchange` to unlocked while the game state is `playing`, it calls `pause.open()` and `controller.setInputEnabled(false)`.
  - Resume requests the lock from a click on the canvas (a user-gesture requirement).
- Create: `src/player/footsteps.ts`
  - A downward raycast reads the surface tag (`'cobble'|'gravel'|'grass'|'wood'|'metal'`) from collider user data.
  - Emits `onStep(surface)` every 0.55 m walked, or every 0.75 m when sprinting.
- Test: `tests/e2e/player.spec.ts`, using `?test=1&scene=flat` (a 100 m flat cobble plane)

- [ ] **Step 1:** Write the e2e tests:
  - `walks ~1.8 m in 1 s`: click to lock, hold W for 1000 ms, and assert the `__hero.playerPos()` delta is in 1.6–2.0.
  - `pointer lock loss pauses and freezes input`: call `document.exitPointerLock()` via evaluate, then assert `__hero.pauseOpen() === true`. Move the mouse and hold W for 500 ms; assert position and yaw are unchanged (Review Focus 2).
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement, with a minimal pause stub (`open()`/`isOpen()`). The real UI comes in Task 10.
- [ ] **Step 4:** Run them. Expected: PASS.
- [ ] **Step 5:** Commit `feat: game loop, Rapier physics, FPS controller, pointer-lock pause`.

### Task 6: Interaction, inspect, documents, inventory

**Files:**
- Create: `src/logic/inventory.ts`. `createInventory(initial?: string[])` returns `{ items(): readonly string[]; add(id): boolean; has(id): boolean; onAdd(cb) }`. `add` returns false if the item is already present.
- Create: `src/interaction/interactor.ts`
  - `interface Interactable { id: string; promptKey: string; object: Object3D; canInteract(): boolean; interact(): void }`
  - `class Interactor`: `register(i)`, `unregister(id)`. Each frame it casts a 2.2 m ray from the camera against group `INTERACTABLE`; it exposes `focused(): Interactable | null`, `onFocusChange(cb)`, and fires `interact()` on the `interact` binding.
- Create: `src/interaction/inspect.ts`
  - `class InspectView`, `open(source: Object3D, opts?: { textKey?: string })`.
  - Clones the visual into an overlay scene rendered after the main pass, 0.45 m in front of the camera.
  - Left-drag rotates; the wheel zooms 0.25–0.8 m; Esc or right-click closes.
  - While open: player input is off, the cursor is unlocked (without triggering the pause flow, via a `suppressPause` flag in `pointerLock.ts`), and `post.setDofFocus(0.45)` is on.
- Create: `src/interaction/documents.ts` (`openDocument(docKey)` → `ui/documentView`) and `src/interaction/pickup.ts` (`createPickup({ id, itemId, object })`: adds the item to the inventory, hides the object, and calls `director.markDisabled(id)`).
- Test: `tests/unit/inventory.test.ts`, `tests/e2e/interaction.spec.ts`

- [ ] **Step 1:** Write the tests:
  - unit `add twice → second false, no duplicate`
  - e2e (scene `flat` with a test cube):
    - `focus at 2.0 m, not at 2.5 m`
    - `inspect disables movement, Esc restores and does not open pause`
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run them. Expected: PASS.
- [ ] **Step 5:** Commit `feat: interaction, inspect view, documents, inventory`.

### Task 7: Dialogue, subtitles, story state

**Files:**
- Create: `src/logic/subtitleTiming.ts`: `durationFor(text: string): number` = `clamp(1.2 + text.length / 15, 2, 8)` seconds.
- Create: `src/logic/story.ts`. A pure reducer:
  - `interface StoryState { firedBeats: string[]; solvedPuzzles: string[]; disabledObjects: string[]; inventory: string[]; checkpointId: string }`
  - `type StoryEvent = { type: 'beat'; id } | { type: 'solved'; id } | { type: 'disabled'; id } | { type: 'item'; id } | { type: 'checkpoint'; id }`
  - `reduce(s, e): StoryState` is idempotent: a repeated id is a no-op.
  - `canFire(s, beatId): boolean`.
- Create: `src/dialogue/runner.ts`
  - `interface Line { speaker: string; text: string; duration?: number }`, with `speaker` and `text` as i18n keys.
  - `class DialogueRunner { play(lines: Line[], onDone?): void; isPlaying(): boolean; skip(): void }`
  - Re-resolves the current line on `i18n.onChange`.
- Create: `src/dialogue/director.ts`
  - `class StoryDirector` holds `StoryState`.
  - `fire(beatId)` plays `BEATS[beatId]` only if `canFire`. Also `markSolved(id)`, `markDisabled(id)`, `addItem(id)`, `autosave(checkpointId)` (→ `saveService.save`).
  - `restore(save: SaveData)` re-applies disabled objects, solved puzzle states (via a registry `puzzleId → forceSolved()`) and the inventory, without replaying beats.
- Create: `src/dialogue/beats.ts`. `BEATS: Record<string, Line[]>` for `b1_wake`, `b2_newsstand`, `b4_fritz_arrives`, `b5_latin_translation`, `b7_opening`, `b9_hook`, `fritz_notyet` and `fritz_nohint`. The text comes **verbatim** from spec §7 (EN), with AR and DE translations written into the locale files under `dlg.*`.
- Create: `src/ui/subtitles.ts`. A speaker name plus text in a panel with `rgba(18,16,14,0.82)` background. Sizes S/M/L = 22/28/36 px. Hidden when `subtitles` is off.
- Test: `tests/unit/subtitleTiming.test.ts`, `story.test.ts`, `locales.test.ts`

- [ ] **Step 1:** Write the tests:
  - `durationFor("Hi") === 2`, and `durationFor('a'.repeat(300)) === 8`
  - story: `beat fires once`, `reduce is idempotent for item/solved/disabled`, `snapshot → SaveData → restore equals`
  - locales: `every key used in BEATS, hints, docs, items and ui exists in en, ar and de with non-empty values` (import `BEATS` plus a `USED_KEYS` list exported from each module)
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement, and write all Act 0 strings in the three locales.
- [ ] **Step 4:** Run them. Expected: PASS.
- [ ] **Step 5:** Add the e2e test `language switch re-resolves a playing subtitle` to `tests/e2e/rtl.spec.ts`: play `b1_wake`, `__hero.setLocale('ar')`, and assert that `#subtitle-text` equals `ar.json['dlg.b1.julian']` and that `dir` is `rtl` (Review Focus 3). Run it. Expected: PASS.
- [ ] **Step 6:** Commit `feat: dialogue runner, subtitles, story state, Act 0 script EN/AR/DE`.

### Task 8: Hints and the cipher-disc lock

**Files:**
- Create: `src/logic/hints.ts`
  - `createHintScheduler(tierCount: number, minSecondsBetween = 45)` returns `{ request(nowSec: number): number; current(): number }`.
  - The first request returns 0. A tier advances only if `now − lastAdvance ≥ minSecondsBetween`; otherwise the current tier repeats. Capped at `tierCount − 1`.
- Create: `src/logic/cipher.ts`
  - `encode(plain: string, shift: number): string`
  - `createCipherDisc(target = 'KARL', engraved = 'YOFZ')` returns `{ ringOffset(): number; rotateRing(steps: number): void; plainUnder(outer: string): string; tumbler(i: number): string; cycleTumbler(i: number, dir: 1|-1): void; isCorrect(): boolean }`
  - `plainUnder(c) = A + ((c − A − offset) mod 26)`. `isCorrect` checks the tumblers only; the ring is just a decoding aid (spec §11b).
- Create: `src/puzzles/cipherLock.ts`. `class CipherLock`, with puzzle id `cipher_lock` and hint keys `hint.lock.1`–`hint.lock.4` (spec §7 table).
  - **Interaction:** interacting with the lock focuses it. The camera blends over 0.5 s to the lock's `view` anchor and the cursor is freed.
  - **Ring:** the wheel or A/D rotates the inner ring by 360/26° per step.
  - **Tumblers:** clicking the top or bottom half of a tumbler cycles it.
  - **Handle:** E or a click on the handle checks the answer.
    - Wrong: rattle sound and a 0.4 s shake.
    - Right: clunk, steam particles, door hinge swing over 0.8 s, then `director.markSolved('cipher_lock')` → `director.autosave('cipher_lock')`.
  - **Leaving:** Esc leaves focus.
  - `forceSolved()` opens the door with no effects.
  - It uses meshes from Task 13's pyramid assembly when present, and primitives otherwise.
- Test: `tests/unit/cipher.test.ts`, `hints.test.ts`

- [ ] **Step 1:** Write the tests:
  - `encode('KARL',14) === 'YOFZ'`
  - `digit sum of 1715 is 14`
  - `offset 14 decodes Y→K, O→A, F→R, Z→L`
  - `rotateRing wraps: -1 → 25, 27 → 1`
  - `KARL on tumblers is correct at any ring offset`
  - hints: `request(0)=0`, `(10)=0`, `(46)=1`, `(50)=1`, `(92)=2`, `(140)=3`, `(500)=3`
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement `hints.ts`, `cipher.ts`, then `cipherLock.ts`.
- [ ] **Step 4:** Run them. Expected: PASS.
- [ ] **Step 5:** Commit `feat: hint scheduler, cipher logic, 3D cipher-disc lock`.

### Task 9: Companion Fritz

**Files:**
- Create: `src/companion/fritz.ts`. `class Fritz`.
  - `addPerch(id: string, pos: Vector3, facingDeg: number)`.
  - `flyTo(id): Promise<void>` follows a cubic Bezier with its apex 2 m above the higher endpoint, at 6 m/s, banking up to 25°.
  - Animation states `fly`, `perch`, `idle`, `caw` via `AnimationMixer`. Any clip the model lacks is driven procedurally: wing-bone flap at 4 Hz for `fly`, head-tilt noise for `idle`. Note this in the credits notes.
  - `hint(lock: { id; hintKeys; scheduler; targets: Object3D[][] })` plays the tier line through `DialogueRunner`, highlights that tier's targets (`highlight.setHighlighted`) for 6 s, and caws.
  - Act 0 targets: tiers 1–2 → plaque, tier 3 → ring, tier 4 → tumblers.
  - The `hint` binding routes to the active puzzle. With none active, it plays `fritz_nohint`.
  - The time source is injectable (`now: () => number`) for tests.
- Test: `tests/e2e/fritz.spec.ts` (scene `flat` with 2 perches and a dummy lock)

- [ ] **Step 1:** Write the tests:
  - `flies 12 m in ≤ 2.5 s`
  - `hint tiers advance with fake clock and highlight correct targets` (`__hero.setClock(t)`)
  - `no active puzzle → nohint line`
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement with a placeholder low-poly bird until Task 11 provides the raven.
- [ ] **Step 4:** Run them. Expected: PASS.
- [ ] **Step 5:** Commit `feat: companion Fritz with perch flight and tiered hints`.

### Task 10: UI (menu, pause, settings, HUD, documents, credits, end card)

**Files:**
- Create: `src/ui/styles.css`
  - Colors: paper `#E9DFC7`, ink `#2A2420`, brass `#B08D57`, panel `rgba(18,16,14,0.82)`.
  - Headings use IM Fell English (Amiri under `:lang(ar)`); body uses Noto Sans (Noto Naskh Arabic under `:lang(ar)`).
  - Use logical CSS properties only (`margin-inline-start` etc.) so RTL mirrors automatically.
- Create:
  - `menu.ts`:
    - Continue (shown only if `hasValidSave()`), New Game (confirms if a save exists, then `clear()`), Settings, Credits.
    - The background is the plaza with a slow orbit camera.
    - On first launch (`!presetAutoPicked`), it averages fps over 10 s and applies `pickPreset`, then sets the flag.
  - `pause.ts`: Resume, Settings, Main Menu.
  - `settingsScreen.ts`, with tabs:
    - Language: en / ar / de, each label in its own script.
    - Controls: click-to-rebind using `rebind()`, showing "reserved" or "swapped with X" messages; sensitivity 0.2–3; invert-Y; head-bob.
    - Graphics: preset, plus individual fields that set `custom`; frame cap 30/60/Unlimited.
    - Audio: 4 sliders.
    - Subtitles: on/off, S/M/L.
    - Every change applies live through `settings.onChange`. The renderer, post, fog and lighting rebuild only when an option that affects them changes.
  - `hud.ts`: a 4 px crosshair dot, and an interact prompt `[E] <localized prompt>` that shows the key from the current binding.
  - `documentView.ts`: an aged-paper document overlay, scrollable, Esc to close.
  - `credits.ts`: reads `/credits.json`.
  - `endCard.ts`: the "End of Slice: Thank you for playing" card with a Main Menu button.
- Test: `tests/e2e/menu.spec.ts`

- [ ] **Step 1:** Write the tests:
  - `no save → Continue hidden`
  - `corrupt save (localStorage seeded with "{bad") → Continue hidden, boots` (Review Focus 1)
  - `localStorage blocked (addInitScript makes getItem/setItem throw) → boots to menu` (Review Focus 1)
  - `select Arabic → html dir rtl, menu labels Arabic`
  - `frame cap 30 → __hero.renderFps() between 27 and 31 over 3 s`
  - `rebind Escape rejected`
  - `rebind interact to W swaps`
  - `settings persist across reload`
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run them. Expected: PASS. Take screenshots of each settings tab in en, ar and de, and check them: Arabic mirrored and joined, German labels not clipped.
- [ ] **Step 5:** Commit `feat: menus, settings UI, HUD, documents, credits, end card`.

### Task 11: Placeholder assets (fetch, owner picks, optimize, credits, loader)

**Files:**
- Create: `tools/assets/fetch_assets.py`. Run with `python -I`; uses stdlib plus `requests`.
  - `search --slot <slot> --q "<query>"`:
    - Sketchfab: `GET https://api.sketchfab.com/v3/search?type=models&downloadable=true&q=<q>`, keeping only results whose `license.slug` is `by` or `cc0`.
    - Poly Haven: `https://api.polyhaven.com/assets?t=<models|textures|hdris>`.
    - Saves `tools/assets/.cache/shortlist/<slot>.json` and the thumbnails.
  - `contact-sheet`: writes `tools/assets/.cache/contact_sheet.html` with the top 4 per slot, showing thumbnail, title, author, license and link.
  - `fetch`: for each `manifest.json` entry:
    - Sketchfab: `GET /v3/models/{uid}/download` with header `Authorization: Token <token file contents>`, preferring `glb` and falling back to `gltf`.
    - Poly Haven: 2K maps, 4K for `tex_sandstone_red`, `tex_cobble_wet` and `tex_bronze_patina`.
    - Each download is extracted into its own fresh directory under `.cache/raw/<slug>/` and never executed. A license other than CC0/CC-BY aborts that entry.
- Create: `tools/assets/manifest.json`. Entries: `{ slot, source, id, slug, title, author, license, url, targetSize: { axis: 'height'|'length', meters } }`.
- Create: `tools/assets/blender/fix_transform.py`. Run it headless with the portable Blender: `blender -b -P fix_transform.py -- in.glb out.glb --size <m> --axis <height|length>`. It applies transforms, scales to real size, puts the pivot at bottom-center and faces +Z.
- Create: `tools/assets/optimize.mjs`. Uses `gltf-transform` `optimize` with `--compress meshopt --texture-compress ktx2`; `uastc` for normal maps, `etc1s` for the rest. Output goes to `public/assets/<slug>/<slug>.glb`.
- Create: `tools/assets/make_credits.py`, which writes `ASSET_CREDITS.md` and `public/credits.json`.
- Create: `src/world/assets.ts`. `loadModel(slug): Promise<GLTF>` uses `GLTFLoader`, `KTX2Loader` (transcoder copied into `public/basis/`) and `MeshoptDecoder`, with a cache.
- **Slots and sizes** (spec §11):
  - pyramid (height 6.8 m)
  - schloss (length 170 m)
  - streetlamp (height 4.5 m)
  - bench (length 1.8 m)
  - kiosk (height 3.2 m)
  - newspapers (length 0.4 m)
  - tree_plane (height 22 m), tree_linden (height 18 m), tree_chestnut (height 16 m)
  - hedge (length 2 m)
  - raven_rigged (length 0.6 m)
  - human_npc_m (height 1.75 m), human_npc_f (height 1.65 m)
  - hdri_night_overcast
  - tex_cobble_wet, tex_sandstone_red, tex_bronze_patina, tex_grass, tex_gravel, tex_bark
- Test: `tests/unit/manifest.test.ts`

- [ ] **Step 1:** Run `search` for every slot, then `contact-sheet`.
- [ ] **Step 2: OWNER CHECKPOINT.** Open the contact sheet for the owner, with its full absolute path. The owner picks one per slot. Write the picks into `manifest.json`. **Don't fetch before they pick.**
- [ ] **Step 3:** Write the unit test `every manifest entry has an allowed license, author, url, and a public/assets/<slug> folder with a .glb or texture files`. Run it. Expected: FAIL.
- [ ] **Step 4:** Run `fetch` → `fix_transform.py` (models) → `optimize.mjs` → `make_credits.py`.
- [ ] **Step 5:** Run `npm test`. Expected: PASS.
- [ ] **Step 6:** If no free rigged, animated human or raven was found, write `docs/owner-download-list.md` (Mixamo animation names needed: Idle, Angry Gesture, Shouting, Looking Around). Fritz's procedural fallback covers the raven meanwhile.
- [ ] **Step 7:** Commit `assets: fetch tooling, owner picks, optimized placeholders, credits`.

### Task 12: World layout at real scale

**Files:**
- Create: `src/logic/worldLayout.ts`
  - `bearing(i: number): number` returns `i * 11.25`.
  - `direction(i): { x: number; z: number }` returns `{ x: sin(bearing), z: cos(bearing) }`; north = +Z.
  - Constants: `PLAZA_CENTER = { x: 0, y: 0, z: -170 }`, `GARDEN_RADIUS = 450`, `LAKE = { center: { x: -40, z: 220 }, rx: 70, rz: 35 }`, `RAIL_RADIUS = 300`, `SLICE_RADIUS = 70`.
- Create: `src/world/terrain.ts`
  - A 1200 × 1200 m heightfield at 2 m resolution, flat ±0.5 m noise, flattened to 0 on paths and the plaza.
  - Splat material in TSL: grass / gravel / cobble from a generated splat texture. The paths are 32 radial strips, 6 m wide, from radius 60 m outward. Bearings 135°–225° are cobble; all others are gravel.
  - The lake ellipse is carved 1.5 m deep, with a reflective water material (SSR on High/Ultra, planar env otherwise).
  - A Rapier heightfield collider tagged by surface.
- Create: `src/world/garden.ts`
  - Trees as `InstancedMesh` per species with 2 LOD levels plus far impostor billboards beyond 150 m. Placed in rings 120–430 m at 70% density, never on paths, the plaza or the lake.
  - The fountain at the lake center.
  - The Schlossgartenbahn track on a `CatmullRomCurve3` loop around `RAIL_RADIUS`.
- Create: `src/world/schloss.ts`
  - The `schloss` placeholder placed at the origin, facing south.
  - If it doesn't match scale or shape, use a blockout: main wing 170 × 18 × 20 m along X, two 120 m side wings at ±45° south-east and south-west, a 51 m tower. Sandstone material.
  - Box colliders.
- Create: `src/world/placements/garden.json`, plus the slice blockers: `BLOCKER` group cylinders on a ring of radius `SLICE_RADIUS` around `PLAZA_CENTER`. Entering one plays `fritz_notyet` and pushes the player back 2 m.
- Test: `tests/unit/worldLayout.test.ts`, `tests/e2e/world.spec.ts`

- [ ] **Step 1:** Write the tests:
  - unit: `bearing(8) === 90`; `direction(16)` ≈ `{ x: 0, z: -1 }` (tolerance 1e-9); `PLAZA_CENTER on axis 16 at 170 m`
  - e2e:
    - `aerial view`: `__hero.viewpoint('aerial')` at 400 m up, looking down, with fog disabled for this debug view only (a debug flag; the fog density value itself is untouched). Screenshot.
    - `blocker`: teleport to 69 m from the plaza center and walk outward; assert the player stays within 70 m and the `fritz_notyet` subtitle appears.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run them. Expected: PASS. Look at the aerial screenshot: 32 axes, Schloss north of the plaza, lake to the north.
- [ ] **Step 5:** Commit `feat: Schlossgarten world at real scale with slice blockers`.

### Task 13: Plaza art (pyramid assembly, props, NPCs)

**Files:**
- Create: `src/world/plaza.ts` and `placements/plaza.json`, all positions relative to world origin:
  - Pyramid at (0, 0, −170).
  - Wake bench at (6, 0, −150), facing the pyramid.
  - Kiosk at (−18, 0, −160) with the newsstand-owner NPC (shouting loop) and newspaper props.
  - Citizens at (10, 0, −185) and (−8, 0, −195). Their heads turn to glare when the player is within 6 m (look-at on the head bone, max 70°).
  - 8 streetlamps on a 22 m ring around the pyramid.
  - Fritz perches `pyramid_tip`, `lamp_3`, `kiosk_roof`, `bench_back`.
  - Viewpoints `wake`, `pyramid`, `plaque`, `lock`, `kiosk`, `wide`, `menu_orbit` (each a position + target).
- **Pyramid assembly** (built in code around the placeholder):
  - **Plaque:** a bronze plaque on the south face, 1.2 × 0.8 m. A `LocalizedCanvasTexture` shows the localized text of spec §7 beat 5 with the Latin line **ANNI NATALIS SUMMA ROTAM VERTIT** above it. The Latin stays Latin in every language.
  - **Door:** a brass door, 0.9 × 1.1 m, engraved "Y O F Z" (canvas texture with normal from height).
  - **Lock:** the `CipherLock` meshes, built procedurally: an outer fixed A–Z ring of radius 0.16 m, an inner rotating ring of radius 0.11 m, four tumblers and a handle.
  - **Alcove:** 0.8 m deep, with a warm 2700 K point light.
  - **Jammer:** a red emissive light, hum loop and vent particles. Interacting disables all three and calls `director.markDisabled('jammer')`. **No fog change.**
  - **Manifesto:** a document `doc.vanguard_manifesto`, with EN/AR/DE text written to match the script's description (missile shipments routed through the portal train line to Port Said, signed by Vanguard Armaments).
  - **Pickup:** `item.ticket_printer_part`.
- **Materials:** wet cobble from a Poly Haven cobble plus a procedural puddle mask (roughness 0.15 in puddles, 0.65 elsewhere, darkened albedo in puddles); red sandstone with a 4×-tiled detail normal; bronze/copper patina. Everything uses `MeshPhysicalNodeMaterial` / `MeshStandardNodeMaterial`.
- Test: `tests/e2e/plaza.spec.ts`

- [ ] **Step 1:** Write the tests:
  - `all perches and viewpoints exist`
  - `disabling jammer leaves __hero.fogDensity() unchanged`
  - `plaque texture re-renders in Arabic` (`__hero.plaqueLocale() === 'ar'` after a switch)
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run them. Expected: PASS.
- [ ] **Step 5:** Capture all viewpoints at High and judge them against spec §5 and §9: no reachable untextured graybox, fog halos on every lamp, wet sheen, readable plaque. Iterate on materials and placement until they pass. Save the finals to `docs/screenshots/slice/`.
- [ ] **Step 6:** Commit `feat: Act 0 plaza, pyramid assembly, props, NPCs`.

### Task 14: Lighting and post polish per preset

**Files:**
- Modify: `src/render/lighting.ts`. Add a `LightProbeGrid` (three addon) over the plaza: 4 m spacing within 60 m, baked once at load after the static world is placed. It provides indirect bounce from the sodium lamps. If baking takes over 3 s on Low, bake it at build time into `public/assets/probes/plaza.bin` and load that instead.
- Modify: `src/render/post.ts`. Final grading values are tuned against the Task 13 screenshots. Record the final numbers in this file's header comment.
- Optional: Blender-baked AO maps for the pyramid and kiosk (`tools/assets/blender/bake_ao.py`), only if GTAO alone leaves them looking flat on Low (where SSAO is off).

- [ ] **Step 1:** Capture every viewpoint at each preset (7 × 4) on WebGPU, and at Low on WebGL2. Look at them: Low still shows fog halos and isn't flat; High and Ultra look portfolio-grade.
- [ ] **Step 2:** Run `npm test && npm run build && npm run e2e`. Expected: all PASS.
- [ ] **Step 3:** Commit `feat: probe-lit night lighting, tuned post per preset`.

### Task 15: Audio

**Files:**
- Extend: `tools/assets/manifest.json` with audio slots. Sources: Freesound CC0/CC-BY, which needs an account token; if the owner doesn't provide one, add these to `docs/owner-download-list.md` or use Sonniss GDC bundles, which allow game use (record the license). Slots:
  - night_ambience, wind, distant_sirens, fog_hum
  - footsteps cobble/gravel/grass/wood/metal (4 each)
  - raven_caw ×4, clockwork_chime ×3
  - ring_tick, tumbler_click, handle_rattle, lock_clunk, steam
  - jammer_hum, jammer_off, paper_rustle, item_pickup
  - ui_hover, ui_click, music_menu
  - Audio is converted to `.ogg` (Opus) at 96 kbps, plus an `.m4a` fallback.
- Create: `src/audio/mixer.ts`. Web Audio buses master → {music, sfx, ambience} as `GainNode`s; gain = slider value squared. Resumes the `AudioContext` on the first user gesture.
- Create: `src/audio/ambience.ts`. Positional emitters via three `PositionalAudio`: sirens 300 m south-west, the fog hum around the plaza, wind global.
- Create: `src/logic/footstepPicker.ts`. `createPicker(count)` returns `{ next(): number }`: random, never the same index twice in a row, pitch 0.95–1.05.
- Test: `tests/unit/footstepPicker.test.ts`

- [ ] **Step 1:** Write the test `never repeats last index over 1000 draws (count 4)`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement, wire every SFX into Tasks 5–13, and update the credits.
- [ ] **Step 4:** Run `npm test && npm run e2e`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: audio buses, ambience, footsteps, SFX`.

### Task 16: Act 0 wiring and automated playthrough

**Files:**
- Modify: `src/world/plaza.ts` and `src/dialogue/director.ts`. Wire the beats from spec §7:
  1. `b1_wake`: on New Game, fade from black and play coughing.
  2. `b2_newsstand`: on entering 10 m of the kiosk.
  3. The pyramid's red indicator stays on until `cipher_lock` is solved.
  4. `b4_fritz_arrives`: on first interaction with the door or lock. Fritz flies to `pyramid_tip`.
  5. `b5_latin_translation`: on first plaque inspect. The inspect view then shows the translation line.
  6. The lock.
  7. `b7_opening`: on solve.
  8. The jammer, the document and the pickup, in any order.
  9. `b9_hook`: fires when the jammer is disabled, the document has been read and the item is held. Then autosave `act0_end` and show the end card.
- Create: `src/test/hooks.ts` (`?test=1` only). It exposes on `window.__hero`:
  - `state()`, `playerPos()`, `teleport(vp)`, `viewpoint(name)`, `setClock(t)`, `setLocale(l)`
  - `fogDensity()`, `frames()`, `renderFps()`, `pauseOpen()`
  - `lock: { rotate(n); setTumblers(s); pull() }`, `subtitle()`
- Create: `tests/e2e/act0.spec.ts`
  - `full playthrough en`. Uses real key presses for interact and hint, and the hooks only for teleport and lock manipulation:
    - New Game → `b1` subtitle → walk near the kiosk → `b2` → interact with the door → `b4` → inspect the plaque → `b5` and the translation visible
    - Press H four times with the clock advanced 46 s between presses; assert the subtitles equal `hint.lock.1..4` in order
    - Rotate the ring 14, set KARL, pull → `b7`; assert `state().solvedPuzzles` contains `cipher_lock` and a save exists
    - Disable the jammer (assert `fogDensity` unchanged), read the document, pick up the item → `b9` → end card visible
  - `wrong code does not solve`: set `KARK` and pull; not solved, no save written.
  - `resume after lock` (Review Focus 4):
    - Play to just after `b7`, then reload and click Continue.
    - Assert: door open, jammer still on, inventory has no duplicates, the `b4` subtitle does not appear within 5 s.
    - Pick up the item, reload, Continue → inventory has it exactly once.
  - `full playthrough ar` and `de`: as the `en` playthrough, screenshotting each subtitle beat.
  - `full playthrough on WebGL2`: runs in the `no-webgpu` project.

- [ ] **Step 1:** Write `act0.spec.ts`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Wire the beats until it passes.
- [ ] **Step 4:** Run `npm run build && npm run e2e`. Expected: all PASS on both projects. Look at the AR and DE screenshots: shaped RTL, no overflow.
- [ ] **Step 5:** Commit `feat: Act 0 story wiring with automated playthroughs`.

### Task 17: Performance and final verification

**Files:**
- Create: `src/test/bench.ts`, active with `?bench=<Preset>`.
  - Applies the preset with `frameCap: 0` and the renderer created with `trackTimestamp: true`.
  - Flies a fixed 40 s camera path `wake → kiosk → pyramid → wide`.
  - Every 30 frames it reads GPU time via `renderer.resolveTimestampsAsync()` / `renderer.info.render.timestamp`.
  - Logs `BENCH preset=<p> backend=<b> avgFps=<n> p1LowFps=<n> avgGpuMs=<n>`.
- Create: `tests/e2e/bench.spec.ts`. Runs Low and High at 1920×1080 and writes `test-results/bench.json`.

- [ ] **Step 1:** Run the bench. Targets:
  - **High:** `avgFps ≥ 58` (the display is rAF/vsync-capped) and `avgGpuMs ≤ 14`.
  - **Low, integrated-GPU proxy:** `avgGpuMs ≤ 6.0` on the RTX 2070 Max-Q. The laptop's iGPU isn't exposed; 6 ms here is roughly 30 fps on Iris Xe-class GPUs. Report it as a proxy and ask the owner to try Low on a real integrated-GPU machine.
- [ ] **Step 2:** If a target misses, fix in this order:
  1. Fog steps and resolution
  2. The shadowed-lamp count
  3. Tree instance density and LOD/impostor distances
  4. Texture sizes
  5. Render scale

  Keep the `fogQuality` and `presets` tables and their unit tests in sync with any change, and note why in the commit.
- [ ] **Step 3:** Final checklist against spec §13. Each item needs evidence (command output or a screenshot path):
  - Menu → end card with no console errors (both backends)
  - AR/DE correct
  - Continue resumes after the lock
  - Settings apply and persist
  - Hint tiers 1–4
  - Cipher solvable from in-world clues
  - Fog scatters streetlight
  - High target met
  - Low proxy met
  - Credits complete
- [ ] **Step 4:** Run `npm test && npm run build && npm run e2e`. Expected: all PASS.
- [ ] **Step 5:** Commit `perf: tuned presets, benchmark results` with the bench numbers in the body. **No push. There is no remote.**

## Notes

- Record any fallback taken here: a custom TSL raymarch instead of `VolumeNodeMaterial` (Task 3), a build-time probe bake (Task 14), the procedural raven animation (Task 9), and the owner download list (Tasks 11 and 15).
