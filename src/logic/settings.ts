import type { Locale } from './i18n';
import { isLocale } from './i18n';
import { DEFAULT_BINDINGS, type ActionName } from './bindings';
import { presetOptions, GRAPHICS_PRESETS, type GraphicsOptions, type GraphicsPreset } from './presets';
import { FOG_QUALITIES, type FogQuality } from './fogQuality';
import type { KV } from './storage';

export interface Settings {
  version: 1;
  locale: Locale;
  mouseSensitivity: number;
  invertY: boolean;
  headBob: boolean;
  bindings: Record<ActionName, string>;
  preset: GraphicsPreset;
  custom: GraphicsOptions | null;
  volumes: { master: number; music: number; sfx: number; ambience: number };
  subtitles: boolean;
  subtitleSize: 'S' | 'M' | 'L';
  presetAutoPicked: boolean;
}

export const SETTINGS_KEY = 'som.settings.v1';

export function defaultSettings(): Settings {
  return {
    version: 1,
    locale: 'en',
    mouseSensitivity: 1,
    invertY: false,
    headBob: true,
    bindings: { ...DEFAULT_BINDINGS },
    preset: 'Medium',
    custom: null,
    volumes: { master: 1, music: 0.7, sfx: 1, ambience: 0.8 },
    subtitles: true,
    subtitleSize: 'M',
    presetAutoPicked: false,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function validGraphics(c: unknown): c is GraphicsOptions {
  if (!isObj(c)) return false;
  return (
    num(c.renderScale) && c.renderScale > 0 && c.renderScale <= 1 &&
    ['Off', 'Low', 'Medium', 'High'].includes(c.shadows as string) &&
    FOG_QUALITIES.includes(c.fog as FogQuality) &&
    typeof c.ssao === 'boolean' &&
    ['Off', 'FXAA', 'SMAA', 'TAA'].includes(c.aa as string) &&
    typeof c.motionBlur === 'boolean' &&
    [30, 60, 0].includes(c.frameCap as number)
  );
}

/** Returns a valid Settings, or null if the stored value is unusable. */
function validate(o: unknown): Settings | null {
  if (!isObj(o) || o.version !== 1) return null;
  const v = o.volumes;
  if (!isLocale(o.locale) || !num(o.mouseSensitivity) || typeof o.invertY !== 'boolean' || typeof o.headBob !== 'boolean') return null;
  if (!GRAPHICS_PRESETS.includes(o.preset as GraphicsPreset)) return null;
  if (typeof o.subtitles !== 'boolean' || !['S', 'M', 'L'].includes(o.subtitleSize as string)) return null;
  if (typeof o.presetAutoPicked !== 'boolean') return null;
  if (!isObj(v) || !num(v.master) || !num(v.music) || !num(v.sfx) || !num(v.ambience)) return null;
  if (!isObj(o.bindings)) return null;
  const bindings = { ...DEFAULT_BINDINGS };
  for (const k of Object.keys(bindings) as ActionName[]) {
    const c = (o.bindings as Record<string, unknown>)[k];
    if (typeof c !== 'string') return null;
    bindings[k] = c;
  }
  if (o.custom !== null && !validGraphics(o.custom)) return null;
  return {
    version: 1,
    locale: o.locale,
    mouseSensitivity: o.mouseSensitivity,
    invertY: o.invertY,
    headBob: o.headBob,
    bindings,
    preset: o.preset as GraphicsPreset,
    custom: o.custom as GraphicsOptions | null,
    volumes: { master: v.master, music: v.music, sfx: v.sfx, ambience: v.ambience },
    subtitles: o.subtitles,
    subtitleSize: o.subtitleSize as 'S' | 'M' | 'L',
    presetAutoPicked: o.presetAutoPicked,
  };
}

function load(kv: KV): Settings {
  try {
    const raw = kv.get(SETTINGS_KEY);
    if (raw !== null) return validate(JSON.parse(raw)) ?? defaultSettings();
  } catch {
    /* fall through to defaults */
  }
  return defaultSettings();
}

export function createSettingsService(kv: KV) {
  let current = load(kv);
  const listeners = new Set<(s: Settings) => void>();
  return {
    get(): Settings {
      return current;
    },
    update(patch: Partial<Settings>): void {
      current = { ...current, ...patch, version: 1 };
      try {
        kv.set(SETTINGS_KEY, JSON.stringify(current));
      } catch {
        /* ignore */
      }
      for (const cb of [...listeners]) cb(current);
    },
    onChange(cb: (s: Settings) => void): () => void {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    effectiveGraphics(): GraphicsOptions {
      return current.custom ? { ...current.custom } : presetOptions(current.preset);
    },
  };
}
