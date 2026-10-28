/**
 * Volumetric fog quality tiers. Quality only changes how finely the fog is
 * sampled (resolution, raymarch steps, temporal accumulation); it never
 * changes the fog's density.
 */
export type FogQuality = 'WebGL2Safe' | 'Low' | 'Medium' | 'High' | 'Ultra';

export interface FogParams {
  /** Fog buffer resolution relative to the drawing buffer. */
  resolutionScale: number;
  /** Raymarch steps per fog pixel. */
  steps: number;
  /** Accumulate jittered fog over frames (reprojected history). */
  temporal: boolean;
}

export const FOG_QUALITIES: readonly FogQuality[] = ['WebGL2Safe', 'Low', 'Medium', 'High', 'Ultra'];

const TABLE: Record<FogQuality, FogParams> = {
  WebGL2Safe: { resolutionScale: 0.25, steps: 12, temporal: false },
  Low: { resolutionScale: 0.33, steps: 16, temporal: true },
  Medium: { resolutionScale: 0.5, steps: 24, temporal: true },
  High: { resolutionScale: 0.5, steps: 48, temporal: true },
  Ultra: { resolutionScale: 1.0, steps: 64, temporal: true },
};

export function fogParams(q: FogQuality): FogParams {
  return { ...TABLE[q] };
}

export function isFogQuality(v: unknown): v is FogQuality {
  return typeof v === 'string' && (FOG_QUALITIES as readonly string[]).includes(v);
}
