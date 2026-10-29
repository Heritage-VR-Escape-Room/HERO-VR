/**
 * Plaza materials (spec §9 surfaces): red sandstone with a 4x-tiled detail
 * normal for the pyramid, bronze with a green patina for the plaque, polished
 * brass for the door and lock, and the dark steel of the jammer. All are node
 * materials; geometry UVs are in metres on each face.
 */
import { MeshPhysicalNodeMaterial, MeshStandardNodeMaterial, type Texture } from 'three/webgpu';
import { bumpMap, color, float, luminance, mix, normalMap, smoothstep, texture, uv, vec2, vec3 } from 'three/tsl';
import type { PbrSet } from './pbr';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

/** Metres per repeat of the sandstone scan; the detail normal repeats 4x as often. */
export const SANDSTONE_TILE_M = 5;
export const DETAIL_REPEAT = 4;

/** Blend two tangent-space normals (whiteout); inputs and output in [0, 1] map space. */
function blendNormals(a: N, b: N): N {
  const n1 = a.mul(2).sub(1);
  const n2 = b.mul(2).sub(1);
  return vec3(n1.xy.add(n2.xy), n1.z.mul(n2.z)).normalize().mul(0.5).add(0.5);
}

export function sandstoneMaterial(set: PbrSet, opts: { shade?: number } = {}): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial();
  m.name = 'PyramidSandstone';
  const p: N = uv().div(SANDSTONE_TILE_M);
  const detail: N = uv().div(SANDSTONE_TILE_M / DETAIL_REPEAT);
  const base: N = texture(set.diff, p).rgb;
  // Karlsruhe's pyramid is a deep red sandstone; the scan is pulled a little darker and redder.
  m.colorNode = base.mul(vec3(1.25, 0.8, 0.68)).mul(opts.shade ?? 1);
  m.normalNode = normalMap(blendNormals(texture(set.nor, p).rgb, texture(set.nor, detail).rgb));
  const arm: N = texture(set.arm, p);
  m.aoNode = arm.r;
  // Damp stone at night: a touch glossier than the dry scan.
  m.roughnessNode = arm.g.mul(0.82);
  m.metalnessNode = float(0);
  return m;
}

/**
 * Cast bronze with a verdigris patina pooling in the recesses (the green
 * metal scan drives where the patina sits). `text` overlays engraved
 * lettering: its alpha marks raised, polished letters (bump from height).
 */
export function bronzeMaterial(set: PbrSet, opts: { text?: Texture; tileM?: number } = {}): MeshPhysicalNodeMaterial {
  const m = new MeshPhysicalNodeMaterial();
  m.name = 'BronzePatina';
  const t: N = uv().div(opts.tileM ?? 0.6);
  const scan: N = texture(set.diff, t).rgb;
  // Where the scan is greenest, the patina sits.
  const patina: N = smoothstep(0.0, 0.08, scan.g.sub(scan.r.add(scan.b).mul(0.5)));
  const bronze: N = color('#8a5a2b').mul(luminance(scan).mul(1.6).add(0.45));
  const verdigris: N = color('#4f8a74').mul(luminance(scan).mul(1.2).add(0.3));
  let col: N = mix(bronze, verdigris, patina.mul(0.75));
  let rough: N = mix(float(0.42), float(0.75), patina);
  let metal: N = mix(float(0.9), float(0.25), patina);
  if (opts.text) {
    const a: N = texture(opts.text).a;
    // Raised letters are rubbed bright by hands; the field around them is dark.
    col = mix(col.mul(0.5), color('#f0c070'), a);
    rough = mix(rough, float(0.28), a);
    metal = mix(metal, float(1), a);
    m.normalNode = bumpMap(a, float(2.5));
  } else {
    m.normalNode = normalMap(texture(set.nor, t).rgb);
  }
  m.colorNode = col;
  m.roughnessNode = rough;
  m.metalnessNode = metal;
  m.clearcoatNode = float(0.2); // a film of mist on the metal
  m.clearcoatRoughnessNode = float(0.35);
  return m;
}

/**
 * Polished brass door leaf with engraving: `height` is a canvas whose red
 * channel is 1 on the plate and 0 in the cut grooves (normal from height).
 */
export function engravedBrassMaterial(set: PbrSet, height: Texture): MeshPhysicalNodeMaterial {
  const m = new MeshPhysicalNodeMaterial();
  m.name = 'BrassDoor';
  const t: N = uv().mul(vec2(0.9, 1.1)).div(0.5);
  const scan: N = texture(set.diff, t).rgb;
  const h: N = texture(height).r;
  const brass: N = color('#a07a3e').mul(luminance(scan).mul(1.3).add(0.55));
  m.colorNode = mix(color('#2a1d0e'), brass, h);
  m.normalNode = bumpMap(h, float(3));
  m.roughnessNode = mix(float(0.7), texture(set.arm, t).g.mul(0.45).add(0.15), h);
  m.metalnessNode = mix(float(0.4), float(1), h);
  m.clearcoatNode = float(0.15);
  return m;
}

export function darkSteel(name: string): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ color: '#25282a', roughness: 0.45, metalness: 0.8 });
  m.name = name;
  return m;
}
