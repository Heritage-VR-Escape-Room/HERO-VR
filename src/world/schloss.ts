/**
 * Schloss Karlsruhe at background distance. The placement entry may name a
 * model slug (asset-swap rule); the slice has none (docs/asset-picks.md:
 * "Blockout in code"), so this builds the blockout: a 170 m main wing along X
 * facing south, two 120 m side wings angled south-east and south-west, and
 * the 51 m tower at the origin. Walls are sandstone with a procedural window
 * grid (a few windows faintly lit); mansard roofs in dark slate. Box colliders.
 */
import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardNodeMaterial,
  Shape,
  SphereGeometry,
  type Material,
} from 'three/webgpu';
import { color, float, floor, fract, hash, luminance, mix, normalMap, step, texture, time, uv, vec3 } from 'three/tsl';
import { SCHLOSS, schlossSegments } from '../logic/worldLayout';
import { loadModel } from './assets';
import type { PhysicsWorld } from './colliders';
import { loadPbrSet } from './pbr';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

export interface SchlossPlacement {
  /** Model slug under public/assets, or null for the blockout. */
  model: string | null;
  position: [number, number, number];
  /** Compass bearing the main facade faces. */
  facing: number;
}

const ROOF_HEIGHT = 7;
const WINDOW_BAY_M = 4.2;
const FLOOR_M = 6;

/** Box with UVs in metres on every face (u along the face, v up). */
export function meterBox(w: number, h: number, d: number): BoxGeometry {
  const g = new BoxGeometry(w, h, d);
  const uvAttr = g.getAttribute('uv');
  // Face order: +x, -x, +y, -y, +z, -z; 4 vertices each.
  const spans: Array<[number, number]> = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = spans[f]!;
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uvAttr.setXY(k, uvAttr.getX(k) * su, uvAttr.getY(k) * sv);
    }
  }
  return g;
}

/** Mansard roof: a trapezoid prism `length` long along X, sitting on y = 0. */
function mansard(length: number, depth: number): BufferGeometry {
  const s = new Shape();
  const top = depth * 0.32;
  s.moveTo(-depth / 2 - 0.6, 0);
  s.lineTo(depth / 2 + 0.6, 0);
  s.lineTo(top / 2, ROOF_HEIGHT);
  s.lineTo(-top / 2, ROOF_HEIGHT);
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth: length, bevelEnabled: false });
  // Extruded along +Z with the profile in XY: turn so the length runs along X.
  g.translate(0, 0, -length / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

async function wallMaterial(): Promise<MeshStandardNodeMaterial> {
  const set = await loadPbrSet('tex_sandstone_red', '4k');
  const m = new MeshStandardNodeMaterial();
  m.name = 'SchlossWall';
  const p: N = uv(); // metres on the face
  const tile = p.div(3.5);
  // The red scan pulled toward the Schloss's pale ochre render.
  const base: N = texture(set.diff, tile).rgb;
  const wall = mix(vec3(luminance(base)), base, 0.35).mul(vec3(1.25, 1.12, 0.9));

  const bay: N = fract(p.x.div(WINDOW_BAY_M));
  const storey: N = fract(p.y.div(FLOOR_M));
  const win: N = step(0.3, bay).mul(step(bay, 0.7)).mul(step(0.22, storey)).mul(step(storey, 0.8));
  const cellId: N = floor(p.x.div(WINDOW_BAY_M)).add(floor(p.y.div(FLOOR_M)).mul(37.0));
  // Someone is still up: each window draws a new on/off lot every ~25 s, its
  // own phase staggered, so lights come and go across the facade.
  const period: N = float(25);
  const epoch: N = floor(time.div(period).add(hash(cellId.mul(1.7))));
  const lit: N = step(0.93, hash(cellId.add(epoch.mul(13.1))));
  m.colorNode = mix(wall, vec3(0.015, 0.017, 0.02), win);
  m.emissiveNode = color('#FFB066').mul(win.mul(lit).mul(0.9));
  m.normalNode = normalMap(texture(set.nor, tile).rgb);
  m.roughnessNode = mix(texture(set.arm, tile).g, float(0.12), win);
  m.metalnessNode = float(0);
  return m;
}

function roofMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ color: 0x2c3338, roughness: 0.45, metalness: 0.15 });
  m.name = 'SchlossRoof';
  return m;
}

