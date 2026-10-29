/**
 * Volumetric fog: a camera-following box drawn with a VolumeNodeMaterial whose
 * lighting model raymarches from the camera to the nearest opaque surface,
 * scattering the lamps (with their cones and shadows, through three's own
 * light nodes) and the moon, and attenuating by a drifting 3D-noise density
 * with a height falloff. Output per fog pixel is vec4(inscatter, transmittance),
 * rendered at the quality's resolution scale, optionally accumulated over
 * frames, then upsampled depth-aware and composited as scene * T + inscatter.
 *
 * Density is a constant of the fog. Quality only changes sampling.
 */
import {
  BackSide,
  BoxGeometry,
  Color,
  Data3DTexture,
  DirectionalLight,
  Layers,
  LightingModel,
  LinearFilter,
  Matrix4,
  Mesh,
  NodeMaterial,
  NodeUpdateType,
  NoBlending,
  PerspectiveCamera,
  QuadMesh,
  RedFormat,
  RenderTarget,
  RendererUtils,
  RepeatWrapping,
  TempNode,
  Vector2,
  Vector3,
  VolumeNodeMaterial,
  HalfFloatType,
  type Light,
  type Scene,
  type WebGPURenderer,
} from 'three/webgpu';
import {
  Fn,
  If,
  Loop,
  abs,
  cameraFar,
  cameraNear,
  cameraPosition,
  cameraViewMatrix,
  diffuseColor,
  exp,
  float,
  fract,
  getScreenPosition,
  getViewPosition,
  interleavedGradientNoise,
  ivec2,
  lights,
  max,
  min,
  mix,
  pass,
  passTexture,
  perspectiveDepthToViewZ,
  positionWorld,
  property,
  reference,
  screenCoordinate,
  screenUV,
  texture,
  texture3D,
  textureLoad,
  textureSize,
  time,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { fogParams, type FogQuality } from '../logic/fogQuality';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

/** Layer the fog volume lives on; the main scene pass never sees it. */
export const FOG_LAYER = 10;
/** Compound-7 tint (spec §9). */
export const FOG_TINT = new Color('#8E9A86');

/** Extinction coefficient (1/m) at ground level, mean noise. Never changes at runtime. */
const FOG_DENSITY = 0.05;
/** Fraction of extinction that is scattering (rest absorbed). */
const ALBEDO = 0.92;
/** Wind drift of the noise field, m/s (speed 0.15). */
const WIND = new Vector3(0.12, 0, 0.09);
/** Full density below this height, exponential falloff above. */
const DENSE_BELOW_M = 6;
const FALLOFF_SCALE_M = 6;
/** Fog volume extents around the camera (m). */
const VOLUME_HALF_XZ = 45;
const VOLUME_BOTTOM_Y = -4;
const VOLUME_TOP_Y = 30;
/** Henyey-Greenstein anisotropy: forward scattering makes halos around lamps. */
const PHASE_G = 0.45;
/** Ambient radiance lighting the fog (skylight + diffuse moonlight), linear. */
const AMBIENT_LEVEL = 0.07;
/** Moonlight's share of fog in-scatter (diffuse sky already covers most of it). */
const MOON_SCATTER = 0.6;

const HALTON = Array.from({ length: 16 }, (_, i) => [halton(i + 1, 2), halton(i + 1, 3)] as const);

function halton(index: number, base: number): number {
  let r = 0;
  let f = 1;
  while (index > 0) {
    f /= base;
    r += f * (index % base);
    index = Math.floor(index / base);
  }
  return r;
}

/** Tileable 3D value-noise fBm (3 octaves) packed into a 64^3 R8 texture. */
function createNoiseTexture(size = 64): Data3DTexture {
  const lattice = (period: number, seed: number): Float32Array => {
    const a = new Float32Array(period * period * period);
    let s = seed >>> 0;
    for (let i = 0; i < a.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      a[i] = s / 4294967296;
    }
    return a;
  };
  const octave = (period: number, seed: number) => {
    const lat = lattice(period, seed);
    const at = (x: number, y: number, z: number) =>
      lat[((z % period) * period + (y % period)) * period + (x % period)]!;
    const fade = (t: number) => t * t * (3 - 2 * t);
    return (x: number, y: number, z: number): number => {
      const fx = (x / size) * period;
      const fy = (y / size) * period;
      const fz = (z / size) * period;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const z0 = Math.floor(fz);
      const tx = fade(fx - x0);
      const ty = fade(fy - y0);
      const tz = fade(fz - z0);
      const l = (a: number, b: number, t: number) => a + (b - a) * t;
      const c = (dx: number, dy: number, dz: number) => at(x0 + dx, y0 + dy, z0 + dz);
      return l(
        l(l(c(0, 0, 0), c(1, 0, 0), tx), l(c(0, 1, 0), c(1, 1, 0), tx), ty),
        l(l(c(0, 0, 1), c(1, 0, 1), tx), l(c(0, 1, 1), c(1, 1, 1), tx), ty),
        tz,
      );
    };
  };
  const o1 = octave(4, 7);
  const o2 = octave(8, 13);
  const o3 = octave(16, 29);
  const data = new Uint8Array(size * size * size);
  let i = 0;
  for (let z = 0; z < size; z++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const v = o1(x, y, z) * 0.57 + o2(x, y, z) * 0.29 + o3(x, y, z) * 0.14;
        data[i++] = Math.max(0, Math.min(255, Math.round(v * 255)));
      }
  const tex = new Data3DTexture(data, size, size, size);
  tex.format = RedFormat;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.wrapR = RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

interface FogShaderInputs {
  steps: N; // uniform int
  jitter: N; // uniform vec2, per-frame Halton offset (0 when not temporal)
  moonDir: N; // uniform vec3, world direction toward the moon
  moonColor: N; // uniform color (linear, intensity applied)
  noise: Data3DTexture;
  /** Scene depth (perspective, 0..1) at the fog fragment; set once the post chain exists. */
  depth: { node: N | null };
}

const inscatter = property('vec3');
const lampLight = property('vec3');
const transmittance = property('float');

function hg(cosTheta: N, g: number): N {
  const g2 = g * g;
  const denom = float(1 + g2).sub(float(2 * g).mul(cosTheta));
  return float((1 - g2) / (4 * Math.PI)).div(denom.mul(denom.sqrt()));
}

/** Raymarch from the camera to min(volume back face, opaque surface). */
class FogLightingModel extends LightingModel {
  private rayDirView: N = null;

  constructor(private readonly inputs: FogShaderInputs) {
    super();
  }

  densityAt(p: N): N {
    const { noise } = this.inputs;
    const drift = vec3(WIND.x, WIND.y, WIND.z).mul(time);
    const q = p.sub(drift);
    const n1 = texture3D(noise, q.mul(1 / 48), 0).r;
    const n2 = texture3D(noise, q.mul(1 / 17).add(vec3(0.31, 0.17, 0.53)), 0).r;
    // Two scales of billows; mean ~1 so the average density equals FOG_DENSITY.
    const billow = n1.mul(0.7).add(n2.mul(0.3)).mul(3.2).sub(0.6).max(0.2);
    const height = exp(max(p.y.sub(DENSE_BELOW_M), 0).div(-FALLOFF_SCALE_M));
    return billow.mul(height).mul(FOG_DENSITY);
  }

  override start(builder: N): void {
    const { steps, jitter, moonDir, moonColor, depth } = this.inputs;

    const toBack = positionWorld.sub(cameraPosition);
    const backDist = toBack.length();
    const rayDir = toBack.div(backDist).toVar();
    const rayDirView = cameraViewMatrix.mul(vec4(rayDir, 0)).xyz.toVar();
    this.rayDirView = rayDirView;

    const marchDist = backDist.toVar();
    const hitSurface = float(0).toVar();
    if (depth.node) {
      const d = depth.node;
      const sceneViewZ = perspectiveDepthToViewZ(d, cameraNear, cameraFar);
      const sceneDist = sceneViewZ.div(rayDirView.z);
      If(d.lessThan(0.99999).and(sceneDist.lessThan(backDist)), () => {
        marchDist.assign(sceneDist);
        hitSurface.assign(1);
      });
    }

    const stepSize = marchDist.div(float(steps)).toVar();
    const offset = fract(interleavedGradientNoise(screenCoordinate.add(jitter.mul(97))).add(jitter.x));
    const dist = offset.mul(stepSize).toVar();

    inscatter.assign(vec3(0));
    transmittance.assign(1);

    // Scattering colour: the Compound-7 tint, normalised so its brightest channel is 1.
    const tmax = Math.max(FOG_TINT.r, FOG_TINT.g, FOG_TINT.b);
    const tint = vec3(FOG_TINT.r / tmax, FOG_TINT.g / tmax, FOG_TINT.b / tmax);
    const moonPhase = hg(rayDir.dot(moonDir), PHASE_G);
    const ambient = vec3(AMBIENT_LEVEL).add(moonColor.mul(moonPhase));

    Loop(steps, () => {
      const p = cameraPosition.add(rayDir.mul(dist));
      const pView = cameraViewMatrix.mul(vec4(p, 1)).xyz;
      builder.context.positionWorld = p;
      builder.context.shadowPositionWorld = p;
      builder.context.positionView = pView;

      lampLight.assign(vec3(0));
      super.start(builder); // every light calls direct() at p

      const sigmaT = this.densityAt(p);
      const source = lampLight.add(ambient).mul(tint).mul(ALBEDO);
      const stepT = exp(sigmaT.negate().mul(stepSize));
      // Energy-conserving step integration (Hillaire 2015).
      inscatter.addAssign(source.mul(transmittance).mul(float(1).sub(stepT)));
      transmittance.mulAssign(stepT);
      dist.addAssign(stepSize);
    });

    // Rays that leave the volume without hitting anything continue into fog.
    If(hitSurface.equal(0), () => {
      const exitY = cameraPosition.y.add(rayDir.y.mul(marchDist));
      const exitHeight = exp(max(exitY.sub(DENSE_BELOW_M), 0).div(-FALLOFF_SCALE_M));
      const restT = exp(float(-FOG_DENSITY * 60).mul(exitHeight).div(max(rayDir.y, 0.05).mul(4).add(1)));
      inscatter.addAssign(ambient.mul(tint).mul(ALBEDO).mul(transmittance).mul(float(1).sub(restT)));
      transmittance.mulAssign(restT);
    });
  }

  override direct({ lightNode, lightColor, lightDirection }: N): void {
    if (lightNode.isAnalyticLightNode !== true) return;
    // The moon is handled analytically in start(); lamps scatter here.
    if (lightNode.light?.isDirectionalLight) return;
    const phase = hg(lightDirection.dot(this.rayDirView), PHASE_G);
    lampLight.addAssign(lightColor.xyz.mul(phase));
  }

  override finish(builder: N): void {
    builder.context.outgoingLight.assign(inscatter);
    diffuseColor.a.assign(transmittance);
  }
}

class FogVolumeMaterial extends VolumeNodeMaterial {
  /**
   * Bumped whenever the lighting model's inputs change shape (a new scene
   * depth node). The model is not a material property, so without this a
   * recompile would hit three's structural program cache and keep the old
   * graph, which keeps the old scene pass alive.
   */
  revision = 0;

  constructor(private readonly model: FogLightingModel) {
    super();
    this.transparent = true;
    this.blending = NoBlending;
    this.side = BackSide;
    this.depthTest = false;
    this.depthWrite = false;
  }
  override setupLightingModel(): N {
    return this.model;
  }

  override customProgramCacheKey(): string {
    return `${super.customProgramCacheKey()}|fog-${this.revision}`;
  }
}

/**
 * Fog-resolution resolve: a depth-aware 3x3 tent over the raw raymarch, then
 * (when temporal) a blend with last frame's result reprojected through the
 * surface the fog ray ends on, clamped to the new 3x3 neighbourhood.
 */
class FogResolveNode extends TempNode {
  private curRT = new RenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType });
  private prevRT = new RenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType });
  private readonly outTex: N;
  private readonly historyTex: N;
  private readonly quad = new QuadMesh(undefined as N);
  private readonly material = new NodeMaterial();
  private readonly invProj = uniform(new Matrix4());
  private readonly camWorld = uniform(new Matrix4());
  private readonly prevView = uniform(new Matrix4());
  private readonly prevProj = uniform(new Matrix4());
  private readonly blend = uniform(1);
  private rendererState: N;
  private hasHistory = false;

  constructor(
    private readonly input: N,
    private readonly depth: N,
    private readonly camera: PerspectiveCamera,
    /** Switching tiers flips this; the graph never changes shape. */
    public temporal: boolean,
  ) {
    super('vec4');
    this.outTex = passTexture(this as N, this.curRT.texture);
    this.historyTex = texture(this.prevRT.texture);
    this.updateBeforeType = NodeUpdateType.FRAME;
  }

  getTextureNode(): N {
    return this.outTex;
  }

  reset(): void {
    this.hasHistory = false;
  }

  override updateBefore(frame: N): undefined {
    const renderer = frame.renderer as WebGPURenderer;
    const img = this.input.value.image as { width: number; height: number };
    if (this.curRT.width !== img.width || this.curRT.height !== img.height) {
      this.curRT.setSize(img.width, img.height);
      this.prevRT.setSize(img.width, img.height);
      this.hasHistory = false;
    }
    this.invProj.value.copy(this.camera.projectionMatrixInverse);
    this.camWorld.value.copy(this.camera.matrixWorld);
    this.blend.value = this.temporal && this.hasHistory ? 0.12 : 1;

    this.rendererState = RendererUtils.resetRendererState(renderer, this.rendererState);
    this.outTex.value = this.curRT.texture;
    this.historyTex.value = this.prevRT.texture;
    renderer.setRenderTarget(this.curRT);
    this.quad.material = this.material;
    this.quad.render(renderer);
    RendererUtils.restoreRendererState(renderer, this.rendererState);

    // The resolved frame becomes next frame's history.
    const t = this.prevRT;
    this.prevRT = this.curRT;
    this.curRT = t;
    this.outTex.value = this.prevRT.texture;
    this.prevView.value.copy(this.camera.matrixWorldInverse);
    this.prevProj.value.copy(this.camera.projectionMatrix);
    this.hasHistory = true;
    return undefined;
  }

  override setup(builder: N): N {
    const input = this.input;
    // Keep the fog pass in the pipeline graph so it renders before this node.
    builder.getNodeProperties(this).input = input;
    const near = reference('near', 'float', this.camera);
    const far = reference('far', 'float', this.camera);
    const linear = (d: N): N => perspectiveDepthToViewZ(d, near, far).negate();
    const resolve = Fn(() => {
      const uvNode = uv();
      const size = textureSize(input) as N;
      const texel = vec2(1).div(vec2(size));
      const center = input.sample(uvNode).toVar();
      const zc = linear(this.depth.sample(uvNode).r).toVar();
      const lo = center.toVar();
      const hi = center.toVar();
      // Depth-aware 3x3 tent: smooths the per-pixel ray dither without bleeding across silhouettes.
      const sum = center.mul(4).toVar();
      const wsum = float(4).toVar();
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
        [-1, -1],
        [1, 1],
        [-1, 1],
        [1, -1],
      ] as const) {
        const o = uvNode.add(texel.mul(vec2(dx, dy)));
        const s = input.sample(o);
        lo.assign(min(lo, s));
        hi.assign(max(hi, s));
        const z = linear(this.depth.sample(o).r);
        const w = float(dx === 0 || dy === 0 ? 2 : 1).div(abs(z.sub(zc)).div(zc.max(0.1)).mul(30).add(1));
        sum.addAssign(s.mul(w));
        wsum.addAssign(w);
      }
      const cur = sum.div(wsum).toVar();
      // Reproject through the fog ray's end point (clamped to the fog's reach).
      const d = this.depth.sample(uvNode).r;
      const viewPos = getViewPosition(uvNode, min(d, 0.9999), this.invProj).toVar();
      const len = viewPos.length();
      viewPos.mulAssign(min(len, 40).div(len));
      const world = this.camWorld.mul(vec4(viewPos, 1)).xyz;
      const prevUV = getScreenPosition(this.prevView.mul(vec4(world, 1)).xyz, this.prevProj).toVar();
      const inside = prevUV.x.greaterThanEqual(0).and(prevUV.x.lessThanEqual(1)).and(prevUV.y.greaterThanEqual(0)).and(prevUV.y.lessThanEqual(1));
      const hist = min(max(this.historyTex.sample(prevUV), lo), hi);
      const a = inside.select(this.blend, float(1));
      return mix(hist, cur, a);
    });
    this.material.fragmentNode = resolve();
    this.material.name = 'FogResolve';
    return this.outTex;
  }

  override dispose(): void {
    this.curRT.dispose();
    this.prevRT.dispose();
    this.material.dispose();
    super.dispose();
  }
}

