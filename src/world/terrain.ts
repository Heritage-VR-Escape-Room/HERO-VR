/**
 * Schlossgarten terrain: a 1200 x 1200 m heightfield at 2 m (flat ±0.5 m,
 * flattened on paths and the plaza, the lake carved 1.5 m deep), drawn as
 * 4 x 4 frustum-culled chunks with one TSL splat material (grass / gravel /
 * cobble from a generated splat texture), plus the lake's water surface and
 * one Rapier heightfield collider tagged per point by surface.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  DataTexture,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardNodeMaterial,
  NoColorSpace,
  RGBAFormat,
} from 'three/webgpu';
import { float, mix, normalMap, texture, uv, vec3 } from 'three/tsl';
import { LAKE, puddleMask, surfaceAt, surfaceWeights, TERRAIN, terrainHeights } from '../logic/worldLayout';
import type { PhysicsWorld } from './colliders';
import { loadPbrSet, type PbrSet } from './pbr';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

const CHUNKS = 4;
/** Splat texture resolution over the whole terrain (~0.6 m per texel). */
const SPLAT_SIZE = 2048;
/** Detail texture tiling, metres per repeat. */
const TILE = { grass: 3.2, grassMacro: 13.7, gravel: 2.6, cobble: 2.4 } as const;
/** Wet cobble (spec §9): roughness in puddles and on the rest of the cobbles; puddles darken the stone. */
export const WET_COBBLE = { puddleRoughness: 0.15, roughness: 0.65, puddleDarken: 0.45 } as const;
/** Water surface height (the bed is 1.5 m below the bank). */
export const WATER_LEVEL = -0.25;

export interface Terrain {
  root: Group;
  water: Mesh;
  dispose(): void;
}

