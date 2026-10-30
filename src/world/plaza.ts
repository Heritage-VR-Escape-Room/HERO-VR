/**
 * The Act 0 plaza (spec §6): the founder's pyramid with its plaque, door,
 * lock and alcove; the wake bench; the newsstand kiosk with its shouting
 * owner and newspapers; two glaring citizens; eight sodium streetlamps on a
 * 22 m ring; Fritz's perches; and the named viewpoints. Every position comes
 * from src/world/placements/plaza.json (world metres, compass facings).
 */
import {
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  MeshStandardNodeMaterial,
  PointLight,
  Vector3,
  type Material,
  type Object3D,
} from 'three/webgpu';
import { color, luminance, texture } from 'three/tsl';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { I18n } from '../logic/i18n';
import { bearingVector } from '../logic/worldLayout';
import { bearingToward, lampPositions, PLAZA, type PlazaPlacement } from '../logic/plazaLayout';
import { LAMP_COLOR, type LightingRig } from '../render/lighting';
import type { OrbitViewpoint } from '../render/menuBackdrop';
import type { Fritz } from '../companion/fritz';
import { loadModel } from './assets';
import type { PhysicsWorld } from './colliders';
import type { Viewpoint } from './gardenWorld';
import { Npc } from './npc';
import { loadPbrSet } from './pbr';
import { createPyramid, type Pyramid } from './pyramid';
import type { JammerSound } from './jammer';

const DEG = Math.PI / 180;
/** Lamp glass emissive strength (HDR; blooms and reads as the light source). */
const LAMP_GLASS_EMISSIVE = 30;
/** Warm bulb over the kiosk counter. */
const KIOSK_LAMP = { color: '#ffc27a', power: 260, distance: 7, height: 2.5, out: 1.6 } as const;
/** Copper tint for Fritz (spec §9: copper patina on Fritz). */
const FRITZ_COPPER = '#b06a3c';
/** Arms out of the Renderpeople T-pose (degrees). */
const T_POSE_ARMS_DOWN_DEG = 80;
/** The owner's rig rests in an A-pose: a small drop brings the arms to his sides. */
const OWNER_ARMS_DOWN_DEG = 5;

export interface PlazaDeps {
  physics: PhysicsWorld;
  i18n: I18n;
  rig: LightingRig;
  onJammerDisabled?: () => void;
  onJammerSound?: (s: JammerSound) => void;
}

export interface Plaza {
  root: Group;
  pyramid: Pyramid;
  npcs: Npc[];
  perches: Record<string, { position: Vector3; facing: number }>;
  /** Plaza viewpoints in the garden's viewpoint format. */
  viewpoints: Record<string, Viewpoint>;
  menuOrbit: OrbitViewpoint;
  /** Per frame: NPCs (glare at `eye`), jammer, alcove. */
  update(dt: number, eye: Vector3): void;
  /** Load the crow, tint it copper and give it to Fritz; register the perches. */
  attachFritz(fritz: Fritz): Promise<void>;
}

const facingRad = (deg: number): number => -deg * DEG;

/** Place a copy of a static model; meshes cast and receive shadows unless told otherwise. */
function placeModel(src: Object3D, x: number, y: number, z: number, facingDeg: number, castShadow = true): Object3D {
  const o = src.clone(true);
  o.position.set(x, y, z);
  o.rotation.y = facingRad(facingDeg);
  o.traverse((c) => {
    if ((c as Mesh).isMesh) {
      c.castShadow = castShadow;
      c.receiveShadow = true;
    }
  });
  return o;
}

function plazaViewpoints(p: PlazaPlacement): Record<string, Viewpoint> {
  return Object.fromEntries(
    Object.entries(p.viewpoints).map(([name, vp]) => [
      name,
      { position: vp.position, lookAt: vp.target, up: [0, 1, 0], fov: 60, fogBypass: false } satisfies Viewpoint,
    ]),
  );
}

