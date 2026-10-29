/**
 * Garden dressing: the tree belts, the fountain and the Schlossgartenbahn.
 *
 * Trees: one InstancedMesh per species, LOD and material part. Every frame
 * the trees are bucketed on the CPU by distance and view frustum: LOD0 (the
 * full model, casts moon shadows) near, LOD1 (meshopt-simplified at load)
 * out to the impostor distance, and beyond that a single-draw billboard mesh
 * whose texture is rendered from the model at load. The impostor shader
 * hides any billboard nearer than the impostor distance.
 *
 * Draw calls for trees: species x parts x 2 LODs (6) + one impostor mesh per species (2).
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Frustum,
  Group,
  HalfFloatType,
  InstancedMesh,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardMaterial,
  MeshStandardNodeMaterial,
  OrthographicCamera,
  Quaternion,
  RenderTarget,
  Scene,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type Camera,
  type Material,
  type WebGPURenderer,
} from 'three/webgpu';
import { attribute, cameraPosition, cameraWorldMatrix, cos, positionLocal, sin, step, texture, time, transformNormalToView, uniform, uv, vec3 } from 'three/tsl';
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';
import { bearingVector, heightAt, placeTrees, plazaDistance, railRadius, SLICE_RADIUS, type TreeSpot } from '../logic/worldLayout';
import { loadModel } from './assets';
import type { PhysicsWorld } from './colliders';

/** Trunk collider radius at scale 1 (m); only trees the player can reach (inside the slice) get one. */
const TRUNK_RADIUS_M = 0.4;

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

export type TreeDetailLevel = 'Off' | 'Low' | 'Medium' | 'High';

export interface TreeDetail {
  /** LOD0 out to this distance (m). */
  lod0: number;
  /** LOD1 out to this distance; impostors beyond. */
  lod1: number;
  /** LOD0 casts moon shadows. */
  shadows: boolean;
}

export interface TreeConfig {
  seed: number;
  density: number;
  rings: [number, number];
  spacing: number;
  jitter: number;
  species: Array<{ slug: string; share: number }>;
  scaleRange: [number, number];
  lod1Ratio: number;
  detail: Record<TreeDetailLevel, TreeDetail>;
}

export interface Garden {
  root: Group;
  trees: TreeSpot[];
  /** Re-bucket the trees for this camera (call once per rendered frame). */
  update(camera: Camera): void;
  setDetail(level: TreeDetailLevel): void;
  /** Trees drawn per LOD in the last update (impostors: everything beyond lod1). */
  stats(): { lod0: number; lod1: number; impostor: number };
  dispose(): void;
}

interface Part {
  lod0: BufferGeometry;
  lod1: BufferGeometry;
  material: MeshStandardNodeMaterial;
}

interface Species {
  parts: Part[];
  /** Model bounds (m): crown width and height. */
  width: number;
  height: number;
  impostor: RenderTarget;
}

/** A float, non-interleaved copy of a geometry with `matrix` baked in (glTF positions are int16-quantized). */
function bakeFloat(src: BufferGeometry, matrix: Matrix4): BufferGeometry {
  const g = new BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'uv1']) {
    const a = src.getAttribute(name);
    if (!a) continue;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c);
    g.setAttribute(name, new BufferAttribute(out, a.itemSize));
  }
  const idx = src.getIndex();
  g.setIndex(new BufferAttribute(idx ? Uint32Array.from(idx.array) : Uint32Array.from({ length: g.getAttribute('position').count }, (_, i) => i), 1));
  g.applyMatrix4(matrix);
  return g;
}

/** LOD1 by meshopt simplification (falls back to the sloppy simplifier for foliage cards that will not collapse). */
function simplify(g: BufferGeometry, ratio: number): BufferGeometry {
  const index = g.getIndex()!.array as Uint32Array;
  const pos = g.getAttribute('position').array as Float32Array;
  const target = Math.max(3, Math.floor((index.length * ratio) / 3) * 3);
  let [out] = MeshoptSimplifier.simplify(index, pos, 3, target, 0.02, []);
  if (out.length > target * 1.5) [out] = MeshoptSimplifier.simplifySloppy(index, pos, 3, null, target, 0.05);
  const lod = g.clone();
  lod.setIndex(new BufferAttribute(out, 1));
  return lod;
}

