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
  /** Fire a story beat through the director; false if it already fired. */
  fireBeat?: (id: string) => boolean;
  storyState?: () => import('../logic/story').StoryState;
  dialoguePlaying?: () => boolean;
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