/**
 * Joint-bilateral upsample: the 4 low-res fog texels around a full-res pixel,
 * weighted bilinearly and by how close their scene depth is to the pixel's.
 */
const bilateralUpsample = Fn(([fogTex, depthTex, fullUV, near, far]: N[]) => {
  const toLinear = (d: N) => perspectiveDepthToViewZ(d, near, far).negate();
  const zc = toLinear(depthTex.sample(fullUV).r).toVar();
  const size = vec2(textureSize(fogTex) as N);
  const pos = fullUV.mul(size).sub(0.5);
  const base = pos.floor();
  const f = pos.sub(base);
  const acc = vec4(0).toVar();
  const wsum = float(0).toVar();
  for (const [ox, oy] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as const) {
    const texelI = ivec2(base.add(vec2(ox, oy)).clamp(vec2(0), size.sub(1)));
    const tuv = vec2(texelI).add(0.5).div(size);
    const z = toLinear(depthTex.sample(tuv).r);
    const wb = (ox ? f.x : f.x.oneMinus()).mul(oy ? f.y : f.y.oneMinus());
    const wd = float(1).div(abs(z.sub(zc)).div(zc.max(0.1)).mul(20).add(0.05));
    const w = wb.mul(wd).add(1e-4);
    acc.addAssign(textureLoad(fogTex, texelI).mul(w));
    wsum.addAssign(w);
  }
  return acc.div(wsum);
});

