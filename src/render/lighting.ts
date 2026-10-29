/**
 * Night lighting rig: the moon (with quality-scaled shadows) and sodium
 * streetlamps. On WebGPU many point lights go through three's Forward+
 * ClusteredLighting; spot lights and shadow casters stay regular lights.
 */
import {
  DirectionalLight,
  MathUtils,
  Object3D,
  PointLight,
  SpotLight,
  Vector2,
  Vector3,
  type Scene,
  type WebGPURenderer,
} from 'three/webgpu';
import { ClusteredLighting } from 'three/addons/lighting/ClusteredLighting.js';
import ClusteredLightsNode from 'three/addons/tsl/lighting/ClusteredLightsNode.js';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';

export type RigQuality = 'Off' | 'Low' | 'Medium' | 'High' | 'Ultra';

export const MOON_COLOR = '#9DB3D6';
export const MOON_INTENSITY = 0.15;
export const MOON_AZIMUTH_DEG = 200;
export const MOON_ELEVATION_DEG = 35;

export const LAMP_COLOR = '#FFB65C'; // ~2200 K sodium
export const LAMP_LUMENS = 1200;
export const LAMP_RANGE_M = 9;
export const LAMP_ANGLE_DEG = 55;
export const HALO_RANGE_M = 3;
/** Halo point light output (lm): a small glow around the lamp head. */
export const HALO_LUMENS = 120;

/** Plaza centre: the pyramid stands here (spec world frame). */
export const PYRAMID_POSITION = new Vector3(0, 0, -170);

/** Lamps whose spot casts shadows, per quality. */
export const LAMP_SHADOWS: Record<RigQuality, number> = { Off: 0, Low: 0, Medium: 2, High: 4, Ultra: 4 };

/**
 * World direction for a compass bearing (clockwise from north, +Z = north,
 * so east = -X) and an elevation above the horizon.
 */