/**
 * Wind sway: the crown moves more than the trunk. The phase varies across the
 * crown, not per tree: instance slots are reassigned every frame, so a
 * per-slot phase would jump.
 */
function swayed(height: number): N {
  const phase = positionLocal.x.mul(0.35).add(positionLocal.z.mul(0.21));
  const h = positionLocal.y.div(height).clamp(0, 1);
  const amp = h.mul(h).mul(0.18);
  return positionLocal.add(vec3(sin(time.mul(0.9).add(phase)), 0, cos(time.mul(0.67).add(phase.mul(1.3)))).mul(amp));
}

function nodeMaterialFrom(src: Material, height: number): MeshStandardNodeMaterial {
  const s = src as MeshStandardMaterial;
  const m = new MeshStandardNodeMaterial({
    name: s.name,
    color: s.color,
    map: s.map,
    normalMap: s.normalMap,
    roughnessMap: s.roughnessMap,
    metalnessMap: s.metalnessMap,
    roughness: s.roughness,
    metalness: s.metalness,
    side: DoubleSide,
  });
  // Blended foliage would need sorting; alpha-tested cards do not.
  if (s.transparent || s.alphaTest > 0 || s.name.toLowerCase().includes('cluster')) m.alphaTest = 0.5;
  m.positionNode = swayed(height);
  return m;
}

/** Renders the model side-on into a texture for the far billboards. */
function captureImpostor(renderer: WebGPURenderer, parts: Part[], width: number, height: number): RenderTarget {
  const rt = new RenderTarget(256, 512, { type: HalfFloatType, generateMipmaps: true, minFilter: LinearMipmapLinearFilter, depthBuffer: true });
  const scene = new Scene();
  for (const p of parts) {
    const mat = new MeshBasicNodeMaterial({ map: p.material.map, color: p.material.color, alphaTest: 0.5, side: DoubleSide });
    scene.add(new Mesh(p.lod0, mat));
  }
  const cam = new OrthographicCamera(-width / 2, width / 2, height, 0, 0.1, 200);
  cam.position.set(0, 0, 100);
  const prevColor = new Color();
  renderer.getClearColor(prevColor);
  const prevAlpha = renderer.getClearAlpha();
  const prevTarget = renderer.getRenderTarget();
  renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(rt);
  renderer.clear();
  renderer.render(scene, cam);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevColor, prevAlpha);
  scene.traverse((o) => {
    if (o instanceof Mesh) (o.material as Material).dispose();
  });
  return rt;
}

async function loadSpecies(renderer: WebGPURenderer, slug: string, lod1Ratio: number): Promise<Species> {
  const gltf = await loadModel(slug);
  gltf.scene.updateMatrixWorld(true);
  const meshes: Mesh[] = [];
  gltf.scene.traverse((o) => {
    if (o instanceof Mesh) meshes.push(o);
  });
  const baked = meshes.map((m) => bakeFloat(m.geometry, m.matrixWorld));
  let maxXZ = 0;
  let maxY = 0;
  for (const g of baked) {
    g.computeBoundingBox();
    const b = g.boundingBox!;
    maxXZ = Math.max(maxXZ, -b.min.x, b.max.x, -b.min.z, b.max.z);
    maxY = Math.max(maxY, b.max.y);
  }
  const parts = meshes.map((m, i) => {
    const lod0 = baked[i]!;
    return { lod0, lod1: simplify(lod0, lod1Ratio), material: nodeMaterialFrom(m.material as Material, maxY) };
  });
  const width = maxXZ * 2;
  return { parts, width, height: maxY, impostor: captureImpostor(renderer, parts, width, maxY) };
}