export class VolumetricFog {
  /** Extinction at ground level (1/m). Read-only: the fog never thins. */
  readonly density = FOG_DENSITY;

  private readonly mesh: Mesh;
  private readonly material: FogVolumeMaterial;
  private readonly inputs: FogShaderInputs;
  private readonly fogPass: N;
  private quality: FogQuality = 'High';
  private frame = 0;
  private resolveNode: FogResolveNode | null = null;
  private moon: DirectionalLight | null = null;
  /** Debug-only switch (aerial view): composite passes the scene through. Density is untouched. */
  private readonly bypass = uniform(0);
  /** Post-pass nodes run on a fullscreen quad, so they read the real camera by reference. */
  private readonly camNear: N;
  private readonly camFar: N;

  constructor(
    _renderer: WebGPURenderer,
    private readonly scene: Scene,
    private readonly camera: PerspectiveCamera,
  ) {
    this.camNear = reference('near', 'float', camera);
    this.camFar = reference('far', 'float', camera);
    this.inputs = {
      steps: uniform(48, 'int'),
      jitter: uniform(new Vector2()),
      moonDir: uniform(new Vector3(0, 1, 0)),
      moonColor: uniform(new Color(0, 0, 0)),
      noise: createNoiseTexture(),
      depth: { node: null },
    };
    this.material = new FogVolumeMaterial(new FogLightingModel(this.inputs));
    this.material.name = 'VolumetricFog';

    const geo = new BoxGeometry(VOLUME_HALF_XZ * 2, VOLUME_TOP_Y - VOLUME_BOTTOM_Y, VOLUME_HALF_XZ * 2);
    this.mesh = new Mesh(geo, this.material);
    this.mesh.name = 'VolumetricFogVolume';
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true; // lamps cast shadows into the fog
    this.mesh.layers.set(FOG_LAYER);
    scene.add(this.mesh);

    const layers = new Layers();
    layers.set(FOG_LAYER);
    this.fogPass = pass(scene, camera, { depthBuffer: false });
    this.fogPass.name = 'Volumetric Fog';
    this.fogPass.setLayers(layers);

    this.syncLights();
    this.setQuality('High');
  }

