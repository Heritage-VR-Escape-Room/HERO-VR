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
// The runtime module only has a default export for the class; @types declares it as named.
// @ts-expect-error -- default export exists at runtime
import SMAANodeClass from 'three/addons/tsl/display/SMAANode.js';
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

/** SMAA whose targets follow the scene resolution instead of the canvas. */
class ScaledSMAANode extends (SMAANodeClass as N) {
  constructor(
    input: N,
    private readonly scale: number,
  ) {
    super(input);
  }
  setSize(width: number, height: number): void {
    super.setSize(Math.max(1, Math.floor(width * this.scale)), Math.max(1, Math.floor(height * this.scale)));
  }
}

/** Disposes an effect node plus depth textures its own dispose() may leave behind. */
function disposeNode(node: N): void {
  node.dispose();
  for (const v of Object.values(node) as N[]) {
    if (v?.isRenderTarget) {
      v.depthTexture?.dispose();
      v.dispose();
      // A target that was sampled but never rendered to (gated DOF) is not known to
      // the renderer as a target, so only disposing its textures frees them.
      for (const t of v.textures as N[]) t.dispose();
    } else if (v?.isTextureNode && v.value?.isDepthTexture) {
      v.value.dispose();
    }
  }
}

/** Skip a node's per-frame passes while `active()` is false. */
function gateUpdates(node: N, active: () => boolean): void {
  const run = node.updateBefore.bind(node);
  node.updateBefore = (frame: N) => (active() ? run(frame) : undefined);
}

export interface PostDeps {
  fog?: VolumetricFog;
  highlight?: Highlight;
}

export interface PostChain {
  render(): void;
  dispose(): void;
  /** Focus distance in metres; null turns depth of field off. */
  setDofFocus(m: number | null): void;
  /**
   * Apply new graphics options. Options that change the graph's shape
   * (render scale, AA, SSAO, motion blur) rebuild the chain; others are no-ops here.
   * Returns true when it rebuilt.
   */
  setOptions(opts: GraphicsOptions): boolean;
}

