/**
 * Test hooks. `window.__hero` exists only when the URL has `?test=1`.
 * Later tasks add the members their own tests need by extending HeroHooks.
 */
import type { I18n, Locale } from '../logic/i18n';
import { LocalizedCanvasTexture } from '../render/canvasText';
import { bodyFont, loadFonts } from '../render/fonts';

export interface HeroHooks {
  backend?: 'webgpu' | 'webgl2';
  /** Draw an i18n key onto a visible fixed debug canvas (redraws on locale change). */
  debugCanvasText?: (key: string) => Promise<void>;
  setLocale?: (l: Locale) => void;
  /** Frames rendered by the main loop so far. */
  frames?: () => number;
  /** Current fog extinction density (must never change at runtime). */
  fogDensity?: () => number;
  /** Fog tier actually in use (WebGL2 forces 'WebGL2Safe'). */
  fogQuality?: () => string;
  /** Switch fog tier at runtime (exercises the post-chain rebuild). */
  setFogQuality?: (q: 'WebGL2Safe' | 'Low' | 'Medium' | 'High' | 'Ultra') => void;
  /** Depth of field focus in metres; null turns it off (rebuilds the chain). */
  setDofFocus?: (m: number | null) => void;
  /** Live GPU texture count (renderer.info.memory.textures). */
  gpuTextures?: () => number;
  /** Player feet position in metres (scene=flat and later worlds). */
  playerPos?: () => { x: number; y: number; z: number };
  /** Player view bearing in degrees, clockwise from north (+Z). */
  playerYaw?: () => number;
  /** Whether the pause menu (stub until Task 10) is open. */
  pauseOpen?: () => boolean;
  gameState?: () => 'menu' | 'playing' | 'paused';
  /** Surfaces of every footstep emitted so far. */
  steps?: () => string[];
  /** Id of the interactable under the crosshair, or null. */
  focusedId?: () => string | null;
  inspectOpen?: () => boolean;
  inventory?: () => string[];
  /** Put the test cube's near face this many metres ahead of the camera (needs ?props=testcube). */
  placeTestCube?: (distance: number) => void;
  /** The cipher-disc lock (needs ?props=lock). */
  lock?: {
    rotate(steps: number): void;
    setTumblers(letters: string): void;
    pull(): void;
    state(): import('../puzzles/cipherLock').LockState;
  };
  /** Client-pixel position of each lock tumbler, with a point in its top and bottom half. */
  lockTumblerPoints?: () => Array<{ x: number; top: number; bottom: number }>;
  /** Fire a story beat through the director; false if it already fired. */
  fireBeat?: (id: string) => boolean;
  storyState?: () => import('../logic/story').StoryState;
  dialoguePlaying?: () => boolean;
  /** Override the game clock (seconds) used by hint timing; null restores real time. */
  setClock?: (t: number | null) => void;
  /** Companion Fritz (needs ?props=perches). */
  fritz?: {
    flyTo(id: string): Promise<void>;
    state(): 'fly' | 'perch' | 'idle' | 'caw';
    position(): { x: number; y: number; z: number };
    perch(): string | null;
    /** Names of the objects currently outlined by a hint. */
    highlighted(): string[];
    /** Raven caws heard so far. */
    caws(): number;
    /** Ids of every perch Fritz knows. */
    perches?(): string[];
  };
  /** The Vanguard jammer in the pyramid alcove (scene=garden). */
  jammer?: {
    state(): { light: boolean; hum: boolean; vent: boolean };
    /** Shut it down as the interaction would (marks it disabled in the story). */
    disable(): void;
  };
  /** Locale the plaque texture was last drawn in (scene=garden), null before fonts load. */
  plaqueLocale?: () => string | null;
  /** Id of the puzzle Fritz's hints currently address, or null. */
  activePuzzle?: () => string | null;
  /** Local lights currently scattering in the volumetric fog (capped). */
  fogLightCount?: () => number;
  /** Press the hint action as if the key were pressed. */
  requestHint?: () => void;
  /** A copy of the current settings. */
  settings?: () => import('../logic/settings').Settings;
  /** Rendered frames per second over the last 3 s. */
  renderFps?: () => number;
  /** Whether the main menu (or a screen opened from it) is showing. */
  menuOpen?: () => boolean;
  /** Show the end-of-slice card (game scenes). */
  showEndCard?: () => void;
  /** Put the player's feet on the ground at (x, z), facing bearing `yaw`. */
  teleport?: (x: number, z: number, yaw: number, pitch?: number) => void;
  /** Override the camera with a named debug viewpoint (scene=garden: 'aerial'); null gives it back to the player. */
  viewpoint?: (name: string | null) => boolean;
  /** Put the camera at `position` looking at `target` (a 'debug' viewpoint; scene=garden). */
  lookFrom?: (position: [number, number, number], target: [number, number, number], fov?: number) => boolean;
  /** Camera position and unit view direction. */
  cameraPose?: () => { x: number; y: number; z: number; lookX: number; lookY: number; lookZ: number };
  /** Whether a debug view is bypassing the fog (the density never changes). */
  fogDebugBypass?: () => boolean;
  /** Trees drawn per LOD last frame (scene=garden). */
  treeStats?: () => { lod0: number; lod1: number; impostor: number } | null;
  /** Load a model through src/world/assets.ts and describe it (clips, bone names, triangle count, bounds). */
  loadModelInfo?: (slug: string) => Promise<{
    clips: string[];
    bones: string[];
    tris: number;
    size: [number, number, number];
    min: [number, number, number];
  }>;
  [key: string]: unknown;
}

declare global {
  interface Window {
    __hero?: HeroHooks;
  }
}

export function isTestMode(search: string = location.search): boolean {
  return new URLSearchParams(search).get('test') === '1';
}

/** Merge `extra` into window.__hero when in test mode; no-op otherwise. */
export function installHooks(extra: Partial<HeroHooks> = {}): HeroHooks | undefined {
  if (!isTestMode()) return undefined;
  window.__hero = Object.assign(window.__hero ?? {}, extra);
  return window.__hero;
}

/** Hooks that need the i18n instance. */
export function installI18nHooks(i18n: I18n): void {
  let debug: LocalizedCanvasTexture | undefined;
  installHooks({
    setLocale: (l) => i18n.setLocale(l),
    debugCanvasText: async (key) => {
      await loadFonts();
      if (!debug) {
        debug = new LocalizedCanvasTexture(i18n, key, {
          width: 640,
          height: 160,
          font: (l) => bodyFont(l, 56),
          color: '#f2efe6',
          lineHeight: 72,
          align: 'start',
          background: '#1b1f1a',
          padding: 24,
        });
        const c = debug.canvas;
        c.id = 'debug-canvas-text';
        c.style.cssText = 'position:fixed;left:24px;top:24px;z-index:10;border:1px solid #8e9a86';
        document.body.appendChild(c);
      }
      debug.setKey(key);
    },
  });
}
