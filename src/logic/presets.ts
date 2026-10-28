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
