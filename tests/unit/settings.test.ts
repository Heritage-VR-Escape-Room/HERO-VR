import { describe, it, expect } from 'vitest';
import { createSettingsService, defaultSettings } from '../../src/logic/settings';
import { presetOptions } from '../../src/logic/presets';
import { DEFAULT_BINDINGS } from '../../src/logic/bindings';
import { memoryKV } from '../../src/logic/storage';

describe('settings', () => {
  it('defaults', () => {
    const d = createSettingsService(memoryKV()).get();
    expect(d).toEqual(defaultSettings());
    expect(d.locale).toBe('en');
    expect(d.mouseSensitivity).toBe(1);
    expect(d.invertY).toBe(false);
    expect(d.headBob).toBe(true);
    expect(d.preset).toBe('Medium');
    expect(d.custom).toBeNull();
    expect(d.volumes).toEqual({ master: 1, music: 0.7, sfx: 1, ambience: 0.8 });
    expect(d.subtitles).toBe(true);
    expect(d.subtitleSize).toBe('M');
    expect(d.bindings).toEqual(DEFAULT_BINDINGS);
  });
  it('persist round-trip (locale ar, invertY true)', () => {
    const kv = memoryKV();
    createSettingsService(kv).update({ locale: 'ar', invertY: true });
    const s = createSettingsService(kv).get();
    expect(s.locale).toBe('ar');
    expect(s.invertY).toBe(true);
  });
  it('corrupt -> defaults', () => {
    const kv = memoryKV();
    kv.set('som.settings.v1', '{bad');
    expect(createSettingsService(kv).get()).toEqual(defaultSettings());
    kv.set('som.settings.v1', JSON.stringify({ version: 0, locale: 'ar' }));
    expect(createSettingsService(kv).get()).toEqual(defaultSettings());
  });
  it('malformed custom graphics -> defaults', () => {
    for (const custom of [{}, { ...presetOptions('Low'), renderScale: 'x' }, { ...presetOptions('Low'), frameCap: 45 }, { ...presetOptions('Low'), renderScale: 2 }]) {
      const kv = memoryKV();
      kv.set('som.settings.v1', JSON.stringify({ ...defaultSettings(), locale: 'ar', custom }));
      expect(createSettingsService(kv).get()).toEqual(defaultSettings());
    }
    const kv = memoryKV();
    const ok = { ...presetOptions('Low'), frameCap: 0 };
    kv.set('som.settings.v1', JSON.stringify({ ...defaultSettings(), custom: ok }));
    expect(createSettingsService(kv).get().custom).toEqual(ok);
  });
  it('presets table matches spec', () => {
    expect(presetOptions('Low')).toEqual({ renderScale: 0.67, shadows: 'Low', fog: 'Low', ssao: false, aa: 'FXAA', motionBlur: false, frameCap: 30 });
    expect(presetOptions('Medium')).toEqual({ renderScale: 0.85, shadows: 'Medium', fog: 'Medium', ssao: true, aa: 'SMAA', motionBlur: false, frameCap: 60 });
    expect(presetOptions('High')).toEqual({ renderScale: 1.0, shadows: 'High', fog: 'High', ssao: true, aa: 'TAA', motionBlur: false, frameCap: 60 });
    expect(presetOptions('Ultra')).toEqual({ renderScale: 1.0, shadows: 'High', fog: 'Ultra', ssao: true, aa: 'TAA', motionBlur: true, frameCap: 0 });
  });
  it('custom overrides preset in effectiveGraphics', () => {
    const svc = createSettingsService(memoryKV());
    expect(svc.effectiveGraphics()).toEqual(presetOptions('Medium'));
    const custom = { ...presetOptions('Low'), frameCap: 0 as const };
    svc.update({ custom });
    expect(svc.effectiveGraphics()).toEqual(custom);
  });
  it('onChange notifies and unsubscribes', () => {
    const svc = createSettingsService(memoryKV());
    let n = 0;
    const off = svc.onChange(() => n++);
    svc.update({ headBob: false });
    off();
    svc.update({ headBob: true });
    expect(n).toBe(1);
  });
});
