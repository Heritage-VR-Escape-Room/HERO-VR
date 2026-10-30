/**
 * Graphics options. Task 3 defines the shape (type only); Task 4 adds the
 * Low/Medium/High/Ultra preset values and the settings service on top.
 */
import type { FogQuality } from './fogQuality';

export type ShadowSetting = 'Off' | 'Low' | 'Medium' | 'High';
export type AASetting = 'Off' | 'FXAA' | 'SMAA' | 'TAA';
export type FrameCap = 30 | 60 | 0;

export interface GraphicsOptions {
  /** Scene render resolution relative to the canvas; below 1 upscales with FSR 1. */
  renderScale: number;
  shadows: ShadowSetting;
  fog: FogQuality;
  ssao: boolean;
  aa: AASetting;
  motionBlur: boolean;
  /** 0 = unlimited. */
  frameCap: FrameCap;
}

export type GraphicsPreset = 'Low' | 'Medium' | 'High' | 'Ultra';

export const GRAPHICS_PRESETS: readonly GraphicsPreset[] = ['Low', 'Medium', 'High', 'Ultra'];

const TABLE: Record<GraphicsPreset, GraphicsOptions> = {
  Low: { renderScale: 0.67, shadows: 'Off', fog: 'Low', ssao: false, aa: 'FXAA', motionBlur: false, frameCap: 30 },
  Medium: { renderScale: 0.85, shadows: 'Low', fog: 'Medium', ssao: true, aa: 'SMAA', motionBlur: false, frameCap: 60 },
  High: { renderScale: 1.0, shadows: 'High', fog: 'High', ssao: true, aa: 'TAA', motionBlur: false, frameCap: 60 },
  Ultra: { renderScale: 1.0, shadows: 'High', fog: 'Ultra', ssao: true, aa: 'TAA', motionBlur: true, frameCap: 0 },
};

export function presetOptions(p: GraphicsPreset): GraphicsOptions {
  return { ...TABLE[p] };
}

/** Texture resolution per preset: 1k sets fit integrated GPUs; 4k only on Ultra. */
export function textureResFor(p: GraphicsPreset): '1k' | '2k' | '4k' {
  return p === 'Ultra' ? '4k' : p === 'High' ? '2k' : '1k';
}