/** The options that decide the post graph's shape. */
function structureKey(o: GraphicsOptions): string {
  return `${o.renderScale}|${o.aa}|${o.ssao}|${o.motionBlur}`;
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
  let pipeline!: RenderPipeline;
  const cam = camera as PerspectiveCamera;
  const dofFocus = uniform(5);
  const dofMix = uniform(0);
  let dofOn = false;
  const disposables: { dispose(): void }[] = [];

  /**
   * Runtime switches (DOF, fog tier) are uniforms and gates, never rebuilds.
   * three caches compiled node graphs by structure, so a structurally identical
   * rebuild that keeps the old pipeline can revive the disposed nodes of an
   * earlier build (measured: old scene-pass targets re-allocated on every DOF
   * toggle). A structural options change (setOptions) therefore disposes every
   * node and the pipeline and builds fresh ones; the fog material bumps its
   * program key on composite() so it cannot keep the old scene depth (and with
   * it the old scene pass). tests/e2e/menu.spec.ts checks the texture count.
   */
  const build = (opts: GraphicsOptions): void => {
    pipeline = new RenderPipeline(renderer);
    pipeline.outputColorTransform = false; // ACES + sRGB happen explicitly, before vignette and grain
    /** Every node that owns render targets is tracked, so rebuilds and dispose() free them. */
    const own = (node: N): N => {
      if (node && typeof node.dispose === 'function' && !disposables.includes(node)) disposables.push(node);
      return node;
    };
    /** convertToTexture, but the RTT it may create is owned too. */
    const tex = (node: N): N => {
      const t: N = convertToTexture(node);
      return t === node || t.isPassTextureNode ? t : own(t);
    };

    const scaled = opts.renderScale < 1;
    // TRAA keeps full-res history and copies the scene depth into it, which breaks
    // when the scene pass is scaled; below native resolution TAA becomes SMAA.
    const aaMode = scaled && opts.aa === 'TAA' ? 'SMAA' : opts.aa;

    const scenePass = own(pass(scene, camera));
    scenePass.name = 'Scene';
    if (scaled) scenePass.setResolutionScale(opts.renderScale);
    setClusterRenderScale(renderer, Math.min(1, opts.renderScale));
    const needVelocity = aaMode === 'TAA' || opts.motionBlur;
    const targets: Record<string, N> = { output };
    if (opts.ssao) targets.normal = normalView;
    if (needVelocity) targets.velocity = velocity;
    scenePass.setMRT(mrt(targets));

    const depth = scenePass.getTextureNode('depth');
    let color: N = scenePass.getTextureNode('output');

    if (opts.ssao) {
      const aoPass: N = own(ao(depth, scenePass.getTextureNode('normal'), cam));
      aoPass.resolutionScale = 0.5;
      const occlusion = aoPass.getTextureNode().sample(screenUV).r;
      color = vec4(color.rgb.mul(occlusion), color.a);
    }

    if (deps.fog) color = deps.fog.composite(color, depth);
    if (deps.highlight) color = vec4(color.rgb.add(deps.highlight.node), color.a);

    const bloomPass: N = own(bloom(color, BLOOM.strength, BLOOM.radius, BLOOM.threshold));
    color = color.add(bloomPass);

    if (scaled) {
      // Composite, bloom and AA all run at scene resolution; FSR 1 upscales the result.
      const low = own(rtt(color, null, null, { resolutionScale: opts.renderScale }));
      let aaOut: N = low;
      if (aaMode === 'FXAA') {
        aaOut = own(rtt(fxaa(low), null, null, { resolutionScale: opts.renderScale }));
      } else if (aaMode === 'SMAA') {
        const smaaNode: N = own(new ScaledSMAANode(low, opts.renderScale));
        aaOut = smaaNode.getTextureNode();
      }
      color = own(fsr1(aaOut));
    } else if (aaMode === 'FXAA') color = own(fxaa(tex(color)));
    else if (aaMode === 'SMAA') color = own(smaa(tex(color)));
    else if (aaMode === 'TAA') {
      color = own(traa(tex(color), depth, scenePass.getTextureNode('velocity'), cam));
      // TRAA swaps its 1x1 placeholder depth texture for the history depth without disposing it.
      const placeholder: N = color._previousDepthNode.value;
      own({ dispose: () => placeholder.dispose() });
    }

    if (opts.motionBlur) color = motionBlur(tex(color), scenePass.getTextureNode('velocity').mul(0.5));

    // DOF is always in the graph, but its passes (and its input copy) only run while on.
    const dofInput = tex(color);
    const dofNode: N = own(dof(dofInput, scenePass.getViewZNode(), dofFocus, 0.08, 1.5));
    gateUpdates(dofNode, () => dofOn);
    if (dofInput !== color) gateUpdates(dofInput, () => dofOn);
    color = mix(color, dofNode, dofMix);

    color = colorGrade(color);
    color = renderOutput(color, ACESFilmicToneMapping, SRGBColorSpace);
    color = vignette(color);
    color = film(color, float(FILM_GRAIN));

    pipeline.outputNode = color;
    pipeline.needsUpdate = true;
  };

  let key = structureKey(opts);
  build(opts);
  const disposeAll = (): void => {
    for (const d of disposables) disposeNode(d);
    disposables.length = 0;
    pipeline.dispose();
  };

  return {
    render(): void {
      deps.fog?.update();
      pipeline.render();
    },
    dispose: disposeAll,
    setOptions(next: GraphicsOptions): boolean {
      const k = structureKey(next);
      if (k === key) return false;
      key = k;
      disposeAll();
      build(next);
      return true;
    },
    setDofFocus(m: number | null): void {
      if (m !== null) dofFocus.value = m;
      dofOn = m !== null;
      dofMix.value = dofOn ? 1 : 0;
    },
  };
}