/** RGBA8 splat: R grass, G gravel, B cobble, A standing water (puddles, used on cobble). Row 0 is the southern edge (z = -size/2). */
export function createSplatTexture(size = SPLAT_SIZE): DataTexture {
  const data = new Uint8Array(size * size * 4);
  const half = TERRAIN.size / 2;
  const step = TERRAIN.size / size;
  for (let row = 0; row < size; row++) {
    const z = -half + (row + 0.5) * step;
    for (let col = 0; col < size; col++) {
      const x = -half + (col + 0.5) * step;
      const [g, gr, c] = surfaceWeights(x, z);
      const i = (row * size + col) * 4;
      data[i] = Math.round(g * 255);
      data[i + 1] = Math.round(gr * 255);
      data[i + 2] = Math.round(c * 255);
      data[i + 3] = c > 0 ? Math.round(puddleMask(x, z) * 255) : 0;
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat);
  tex.colorSpace = NoColorSpace;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function splatMaterial(splat: DataTexture, grass: PbrSet, gravel: PbrSet, cobble: PbrSet): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial();
  m.name = 'TerrainSplat';
  const p: N = uv(); // world metres (x, z)
  const half = TERRAIN.size / 2;
  const w: N = texture(splat, p.add(half).div(TERRAIN.size));
  const at = (t: N, tile: number): N => texture(t, p.div(tile));

  // Standing water on the cobbles: smooth, dark, flat (mirror-like in the lamp light).
  const puddle: N = w.a.mul(w.b);
  // Grass mixes two tilings so the repeat does not show across a lawn.
  const grassCol = mix(at(grass.diff, TILE.grass).rgb, at(grass.diff, TILE.grassMacro).rgb, 0.45);
  const cobbleCol = at(cobble.diff, TILE.cobble).rgb.mul(mix(float(1), float(WET_COBBLE.puddleDarken), w.a));
  const color = grassCol
    .mul(w.r)
    .add(at(gravel.diff, TILE.gravel).rgb.mul(w.g))
    .add(cobbleCol.mul(w.b));
  // Night lawns read darker and colder than the daylight scans.
  m.colorNode = color.mul(mix(vec3(0.55, 0.62, 0.58), vec3(1), w.r.oneMinus()));

  const nor = at(grass.nor, TILE.grass).rgb.mul(w.r).add(at(gravel.nor, TILE.gravel).rgb.mul(w.g)).add(at(cobble.nor, TILE.cobble).rgb.mul(w.b));
  m.normalNode = normalMap(mix(nor, vec3(0.5, 0.5, 1), puddle.mul(0.85)));

  const arm = at(grass.arm, TILE.grass).rgb.mul(w.r).add(at(gravel.arm, TILE.gravel).rgb.mul(w.g)).add(at(cobble.arm, TILE.cobble).rgb.mul(w.b));
  m.aoNode = arm.r;
  // Damp night ground: grass and gravel a little glossier than the scans; cobble wet, puddles glassy.
  const cobbleRough: N = mix(float(WET_COBBLE.roughness), float(WET_COBBLE.puddleRoughness), w.a);
  m.roughnessNode = arm.g.mul(0.85).mul(w.b.oneMinus()).add(cobbleRough.mul(w.b));
  m.metalnessNode = float(0);
  return m;
}

/** One chunk of the render grid; vertex normals come from the shared height grid, so chunk seams match. */
function chunkGeometry(heights: Float32Array, n: number, c0: number, r0: number, cells: number): BufferGeometry {
  const { cell } = TERRAIN;
  const half = TERRAIN.size / 2;
  const h = (col: number, row: number): number =>
    heights[Math.min(n, Math.max(0, col)) * (n + 1) + Math.min(n, Math.max(0, row))]!;
  const verts = cells + 1;
  const pos = new Float32Array(verts * verts * 3);
  const nrm = new Float32Array(verts * verts * 3);
  const uvs = new Float32Array(verts * verts * 2);
  let v = 0;
  for (let j = 0; j < verts; j++) {
    const row = r0 + j;
    for (let i = 0; i < verts; i++) {
      const col = c0 + i;
      const x = -half + col * cell;
      const z = -half + row * cell;
      pos.set([x, h(col, row), z], v * 3);
      const nx = h(col - 1, row) - h(col + 1, row);
      const nz = h(col, row - 1) - h(col, row + 1);
      const ny = 2 * cell;
      const len = Math.hypot(nx, ny, nz);
      nrm.set([nx / len, ny / len, nz / len], v * 3);
      uvs.set([x, z], v * 2);
      v++;
    }
  }
  const index = new Uint32Array(cells * cells * 6);
  let k = 0;
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const a = j * verts + i;
      const b = a + 1;
      const c = a + verts;
      const d = c + 1;
      // Counter-clockwise seen from above (+Y).
      index.set([a, c, b, b, c, d], k);
      k += 6;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nrm, 3));
  g.setAttribute('uv', new BufferAttribute(uvs, 2));
  g.setIndex(new BufferAttribute(index, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

function waterMesh(): Mesh {
  const geo = new CircleGeometry(1.02, 96);
  geo.rotateX(-Math.PI / 2);
  // Dark, near-mirror water: reflects the night sky environment (planar env reflection).
  const mat = new MeshStandardNodeMaterial({ color: 0x0b1412, roughness: 0.05, metalness: 0 });
  mat.name = 'LakeWater';
  const water = new Mesh(geo, mat);
  water.name = 'LakeWater';
  water.scale.set(LAKE.rx, 1, LAKE.rz);
  water.position.set(LAKE.center.x, WATER_LEVEL, LAKE.center.z);
  water.receiveShadow = true;
  return water;
}

export async function createTerrain(physics: PhysicsWorld): Promise<Terrain> {
  const [grass, gravel, cobble] = await Promise.all([
    loadPbrSet('tex_grass', '2k'),
    loadPbrSet('tex_gravel', '2k'),
    loadPbrSet('tex_cobble_wet', '4k'),
  ]);
  const { rows: n, heights } = terrainHeights();
  const splat = createSplatTexture();
  const material = splatMaterial(splat, grass, gravel, cobble);

  const root = new Group();
  root.name = 'Terrain';
  const cells = n / CHUNKS;
  for (let cj = 0; cj < CHUNKS; cj++) {
    for (let ci = 0; ci < CHUNKS; ci++) {
      const chunk = new Mesh(chunkGeometry(heights, n, ci * cells, cj * cells, cells), material);
      chunk.name = `TerrainChunk_${ci}_${cj}`;
      chunk.receiveShadow = true;
      root.add(chunk);
    }
  }
  const water = waterMesh();
  root.add(water);

  physics.addHeightfield(
    n,
    n,
    heights,
    { x: TERRAIN.size, y: 1, z: TERRAIN.size },
    { x: 0, y: 0, z: 0 },
    { surface: 'grass', surfaceAt: (p) => surfaceAt(p.x, p.z) },
  );

  return {
    root,
    water,
    dispose() {
      root.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
      material.dispose();
      (water.material as MeshStandardNodeMaterial).dispose();
      splat.dispose();
    },
  };
}