/** One draw call per species for every tree's billboard; the shader hides those nearer than `start`. */
function impostorMesh(trees: TreeSpot[], species: Species[], start: N): Mesh[] {
  const meshes: Mesh[] = [];
  species.forEach((sp, si) => {
    const mine = trees.filter((t) => t.species === si);
    const n = mine.length;
    const center = new Float32Array(n * 4 * 3);
    const corner = new Float32Array(n * 4 * 2);
    const size = new Float32Array(n * 4 * 2);
    const uvs = new Float32Array(n * 4 * 2);
    const index = new Uint32Array(n * 6);
    const cs = [
      [-0.5, 0],
      [0.5, 0],
      [0.5, 1],
      [-0.5, 1],
    ] as const;
    mine.forEach((t, k) => {
      const y = heightAt(t.x, t.z) - 0.1;
      for (let c = 0; c < 4; c++) {
        const v = k * 4 + c;
        center.set([t.x, y, t.z], v * 3);
        corner.set(cs[c]!, v * 2);
        size.set([sp.width * t.scale, sp.height * t.scale], v * 2);
        uvs.set([cs[c]![0] + 0.5, cs[c]![1]], v * 2);
      }
      index.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3], k * 6);
    });
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(center.slice(), 3));
    g.setAttribute('center', new BufferAttribute(center, 3));
    g.setAttribute('corner', new BufferAttribute(corner, 2));
    g.setAttribute('size', new BufferAttribute(size, 2));
    g.setAttribute('uv', new BufferAttribute(uvs, 2));
    g.setIndex(new BufferAttribute(index, 1));
    g.computeBoundingSphere();
    g.boundingSphere!.radius += 30;

    const m = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0, side: DoubleSide });
    m.name = 'TreeImpostor';
    const c: N = attribute('center', 'vec3');
    const k: N = attribute('corner', 'vec2');
    const s: N = attribute('size', 'vec2');
    // Screen-aligned: faces the camera from the ground and from the aerial view alike.
    const right: N = (cameraWorldMatrix as N).element(0).xyz;
    const up: N = (cameraWorldMatrix as N).element(1).xyz;
    const far: N = step(start, c.xz.sub(cameraPosition.xz).length());
    m.positionNode = c.add(right.mul(k.x.mul(s.x)).add(up.mul(k.y.mul(s.y))).mul(far));
    const tex: N = texture(sp.impostor.texture, uv());
    m.colorNode = tex.rgb;
    m.opacityNode = tex.a;
    m.alphaTest = 0.4;
    m.normalNode = transformNormalToView(vec3(0, 1, 0));
    const mesh = new Mesh(g, m);
    mesh.name = `TreeImpostors_${si}`;
    meshes.push(mesh);
  });
  return meshes;
}

