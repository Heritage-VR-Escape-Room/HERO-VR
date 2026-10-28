/**
 * Post chain (all effects from three/addons/tsl/display):
 * scene pass (MRT) -> GTAO -> volumetric fog composite -> highlight -> bloom
 * -> AA (FXAA / SMAA / TRAA) [-> FSR 1 when renderScale < 1] -> motion blur
 * [-> DOF] -> colour grade -> ACES -> vignette -> film grain.
 */
import {
  ACESFilmicToneMapping,
  Color,
  RenderPipeline,
  SRGBColorSpace,
  type Camera,
  type PerspectiveCamera,
  type Scene,
  type WebGPURenderer,
} from 'three/webgpu';
import {
  Fn,
  convertToTexture,
  float,
  length,
  luminance,
  mix,
  mrt,
  normalView,
  output,
  pass,
  renderOutput,
  rtt,
  screenUV,
  smoothstep,
  uniform,
  vec3,
  vec4,
  velocity,
} from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { fsr1 } from 'three/addons/tsl/display/FSR1Node.js';
import { motionBlur } from 'three/addons/tsl/display/MotionBlur.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { film } from 'three/addons/tsl/display/FilmNode.js';
import type { GraphicsOptions } from '../logic/presets';
import type { VolumetricFog } from './fog';
import type { Highlight } from './highlight';
import { setClusterRenderScale } from './lighting';

export type { GraphicsOptions };

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

export const BLOOM = { threshold: 1.0, strength: 0.6, radius: 0.75 } as const;
export const GRADE_SHADOWS = '#33445E';
export const GRADE_HIGHLIGHTS = '#FFB65C';
export const VIGNETTE = 0.28;
export const FILM_GRAIN = 0.15;

export interface PostDeps {
  fog?: VolumetricFog;
  highlight?: Highlight;
}

export interface PostChain {
  render(): void;
  dispose(): void;
  /** Focus distance in metres; null turns depth of field off. */
  setDofFocus(m: number | null): void;
}

/** A tint scaled to unit luminance, so grading shifts hue without changing exposure. */
function unitTint(hex: string): N {
  const c = new Color(hex);
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return vec3(c.r / l, c.g / l, c.b / l);
}

/** Lift/gain style grade: cold blue shadows, sodium highlights (linear HDR in). */
const colorGrade = Fn(([c]: N[]) => {
  const l = luminance(c.rgb);
  const wShadow = float(1).sub(smoothstep(0.0, 0.3, l)).mul(0.45);
  const wHigh = smoothstep(0.4, 2.0, l).mul(0.3);
  const rgb = c.rgb.mul(mix(vec3(1), unitTint(GRADE_SHADOWS), wShadow)).mul(mix(vec3(1), unitTint(GRADE_HIGHLIGHTS), wHigh));
  return vec4(rgb, c.a);
});

const vignette = Fn(([c]: N[]) => {
  const d = length(screenUV.sub(0.5)).mul(Math.SQRT2);
  return vec4(c.rgb.mul(float(1).sub(smoothstep(0.35, 1.0, d).mul(VIGNETTE))), c.a);
});

export function buildPost(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
  opts: GraphicsOptions,
  deps: PostDeps = {},
): PostChain {
  const pipeline = new RenderPipeline(renderer);
  pipeline.outputColorTransform = false; // ACES + sRGB happen explicitly, before vignette and grain
  const cam = camera as PerspectiveCamera;
  const dofFocus = uniform(5);
  let dofOn = false;
  let disposables: { dispose(): void }[] = [];

  const build = (): void => {
    for (const d of disposables) d.dispose();
    disposables = [];

    const scenePass = pass(scene, camera);
    scenePass.name = 'Scene';
    disposables.push(scenePass);
    if (opts.renderScale < 1) scenePass.setResolutionScale(opts.renderScale);
    setClusterRenderScale(renderer, Math.min(1, opts.renderScale));
    const needVelocity = opts.aa === 'TAA' || opts.motionBlur;
    const targets: Record<string, N> = { output };
    if (opts.ssao) targets.normal = normalView;
    if (needVelocity) targets.velocity = velocity;
    scenePass.setMRT(mrt(targets));

    const depth = scenePass.getTextureNode('depth');
    let color: N = scenePass.getTextureNode('output');

    if (opts.ssao) {
      const aoPass: N = ao(depth, scenePass.getTextureNode('normal'), cam);
      aoPass.resolutionScale = 0.5;
      disposables.push(aoPass);
      const occlusion = aoPass.getTextureNode().sample(screenUV).r;
      color = vec4(color.rgb.mul(occlusion), color.a);
    }

    if (deps.fog) color = deps.fog.composite(color, depth);
    if (deps.highlight) color = vec4(color.rgb.add(deps.highlight.node), color.a);

    const bloomPass: N = bloom(color, BLOOM.strength, BLOOM.radius, BLOOM.threshold);
    disposables.push(bloomPass);
    color = color.add(bloomPass);

    if (opts.aa === 'FXAA') color = fxaa(color);
    else if (opts.aa === 'SMAA') color = smaa(color);
    else if (opts.aa === 'TAA') color = traa(color, depth, scenePass.getTextureNode('velocity'), cam);

    if (opts.renderScale < 1) {
      color = fsr1(rtt(color, null, null, { resolutionScale: opts.renderScale }));
    }

    if (opts.motionBlur) color = motionBlur(convertToTexture(color), scenePass.getTextureNode('velocity').mul(0.5));

    if (dofOn) {
      color = dof(color, scenePass.getViewZNode(), dofFocus, 0.08, 1.5);
    }

    color = colorGrade(color);
    color = renderOutput(color, ACESFilmicToneMapping, SRGBColorSpace);
    color = vignette(color);
    color = film(color, float(FILM_GRAIN));

    pipeline.outputNode = color;
    pipeline.needsUpdate = true;
  };

  build();
  const offFog = deps.fog?.onGraphChange(build);

  return {
    render(): void {
      deps.fog?.update();
      pipeline.render();
    },
    dispose(): void {
      offFog?.();
      for (const d of disposables) d.dispose();
      pipeline.dispose();
    },
    setDofFocus(m: number | null): void {
      if (m !== null) dofFocus.value = m;
      const want = m !== null;
      if (want !== dofOn) {
        dofOn = want;
        build();
      }
    },
  };
}