export function bearingDirection(azimuthDeg: number, elevationDeg: number, out = new Vector3()): Vector3 {
  const az = MathUtils.degToRad(azimuthDeg);
  const el = MathUtils.degToRad(elevationDeg);
  return out.set(-Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

export interface Lamp {
  /** Lamp head (light source) position. */
  readonly position: Vector3;
  readonly spot: SpotLight;
  readonly halo: PointLight;
}

export interface LightingRig {
  /** The current moon. setQuality replaces it, so read it each time. */
  readonly moon: DirectionalLight;
  readonly lamps: readonly Lamp[];
  addStreetlamp(head: Vector3): Lamp;
  /** Shadows only on the n lamps nearest the pyramid. */
  setLampShadows(n: number): void;
  /**
   * Change shadow quality at runtime: rebuilds the moon (map size, CSM) and the
   * lamp shadow count. Returns true when the light set changed, so the fog
   * must re-collect its lights (VolumetricFog.syncLights).
   */
  setQuality(q: RigQuality): boolean;
  getQuality(): RigQuality;
  /** Keep the moon's single shadow map centred on the viewer. */
  update(viewer: Vector3): void;
  /** Removes every light and gives the renderer back its previous lighting and shadow setting. */
  dispose(): void;
}

/**
 * Clustered lights sized to the scene pass (canvas size x render scale), not
 * the canvas, so the cluster grid matches screenCoordinate when the scene
 * renders below canvas resolution. Stock ClusteredLighting assumes full size.
 */
class ScaledClusteredLightsNode extends ClusteredLightsNode {
  private static readonly size = new Vector2();
  constructor(
    private readonly owner: ScaledClusteredLighting,
    ...args: ConstructorParameters<typeof ClusteredLightsNode>
  ) {
    super(...args);
  }
  updateProgram(renderer: WebGPURenderer): void {
    const self = this as unknown as {
      _bufferSize: Vector2 | null;
      getBufferFitSize(v: number): number;
      create(w: number, h: number): void;
    };
    const s = renderer.getDrawingBufferSize(ScaledClusteredLightsNode.size);
    const w = self.getBufferFitSize(Math.floor(s.x * this.owner.renderScale));
    const h = self.getBufferFitSize(Math.floor(s.y * this.owner.renderScale));
    const cur = self._bufferSize;
    if (cur === null || cur.width !== w || cur.height !== h) self.create(w, h);
  }
}

class ScaledClusteredLighting extends ClusteredLighting {
  renderScale = 1;
  override createNode(lights = []): ClusteredLightsNode {
    return new ScaledClusteredLightsNode(this, this.maxLights, this.tileSize, this.zSlices, this.maxLightsPerCluster).setLights(lights);
  }
}

/** Tell the clustered lighting (if active) the scene pass resolution scale. */
export function setClusterRenderScale(renderer: WebGPURenderer, scale: number): void {
  if (renderer.lighting instanceof ScaledClusteredLighting) renderer.lighting.renderScale = scale;
}

const SINGLE_MAP_HALF_EXTENT = 40;

export function createLightingRig(scene: Scene, renderer: WebGPURenderer, quality: RigQuality): LightingRig {
  const isWebGPU = (renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend === true;
  const prevLighting = renderer.lighting;
  const prevShadows = renderer.shadowMap.enabled;
  // Forward+ clustering needs compute + storage buffers: WebGPU only.
  if (isWebGPU) renderer.lighting = new ScaledClusteredLighting();

  const moonDir = bearingDirection(MOON_AZIMUTH_DEG, MOON_ELEVATION_DEG);
  let moon!: DirectionalLight;
  let csm: CSMShadowNode | null = null;

  /** A fresh moon configured for `quality` (shadow map size, CSM or a single map). */
  const buildMoon = (): void => {
    moon = new DirectionalLight(MOON_COLOR, MOON_INTENSITY);
    moon.name = 'Moon';
    moon.position.copy(moonDir).multiplyScalar(100);
    csm = null;
    if (quality !== 'Off') {
      moon.castShadow = true;
      const cam = moon.shadow.camera;
      if (quality === 'High' || quality === 'Ultra') {
        moon.shadow.mapSize.set(2048, 2048);
        cam.near = 1;
        cam.far = 400;
        csm = new CSMShadowNode(moon, { cascades: 3, maxFar: 150, mode: 'practical', lightMargin: 60 });
        moon.shadow.shadowNode = csm;
      } else {
        const size = quality === 'Medium' ? 2048 : 1024;
        moon.shadow.mapSize.set(size, size);
        cam.left = cam.bottom = -SINGLE_MAP_HALF_EXTENT;
        cam.right = cam.top = SINGLE_MAP_HALF_EXTENT;
        cam.near = 1;
        cam.far = 250;
        cam.updateProjectionMatrix();
      }
      moon.shadow.bias = -0.0005;
      moon.shadow.normalBias = 0.02;
    }
    scene.add(moon, moon.target);
  };
  const disposeMoon = (): void => {
    scene.remove(moon, moon.target);
    // CSMShadowNode.dispose leaves its per-cascade shadow nodes (and their maps) alive.
    for (const n of (csm as unknown as { _shadowNodes?: { dispose(): void }[] } | null)?._shadowNodes ?? []) n.dispose();
    csm?.dispose();
    csm = null;
    moon.dispose(); // also frees the shadow map its light node owns
  };

  renderer.shadowMap.enabled = quality !== 'Off';
  buildMoon();

  const lamps: Lamp[] = [];
  let lampShadowCount = LAMP_SHADOWS[quality];
  const root = new Object3D();
  root.name = 'Streetlamps';
  scene.add(root);

  const applyLampShadows = (): void => {
    const order = [...lamps].sort(
      (a, b) => a.position.distanceToSquared(PYRAMID_POSITION) - b.position.distanceToSquared(PYRAMID_POSITION),
    );
    order.forEach((lamp, i) => {
      lamp.spot.castShadow = renderer.shadowMap.enabled && i < lampShadowCount;
    });
  };

  const rig: LightingRig = {
    get moon() {
      return moon;
    },
    lamps,
    addStreetlamp(head: Vector3): Lamp {
      const spot = new SpotLight(LAMP_COLOR);
      spot.power = LAMP_LUMENS;
      spot.distance = LAMP_RANGE_M;
      spot.angle = MathUtils.degToRad(LAMP_ANGLE_DEG);
      spot.penumbra = 0.6;
      spot.decay = 2;
      spot.position.copy(head);
      spot.target.position.copy(head).add(new Vector3(0, -1, 0));
      spot.shadow.mapSize.set(512, 512);
      spot.shadow.camera.near = 0.2;
      spot.shadow.camera.far = LAMP_RANGE_M;
      spot.shadow.bias = -0.0008;

      const halo = new PointLight(LAMP_COLOR);
      halo.power = HALO_LUMENS;
      halo.distance = HALO_RANGE_M;
      halo.decay = 2;
      halo.position.copy(head).add(new Vector3(0, 0.05, 0));

      root.add(spot, spot.target, halo);
      const lamp: Lamp = { position: head.clone(), spot, halo };
      lamps.push(lamp);
      applyLampShadows();
      return lamp;
    },
    setLampShadows(n: number): void {
      lampShadowCount = Math.max(0, Math.floor(n));
      applyLampShadows();
    },
    setQuality(q: RigQuality): boolean {
      if (q === quality) return false;
      quality = q;
      disposeMoon();
      renderer.shadowMap.enabled = q !== 'Off';
      buildMoon();
      lampShadowCount = LAMP_SHADOWS[q];
      applyLampShadows();
      return true;
    },
    getQuality: () => quality,
    update(viewer: Vector3): void {
      if (csm || quality === 'Off') return;
      // Snap to shadow texels so the single map doesn't shimmer as the viewer moves.
      const texel = (SINGLE_MAP_HALF_EXTENT * 2) / moon.shadow.mapSize.x;
      const x = Math.round(viewer.x / texel) * texel;
      const z = Math.round(viewer.z / texel) * texel;
      moon.target.position.set(x, 0, z);
      moon.position.copy(moonDir).multiplyScalar(100).add(moon.target.position);
    },
    dispose(): void {
      disposeMoon();
      scene.remove(root);
      for (const l of lamps) {
        l.spot.dispose();
        l.halo.dispose();
      }
      lamps.length = 0;
      renderer.lighting = prevLighting;
      renderer.shadowMap.enabled = prevShadows;
    },
  };
  return rig;
}