export async function createGarden(
  renderer: WebGPURenderer,
  physics: PhysicsWorld,
  config: TreeConfig,
  fountainAt: { x: number; z: number },
  level: TreeDetailLevel,
): Promise<Garden> {
  await MeshoptSimplifier.ready;
  const root = new Group();
  root.name = 'Garden';

  const species = await Promise.all(config.species.map((s) => loadSpecies(renderer, s.slug, config.lod1Ratio)));
  const trees = placeTrees({
    seed: config.seed,
    density: config.density,
    rings: config.rings,
    spacing: config.spacing,
    jitter: config.jitter,
    shares: config.species.map((s) => s.share),
    scaleRange: config.scaleRange,
  });

  for (const t of trees) {
    if (plazaDistance(t.x, t.z) > SLICE_RADIUS + 2) continue;
    physics.addStaticCylinder({ x: t.x, y: heightAt(t.x, t.z) + 2, z: t.z }, 2.5, TRUNK_RADIUS_M * t.scale, { surface: 'wood' });
  }

  // Per-tree instance matrices, grouped by species.
  const bySpecies = species.map((_, si) => trees.filter((t) => t.species === si));
  const matrices = bySpecies.map((list) => {
    const arr = new Float32Array(list.length * 16);
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    list.forEach((t, i) => {
      q.setFromAxisAngle(up, t.rotation);
      m.compose(new Vector3(t.x, heightAt(t.x, t.z) - 0.1, t.z), q, new Vector3(t.scale, t.scale, t.scale));
      m.toArray(arr, i * 16);
    });
    return arr;
  });

  type Lod = { meshes: InstancedMesh[] };
  const lods: Lod[][] = species.map((sp, si) =>
    [0, 1].map((lod) => ({
      meshes: sp.parts.map((p) => {
        const im = new InstancedMesh(lod === 0 ? p.lod0 : p.lod1, p.material, Math.max(1, bySpecies[si]!.length));
        im.instanceMatrix.setUsage(DynamicDrawUsage);
        im.count = 0;
        im.frustumCulled = false; // culled per tree in update()
        im.receiveShadow = true;
        im.name = `Tree_${config.species[si]!.slug}_lod${lod}`;
        root.add(im);
        return im;
      }),
    })),
  );

  const impostorStart = uniform(config.detail[level].lod1);
  for (const m of impostorMesh(trees, species, impostorStart)) root.add(m);

  let detail = config.detail[level];
  const applyShadows = (): void => {
    for (const sp of lods) for (const im of sp[0]!.meshes) im.castShadow = detail.shadows;
  };
  applyShadows();

  root.add(createFountain(fountainAt));
  root.add(createRailway());

  const frustum = new Frustum();
  const vp = new Matrix4();
  const sphereCenter = new Vector3();
  const sphere = { center: sphereCenter, radius: 0 };
  let last = { lod0: 0, lod1: 0, impostor: 0 };

  return {
    root,
    trees,
    update(camera: Camera): void {
      camera.updateMatrixWorld();
      vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(vp);
      const cx = camera.position.x;
      const cz = camera.position.z;
      const l0 = detail.lod0 * detail.lod0;
      const l1 = detail.lod1 * detail.lod1;
      const counts = { lod0: 0, lod1: 0, impostor: 0 };
      bySpecies.forEach((list, si) => {
        const sp = species[si]!;
        const n = [0, 0];
        const mats = matrices[si]!;
        const [m0, m1] = [lods[si]![0]!.meshes, lods[si]![1]!.meshes];
        list.forEach((t, i) => {
          const dx = t.x - cx;
          const dz = t.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= l1) {
            counts.impostor++;
            return;
          }
          sphereCenter.set(t.x, sp.height * 0.5 * t.scale, t.z);
          sphere.radius = sp.height * 0.75 * t.scale;
          if (!frustum.intersectsSphere(sphere as never)) return;
          const lod = d2 < l0 ? 0 : 1;
          const slot = n[lod]!++;
          for (const im of lod === 0 ? m0 : m1) im.instanceMatrix.array.set(mats.subarray(i * 16, i * 16 + 16), slot * 16);
        });
        for (const [lod, ms] of [m0, m1].entries()) {
          for (const im of ms) {
            im.count = n[lod]!;
            im.instanceMatrix.needsUpdate = true;
          }
        }
        counts.lod0 += n[0]!;
        counts.lod1 += n[1]!;
      });
      last = counts;
    },
    setDetail(next: TreeDetailLevel): void {
      detail = config.detail[next];
      impostorStart.value = detail.lod1;
      applyShadows();
    },
    stats: () => ({ ...last }),
    dispose(): void {
      root.traverse((o) => {
        if (o instanceof Mesh) {
          o.geometry.dispose();
          (o.material as Material).dispose();
        }
      });
      for (const sp of species) sp.impostor.dispose();
    },
  };
}