  /** Re-collect the lights that scatter in the fog (moon + every point/spot lamp). */
  syncLights(): void {
    const list: Light[] = [];
    let moon: DirectionalLight | null = null;
    this.scene.traverse((o) => {
      const l = o as Light;
      if ((l as DirectionalLight).isDirectionalLight && !moon) moon = l as DirectionalLight;
      if (((l as N).isPointLight || (l as N).isSpotLight) && l.userData.fogScatter !== false) list.push(l);
    });
    // The moon stays in the list so the lighting model always runs, even with no lamps.
    if (moon) list.unshift(moon);
    // The fog pass draws with only FOG_LAYER enabled; lights are layer-filtered too.
    for (const l of list) l.layers.enable(FOG_LAYER);
    this.material.lightsNode = lights(list) as N;
    this.material.needsUpdate = true;
    this.moon = moon;
  }

  setQuality(q: FogQuality): void {
    const p = fogParams(q);
    this.quality = q;
    this.inputs.steps.value = p.steps;
    this.fogPass.setResolutionScale(p.resolutionScale);
    if (this.resolveNode) {
      this.resolveNode.temporal = p.temporal;
      this.resolveNode.reset();
    }
  }

  getQuality(): FogQuality {
    return this.quality;
  }

  /**
   * Builds the composite node: scene * transmittance + inscatter, with the fog
   * upsampled depth-aware from its own resolution. `sceneDepth` is the main
   * pass depth texture node.
   */
  composite(sceneColor: N, sceneDepth: N): N {
    this.inputs.depth.node = sceneDepth.sample(screenUV).r;
    this.material.revision++;
    this.material.needsUpdate = true;
    this.resolveNode?.dispose();
    this.resolveNode = new FogResolveNode(this.fogPass.getTextureNode(), sceneDepth, this.camera, fogParams(this.quality).temporal);
    const fogTex: N = this.resolveNode.getTextureNode();
    return Fn(() => {
      const base = sceneColor.toVar();
      const fog = bilateralUpsample(fogTex, sceneDepth, screenUV, this.camNear, this.camFar);
      const fogged = vec4(base.rgb.mul(fog.a).add(fog.rgb), base.a);
      return mix(fogged, base, this.bypass);
    })();
  }

