/**
 * Test hooks. `window.__hero` exists only when the URL has `?test=1`.
 * Later tasks add the members their own tests need by extending HeroHooks.
 */
export interface HeroHooks {
  backend?: 'webgpu' | 'webgl2';
  [key: string]: unknown;
}

declare global {
  interface Window {
    __hero?: HeroHooks;
  }
}

export function isTestMode(search: string = location.search): boolean {
  return new URLSearchParams(search).has('test');
}

/** Merge `extra` into window.__hero when in test mode; no-op otherwise. */
export function installHooks(extra: Partial<HeroHooks> = {}): HeroHooks | undefined {
  if (!isTestMode()) return undefined;
  window.__hero = Object.assign(window.__hero ?? {}, extra);
  return window.__hero;
}