export function menuOrbitOf(p: PlazaPlacement = PLAZA): OrbitViewpoint {
  const vp = p.viewpoints['menu_orbit']!;
  const [tx, ty, tz] = vp.target;
  return {
    target: { x: tx, y: ty, z: tz },
    radius: Math.hypot(vp.position[0] - tx, vp.position[2] - tz),
    height: vp.position[1],
    periodSec: 150,
  };
}

export async function createPlaza(deps: PlazaDeps, p: PlazaPlacement = PLAZA): Promise<Plaza> {
  const { physics, rig } = deps;
  const root = new Group();
  root.name = 'Plaza';

  const [sandstone, bronze, lampModel, benchModel, kioskModel, paperModel, ownerModel, ...citizenModels] = await Promise.all([
    loadPbrSet('tex_sandstone_red', '4k'),
    loadPbrSet('tex_bronze_patina', '4k'),
    loadModel(p.lamps.model),
    loadModel(p.bench.model),
    loadModel(p.kiosk.model),
    loadModel('newspapers'),
    loadModel(p.kiosk.owner.model),
    ...p.citizens.map((c) => loadModel(c.model)),
  ]);

  const pyramid = createPyramid(p.pyramid, {
    physics,
    i18n: deps.i18n,
    sandstone,
    bronze,
    onJammerDisabled: () => deps.onJammerDisabled?.(),
    onJammerSound: deps.onJammerSound,
  });
  root.add(pyramid.root);
  const pyramidAt = p.pyramid.position;

  // Streetlamps: the model's lantern glass glows sodium; each gets a spot and a halo from the rig.
  const lampSrc = lampModel.scene.clone(true);
  lampSrc.traverse((c) => {
    const m = c as Mesh;
    if (!m.isMesh) return;
    const mat = (m.material as MeshStandardMaterial).clone();
    if (/glass/i.test(mat.name)) {
      mat.emissive = new Color(LAMP_COLOR);
      mat.emissiveIntensity = LAMP_GLASS_EMISSIVE;
      mat.color.set('#000');
    } else {
      mat.color.set('#1d211d');
      mat.roughness = 0.45;
      mat.metalness = 0.8;
    }
    m.material = mat;
  });
  lampPositions(p).forEach((l, i) => {
    // The lamp sits around its own light: its pole and cap must not shadow the spot.
    const lamp = placeModel(lampSrc, l.x, 0, l.z, l.bearing, false);
    lamp.name = `lamp_${i}`;
    root.add(lamp);
    rig.addStreetlamp(new Vector3(l.x, p.lamps.headY, l.z));
    physics.addStaticCylinder({ x: l.x, y: p.lamps.topY / 2, z: l.z }, p.lamps.topY / 2, 0.16, { surface: 'metal' });
  });

  // Wake bench, facing the pyramid.
  const [bx, , bz] = p.bench.position;
  const benchFacing = bearingToward(p.bench.position, pyramidAt);
  const bench = placeModel(benchModel.scene, bx, 0, bz, benchFacing);
  bench.name = 'wake_bench';
  root.add(bench);
  physics.addStaticBox({ x: bx, y: 0.43, z: bz }, { x: 0.9, y: 0.43, z: 0.29 }, facingRad(benchFacing), { surface: 'wood' });

  // Kiosk, counter toward the pyramid, with its bulb, newspapers and owner.
  const [kx, , kz] = p.kiosk.position;
  const kioskFacing = bearingToward(p.kiosk.position, pyramidAt);
  const kiosk = placeModel(kioskModel.scene, kx, 0, kz, kioskFacing);
  kiosk.name = 'kiosk';
  root.add(kiosk);
  physics.addStaticBox({ x: kx, y: 1.6, z: kz }, { x: 1.99, y: 1.6, z: 1.33 }, facingRad(kioskFacing));
  const out = bearingVector(kioskFacing);
  const bulb = new PointLight(KIOSK_LAMP.color);
  bulb.name = 'kiosk_bulb';
  bulb.power = KIOSK_LAMP.power;
  bulb.distance = KIOSK_LAMP.distance;
  bulb.decay = 2;
  bulb.position.set(kx + out.x * KIOSK_LAMP.out, KIOSK_LAMP.height, kz + out.z * KIOSK_LAMP.out);
  root.add(bulb);
  kiosk.updateMatrixWorld(true);
  for (const [x, y, z, yaw] of p.kiosk.newspapers) {
    const at = new Vector3(x, y, z).applyMatrix4(kiosk.matrixWorld);
    const paper = placeModel(paperModel.scene, at.x, at.y, at.z, kioskFacing + yaw);
    root.add(paper);
  }

  const npcs: Npc[] = [];
  const addNpc = (gltf: typeof ownerModel, x: number, z: number, facing: number, behaviour: 'shout' | 'glare', armsDownDeg: number, seed: number): Npc => {
    const npc = new Npc(gltf, { behaviour, armsDownDeg, seed });
    npc.root.position.set(x, 0, z);
    npc.root.rotation.y = facingRad(facing);
    root.add(npc.root);
    // Kept on the NPC so a person who leaves the plaza (Anvin) stops blocking the way.
    npc.root.userData['collider'] = physics.addStaticCylinder({ x, y: 0.88, z }, 0.88, 0.28);
    npcs.push(npc);
    return npc;
  };
  const ownerOff = p.kiosk.owner.offset;
  // The owner faces out over the plaza, shouting at passers-by. The death clip is never played.
  addNpc(ownerModel, kx + out.x * ownerOff, kz + out.z * ownerOff, kioskFacing, 'shout', OWNER_ARMS_DOWN_DEG, 0).root.name = 'kiosk_owner';
  // A citizen glares at Anvin across the plaza (and at the player up close).
  const [c0, c1] = p.citizens;
  if (c0 && c1) {
    // Anvin, "city repair crew", by the circuit panel on the pyramid's base, facing the plaza.
    addNpc(citizenModels[0]!, c0.position[0], c0.position[2], bearingToward(c0.position, [0, 0, -182]), 'glare', T_POSE_ARMS_DOWN_DEG, 1).root.name = 'anvin';
    addNpc(citizenModels[1]!, c1.position[0], c1.position[2], bearingToward(c1.position, c0.position), 'glare', T_POSE_ARMS_DOWN_DEG, 2).root.name = 'citizen_1';
  }

  const perches = Object.fromEntries(
    Object.entries(p.perches).map(([id, pr]) => [id, { position: new Vector3(...pr.position), facing: pr.facing }]),
  );

  return {
    root,
    pyramid,
    npcs,
    perches,
    viewpoints: plazaViewpoints(p),
    menuOrbit: menuOrbitOf(p),
    update(dt: number, eye: Vector3): void {
      pyramid.update(dt);
      for (const n of npcs) n.update(dt, eye);
    },
    async attachFritz(fritz: Fritz): Promise<void> {
      for (const [id, pr] of Object.entries(perches)) fritz.addPerch(id, pr.position, pr.facing);
      const crow = await loadModel('raven_rigged');
      const scene = cloneSkinned(crow.scene);
      scene.traverse((c) => {
        const m = c as Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        m.frustumCulled = false;
        // The crow's black feathers become copper: the texture's light and shade over a copper base.
        const tint = (mat: Material): Material => {
          const src = mat as MeshStandardMaterial;
          const m = new MeshStandardNodeMaterial({ side: src.side, alphaTest: 0.5, metalness: 0.6, roughness: 0.42 });
          m.name = 'FritzCopper';
          if (src.map) {
            const t = texture(src.map);
            m.colorNode = color(FRITZ_COPPER).mul(luminance(t.rgb).mul(2.4).add(0.3));
            m.opacityNode = t.a;
          } else m.color.set(FRITZ_COPPER);
          // A faint warm glow of clockwork heat, so he reads against dark cobbles at night.
          m.emissive.set(FRITZ_COPPER);
          m.emissiveIntensity = 0.35;
          return m;
        };
        m.material = Array.isArray(m.material) ? m.material.map(tint) : tint(m.material);
      });
      // Only clip is root|TakeOff; Fritz's motion stays procedural (wings folded on the perch).
      fritz.attachModel({ scene, animations: [] }, { wingAxes: 'world' });
    },
  };
}