  /**
   * Debug views only (e.g. the 400 m aerial, far above the fog volume): show
   * the scene without fog. The fog's density is not touched.
   */
  setDebugBypass(on: boolean): void {
    this.bypass.value = on ? 1 : 0;
    this.mesh.visible = !on; // the fog pass then draws nothing
  }

  debugBypass(): boolean {
    return this.bypass.value === 1;
  }

  /** Per-frame update (before rendering): volume position, temporal jitter, moon. */
  update(): void {
    this.follow();
    const temporal = fogParams(this.quality).temporal;
    const h = HALTON[this.frame++ % HALTON.length]!;
    this.inputs.jitter.value.set(temporal ? h[0] : 0, temporal ? h[1] : 0);
    if (this.moon) {
      this.inputs.moonDir.value.copy(this.moon.position).sub(this.moon.target.position).normalize();
      this.inputs.moonColor.value.copy(this.moon.color).multiplyScalar(this.moon.intensity * MOON_SCATTER);
    }
  }

  private follow(): void {
    this.mesh.position.set(
      this.camera.position.x,
      (VOLUME_TOP_Y + VOLUME_BOTTOM_Y) / 2,
      this.camera.position.z,
    );
    this.mesh.updateMatrixWorld();
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.inputs.noise.dispose();
    this.resolveNode?.dispose();
    this.fogPass.dispose();
  }
}