/** One wing (body + mansard) whose local X runs along its length, base at y = 0. */
function wing(length: number, height: number, depth: number, wall: Material, roof: Material): Group {
  const g = new Group();
  const body = new Mesh(meterBox(length, height, depth), wall);
  body.position.y = height / 2;
  const r = new Mesh(mansard(length, depth), roof);
  r.position.y = height;
  for (const m of [body, r]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  g.add(body, r);
  return g;
}

function tower(wall: Material, roof: Material): Group {
  const g = new Group();
  const { base, height } = SCHLOSS.tower;
  const shaftH = 30;
  const shaft = new Mesh(meterBox(base, shaftH, base), wall);
  shaft.position.y = shaftH / 2;
  const drumH = 11;
  const drum = new Mesh(new CylinderGeometry(base * 0.42, base * 0.46, drumH, 8), wall);
  drum.position.y = shaftH + drumH / 2;
  const domeR = base * 0.42;
  const dome = new Mesh(new SphereGeometry(domeR, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), roof);
  dome.scale.y = 0.75;
  dome.position.y = shaftH + drumH;
  const lanternH = 2.6;
  const lanternY = shaftH + drumH + domeR * 0.75 - 0.4;
  const lantern = new Mesh(new CylinderGeometry(1.2, 1.4, lanternH, 8), wall);
  lantern.position.y = lanternY + lanternH / 2;
  const spireH = height - (lanternY + lanternH);
  const spire = new Mesh(new CylinderGeometry(0.05, 1.3, spireH, 8), roof);
  spire.position.y = lanternY + lanternH + spireH / 2;
  for (const m of [shaft, drum, dome, lantern, spire]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  g.add(shaft, drum, dome, lantern, spire);
  return g;
}

/** Central projecting bay (risalit) on the south facade with a triangular pediment. */
function risalit(wall: Material, roof: Material): Group {
  const g = new Group();
  const w = 34;
  const h = SCHLOSS.mainWing.height + 4;
  const d = 5;
  const body = new Mesh(meterBox(w, h, d), wall);
  body.position.y = h / 2;
  const s = new Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, 6);
  s.closePath();
  const ped = new Mesh(new ExtrudeGeometry(s, { depth: d, bevelEnabled: false }), roof);
  ped.position.set(0, h, -d / 2);
  for (const m of [body, ped]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  g.add(body, ped);
  return g;
}

/** The Schloss at the origin, facing south; returns its root group. */
export async function createSchloss(physics: PhysicsWorld, placement: SchlossPlacement): Promise<Group> {
  const root = new Group();
  root.name = 'Schloss';
  root.position.set(...placement.position);
  if (placement.model) {
    const gltf = await loadModel(placement.model);
    const model = gltf.scene.clone();
    // Models face +Z (north) when imported (asset pipeline); rotating by -bearing turns +Z to that bearing (east = -X).
    model.rotation.y = (-placement.facing * Math.PI) / 180;
    root.add(model);
    return root;
  }

  const wall = await wallMaterial();
  const roof = roofMaterial();
  const segs = schlossSegments();
  const add = (g: Group, a: { x: number; z: number }, b: { x: number; z: number }): void => {
    g.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
    g.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x);
    root.add(g);
  };
  const m = SCHLOSS.mainWing;
  add(wing(m.length, m.height, m.depth, wall, roof), segs[0]!.a, segs[0]!.b);
  const sw = SCHLOSS.sideWing;
  for (const s of segs.slice(1)) add(wing(sw.length, sw.height, sw.depth, wall, roof), s.a, s.b);
  const front = risalit(wall, roof);
  front.position.set(0, 0, m.centerZ - m.depth / 2 - 2);
  root.add(front);
  root.add(tower(wall, roof));

  // Colliders: one box per wing (body + roof height), the risalit and the tower.
  const o = { x: placement.position[0], z: placement.position[2] };
  const wallTop = m.height + ROOF_HEIGHT;
  for (const [i, s] of segs.entries()) {
    const len = Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z);
    physics.addStaticBox(
      { x: o.x + (s.a.x + s.b.x) / 2, y: wallTop / 2, z: o.z + (s.a.z + s.b.z) / 2 },
      { x: len / 2, y: wallTop / 2, z: (i === 0 ? m.depth : sw.depth) / 2 },
      Math.atan2(-(s.b.z - s.a.z), s.b.x - s.a.x),
      { surface: 'cobble' },
    );
  }
  physics.addStaticBox({ x: o.x, y: 14, z: o.z + m.centerZ - m.depth / 2 - 2 }, { x: 17, y: 14, z: 2.5 }, 0, { surface: 'cobble' });
  physics.addStaticBox({ x: o.x, y: SCHLOSS.tower.height / 2, z: o.z }, { x: 7, y: SCHLOSS.tower.height / 2, z: 7 }, 0, { surface: 'cobble' });
  return root;
}