/** The lake fountain: a low basin wall, a pedestal, a bowl and a figure on top. */
function createFountain(at: { x: number; z: number }): Group {
  const g = new Group();
  g.name = 'Fountain';
  const stone = new MeshStandardMaterial({ color: 0x8a8274, roughness: 0.7 });
  const bronze = new MeshStandardMaterial({ color: 0x3b4a3c, roughness: 0.45, metalness: 0.8 });
  const parts: Array<[BufferGeometry, Material, number]> = [
    [new TorusGeometry(6, 0.35, 8, 48).rotateX(Math.PI / 2), stone, 0.05],
    [new CylinderGeometry(2.2, 2.6, 1.6, 24), stone, 0.3],
    [new CylinderGeometry(3.4, 1.2, 0.9, 24), stone, 1.55],
    [new CylinderGeometry(0.6, 0.8, 1.8, 16), stone, 2.6],
    [new CylinderGeometry(1.6, 0.6, 0.5, 20), stone, 3.6],
    [new CylinderGeometry(0.28, 0.4, 1.7, 12), bronze, 4.7],
    [new SphereGeometry(0.26, 12, 8), bronze, 5.75],
  ];
  for (const [geo, mat, y] of parts) {
    const m = new Mesh(geo, mat);
    m.position.y = y;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  // A raised arm, so the figure reads as a statue rather than a post.
  const arm = new Mesh(new CylinderGeometry(0.08, 0.1, 1.1, 8), bronze);
  arm.position.set(0.25, 5.8, 0);
  arm.rotation.z = -0.5;
  g.add(arm);
  g.position.set(at.x, -0.25, at.z);
  return g;
}

/** Schlossgartenbahn: 381 mm gauge rails and sleepers on a CatmullRom loop around RAIL_RADIUS. */
export const RAIL_GAUGE_M = 0.381;

export function railCurve(): CatmullRomCurve3 {
  const pts: Vector3[] = [];
  for (let i = 0; i < 48; i++) {
    const b = (i / 48) * 360;
    const d = bearingVector(b);
    const r = railRadius(b);
    pts.push(new Vector3(d.x * r, 0, d.z * r));
  }
  return new CatmullRomCurve3(pts, true, 'centripetal');
}

function createRailway(): Group {
  const g = new Group();
  g.name = 'Schlossgartenbahn';
  const curve = railCurve();
  const length = curve.getLength();
  const samples = Math.round(length / 2);
  const steel = new MeshStandardMaterial({ color: 0x3a3c3e, roughness: 0.35, metalness: 0.9 });
  const wood = new MeshStandardMaterial({ color: 0x2a2018, roughness: 0.9 });
  const up = new Vector3(0, 1, 0);
  const side = new Vector3();
  const p = new Vector3();
  const t = new Vector3();
  for (const sgn of [-1, 1]) {
    const pts: Vector3[] = [];
    for (let i = 0; i < samples; i++) {
      const u = i / samples;
      curve.getPointAt(u, p);
      curve.getTangentAt(u, t);
      side.crossVectors(t, up).normalize();
      pts.push(p.clone().addScaledVector(side, (sgn * RAIL_GAUGE_M) / 2).setY(0.17));
    }
    const rail = new Mesh(new TubeGeometry(new CatmullRomCurve3(pts, true), samples * 2, 0.03, 4, true), steel);
    rail.name = 'Rail';
    g.add(rail);
  }
  const spacing = 0.6;
  const count = Math.floor(length / spacing);
  const sleepers = new InstancedMesh(new BoxGeometry(0.75, 0.1, 0.16), wood, count);
  sleepers.name = 'Sleepers';
  const m = new Matrix4();
  const q = new Quaternion();
  const one = new Vector3(1, 1, 1);
  for (let i = 0; i < count; i++) {
    const u = i / count;
    curve.getPointAt(u, p);
    curve.getTangentAt(u, t);
    q.setFromAxisAngle(up, Math.atan2(t.x, t.z));
    m.compose(p.setY(0.07), q, one);
    sleepers.setMatrixAt(i, m);
  }
  sleepers.receiveShadow = true;
  g.add(sleepers);
  return g;
}
