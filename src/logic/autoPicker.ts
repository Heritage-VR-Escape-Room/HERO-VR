import type { GraphicsPreset } from './presets';

const ORDER: readonly GraphicsPreset[] = ['Low', 'Medium', 'High', 'Ultra'];

/** Steps down below 40 fps (floor Low), up above 90 fps (cap High, never Ultra). */
export function pickPreset(avgFps: number, current: GraphicsPreset): GraphicsPreset {
  const i = ORDER.indexOf(current);
  if (avgFps < 40) return ORDER[Math.max(0, i - 1)] ?? current;
  if (avgFps > 90 && i < ORDER.indexOf('High')) return ORDER[i + 1] ?? current;
  return current;
}
