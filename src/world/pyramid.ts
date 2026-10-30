/**
 * The founder's pyramid, built in code (docs/asset-picks.md): a 6.8 m red
 * sandstone pyramid on a square plinth, with the bronze plaque on its south
 * face, the brass door with the cipher-disc lock in the plinth below it, and
 * the 0.8 m alcove behind the door holding the jammer, the Vanguard manifesto
 * and the ticket-printer part (spec §7 beats 3-8).
 *
 * Local frame: origin at the pyramid's base centre, +Z north; the south face
 * (plaque, door) faces -Z. The root is placed but never rotated, so colliders
 * are the local boxes offset by the root position.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Group,
  MathUtils,
  Mesh,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  PointLight,
  SpotLight,
  SRGBColorSpace,
  Vector3,
  type Material,
} from 'three/webgpu';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { I18n } from '../logic/i18n';
import type { PlazaPlacement } from '../logic/plazaLayout';
import { LocalizedCanvasTexture } from '../render/canvasText';
import type { LockParts } from '../puzzles/lockMeshes';
import { GROUPS, type PhysicsWorld } from './colliders';
import { createJammer, type Jammer, type JammerSound } from './jammer';
import { bronzeMaterial, darkSteel, sandstoneMaterial } from './plazaMaterials';
import type { PbrSet } from './pbr';
import { buildPyramidLock } from './pyramidLock';
import { meterBox } from './schloss';

export const PLAQUE_ID = 'plaque';
export const MANIFESTO_ID = 'manifesto';
export const LENSES_ID = 'spectrum_lenses';
/** Warm 2700 K tungsten. */
const ALCOVE_COLOR = '#ffa957';
const ALCOVE_POWER = 40;
/**
 * Monument uplights: warm floods set into the paving in front of the south
 * face (plaque and door) and the north face (seen from the wake bench). The
 * streetlamps' 9 m reach stops well short of the pyramid. Not fog lights:
 * the fog's light budget goes to the lamps' halos.
 */
const FLOOD = { color: '#ffd09a', power: 260, distance: 16, angleDeg: 22, setback: 5 } as const;
/** CipherLock swings the door to -110 degrees. */
const DOOR_SWING_RAD = MathUtils.degToRad(110);

export interface PyramidDeps {
  physics: PhysicsWorld;
  i18n: I18n;
  sandstone: PbrSet;
  bronze: PbrSet;
  onJammerDisabled: () => void;
  onJammerSound?: (s: JammerSound) => void;
}

export interface Pyramid {
  root: Group;
  lockParts: LockParts;
  plaque: Mesh;
  plaqueText: LocalizedCanvasTexture;
  jammer: Jammer;
  manifesto: Mesh;
  lenses: Group;
  /** Where the circuit panel hangs on the plinth's south face (board front = local +Z). */
  panelAnchor: Group;
  /** Swing the compartment door open (instant when restoring a save). */
  openDoor(instant?: boolean): void;
  /** World centre of the door opening's front. */
  doorCenter: Vector3;
  /** Per frame: the door's swing lights the alcove and clears the door colliders once it is half open. */
  update(dt: number): void;
}

/** Square pyramid faces with flat normals and UVs in metres (u along the base edge, v up the slant). */
function pyramidBody(half: number, y0: number, height: number): BufferGeometry {
  const apex = new Vector3(0, y0 + height, 0);
  const slant = Math.hypot(half, height);
  const pos: number[] = [];
  const uvs: number[] = [];
  // Outward direction and the viewer's right for each face (east = -X).
  const faces: Array<[Vector3, Vector3]> = [
    [new Vector3(0, 0, -1), new Vector3(-1, 0, 0)], // south
    [new Vector3(0, 0, 1), new Vector3(1, 0, 0)], // north
    [new Vector3(-1, 0, 0), new Vector3(0, 0, 1)], // east
    [new Vector3(1, 0, 0), new Vector3(0, 0, -1)], // west
  ];
  for (const [out, right] of faces) {
    const mid = out.clone().multiplyScalar(half).setY(y0);
    const a = mid.clone().addScaledVector(right, -half);
    const b = mid.clone().addScaledVector(right, half);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, apex.x, apex.y, apex.z);
    uvs.push(0, 0, half * 2, 0, half, slant);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  g.computeVertexNormals();
  return g;
}

/** A sheet of typed paper for the manifesto prop (the readable text is in the document view). */
function paperTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 362;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d8cfb8';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#2a2622';
  g.font = 'bold 20px "Times New Roman", serif';
  g.textAlign = 'center';
  g.fillText('VANGUARD ARMAMENTS', 128, 40);
  g.fillStyle = '#5a554e';
  for (let y = 70; y < 320; y += 13) {
    const w = 170 + ((y * 37) % 40);
    g.fillRect(43, y, y > 300 ? 90 : w, 4);
  }
  g.strokeStyle = '#9b2a1f';
  g.lineWidth = 3;
  g.strokeRect(150, 300, 86, 40);
  g.fillStyle = '#9b2a1f';
  g.font = 'bold 13px sans-serif';
  g.fillText('GEHEIM', 193, 325);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** The Spectrum Lenses: brass-rimmed goggles with violet UV glass on a leather strap. */
function spectrumLenses(): Group {
  const g = new Group();
  g.name = LENSES_ID;
  const brass = new MeshStandardNodeMaterial({ color: '#b08a45', roughness: 0.3, metalness: 0.9 });
  const glass = new MeshStandardNodeMaterial({ color: '#7a3cff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.75 });
  glass.emissive.set('#5a1fd1');
  glass.emissiveIntensity = 1.6;
  const leather = new MeshStandardNodeMaterial({ color: '#3b2516', roughness: 0.85 });
  for (const x of [-0.045, 0.045]) {
    const rim = new Mesh(new CylinderGeometry(0.032, 0.032, 0.022, 20, 1, true), brass);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x, 0.03, 0);
    const lens = new Mesh(new CylinderGeometry(0.029, 0.029, 0.004, 20), glass);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(x, 0.03, 0.01);
    g.add(rim, lens);
  }
  const bridge = new Mesh(new BoxGeometry(0.03, 0.008, 0.01), brass);
  bridge.position.set(0, 0.04, 0);
  const strap = new Mesh(new BoxGeometry(0.2, 0.012, 0.06), leather);
  strap.position.set(0, 0.006, -0.03);
  // Stamped under the strap (faces down: found by turning the lenses over).
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const x = c.getContext('2d')!;
  x.fillStyle = '#3b2516';
  x.fillRect(0, 0, 512, 160);
  x.strokeStyle = '#c9a36a';
  x.lineWidth = 6;
  x.strokeRect(14, 14, 484, 132);
  x.fillStyle = '#d9b77a';
  x.font = 'bold 54px "Noto Sans", sans-serif';
  x.textAlign = 'center';
  x.fillText('VANGUARD', 256, 74);
  x.font = '34px "Noto Sans", sans-serif';
  x.fillText('PROTOTYPE SL-7', 256, 124);
  const stampTex = new CanvasTexture(c);
  stampTex.colorSpace = SRGBColorSpace;
  const stamp = new Mesh(new PlaneGeometry(0.17, 0.053), new MeshStandardNodeMaterial({ map: stampTex, roughness: 0.6 }));
  stamp.name = 'lenses_stamp';
  stamp.rotation.x = Math.PI / 2; // faces -Y
  stamp.position.set(0, -0.0005, -0.03);
  g.add(bridge, strap, stamp);
  g.traverse((o) => ((o as Mesh).isMesh ? ((o as Mesh).castShadow = true) : undefined));
  return g;
}

export function createPyramid(place: PlazaPlacement['pyramid'], deps: PyramidDeps): Pyramid {
  const { physics, i18n } = deps;
  const [px, py, pz] = place.position;
  const H = place.plinth.half;
  const P = place.plinth.height;
  const door = place.door;
  const dw = door.width / 2;
  const sill = door.sill;
  const lintel = sill + door.height;
  const back = -H + place.alcoveDepth; // z of the alcove's back wall
  const root = new Group();
  root.name = 'pyramid';
  root.position.set(px, py, pz);

  const stone = sandstoneMaterial(deps.sandstone);
  const plinthStone = sandstoneMaterial(deps.sandstone, { shade: 0.85 });
  const world = (x: number, y: number, z: number): { x: number; y: number; z: number } => ({ x: px + x, y: py + y, z: pz + z });

  /** A plinth block spanning [x0,x1] x [y0,y1] x [z0,z1], with a WORLD collider. */
  const block = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: Material, collide = true): void => {
    const m = new Mesh(meterBox(x1 - x0, y1 - y0, z1 - z0), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    if (collide)
      physics.addStaticBox(world(m.position.x, m.position.y, m.position.z), { x: (x1 - x0) / 2, y: (y1 - y0) / 2, z: (z1 - z0) / 2 }, 0, {
        surface: 'cobble',
      });
  };
  // Plinth around the door opening and alcove.
  block(-H, -dw, 0, P, -H, H, plinthStone);
  block(dw, H, 0, P, -H, H, plinthStone);
  block(-dw, dw, 0, P, back, H, plinthStone);
  block(-dw, dw, 0, sill, -H, back, plinthStone);
  block(-dw, dw, lintel, P, -H, back, plinthStone);
  // A low step at the foot and a cornice under the pyramid.
  block(-H - 0.25, H + 0.25, 0, 0.16, -H - 0.25, -H, plinthStone);
  block(-H - 0.25, H + 0.25, 0, 0.16, H, H + 0.25, plinthStone);
  block(-H - 0.25, -H, 0, 0.16, -H, H, plinthStone);
  block(H, H + 0.25, 0, 0.16, -H, H, plinthStone);
  block(-H - 0.1, H + 0.1, P - 0.14, P, -H - 0.1, -H + 0.2, stone, false);
  block(-H - 0.1, H + 0.1, P - 0.14, P, H - 0.2, H + 0.1, stone, false);
  block(-H - 0.1, -H + 0.2, P - 0.14, P, -H + 0.2, H - 0.2, stone, false);
  block(H - 0.2, H + 0.1, P - 0.14, P, -H + 0.2, H - 0.2, stone, false);

  const bodyHalf = place.bodyBaseHalf;
  const bodyH = place.height - P;
  const body = new Mesh(pyramidBody(bodyHalf, P, bodyH), stone);
  body.name = 'pyramid_body';
  body.castShadow = body.receiveShadow = true;
  root.add(body);
  // The body sits on the plinth; one box keeps anything from passing into it.
  physics.addStaticBox(world(0, P + 1, 0), { x: bodyHalf * 0.8, y: 1, z: bodyHalf * 0.8 });

  // Plaque on the sloped south face.
  const pl = place.plaque;
  const faceZ = (y: number): number => -bodyHalf * (1 - (y - P) / bodyH);
  const normal = new Vector3(0, bodyHalf / bodyH, -1).normalize();
  const plaqueCentre = new Vector3(0, pl.centerY, faceZ(pl.centerY));
  const plaqueText = new LocalizedCanvasTexture(i18n, 'plaque.inscription', {
    width: 1200,
    height: 800,
    font: (l) => (l === 'ar' ? '70px "Amiri", "Noto Naskh Arabic", serif' : '66px "IM Fell English", serif'),
    color: '#fff',
    lineHeight: 112,
    align: 'center',
    padding: 70,
    header: { key: 'plaque.latin', font: '50px "IM Fell English", serif', lineHeight: 96 },
    headerGap: 80,
    decorate: (ctx, w, h) => {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 10;
      ctx.strokeRect(30, 30, w - 60, h - 60);
      ctx.lineWidth = 3;
      ctx.strokeRect(52, 52, w - 104, h - 104);
    },
  });
  plaqueText.texture.anisotropy = 8;
  const bronzePlain = bronzeMaterial(deps.bronze);
  const plaque = new Mesh(new BoxGeometry(pl.width, pl.height, 0.03), [
    bronzePlain,
    bronzePlain,
    bronzePlain,
    bronzePlain,
    bronzeMaterial(deps.bronze, { text: plaqueText.texture, tileM: 0.5 }),
    bronzePlain,
  ]);
  plaque.name = PLAQUE_ID;
  plaque.position.copy(plaqueCentre).addScaledVector(normal, 0.016);
  plaque.lookAt(plaque.position.clone().add(normal));
  plaque.castShadow = plaque.receiveShadow = true;
  root.add(plaque);
  physics.addStaticBox(world(plaque.position.x, plaque.position.y, plaque.position.z), { x: pl.width / 2, y: 0.36, z: 0.2 }, 0, {
    group: GROUPS.INTERACTABLE,
    id: PLAQUE_ID,
  });

  // Uplights: a flood in the paving in front of the south and north faces.
  const floodHousing = darkSteel('FloodHousing');
  const floodLens = new MeshStandardNodeMaterial({ color: '#000' });
  floodLens.emissive.set(FLOOD.color);
  floodLens.emissiveIntensity = 8;
  for (const side of [-1, 1] as const) {
    const z = side * (H + FLOOD.setback);
    const housing = new Mesh(new BoxGeometry(0.34, 0.1, 0.24), floodHousing);
    housing.position.set(0, 0.05, z);
    const lens = new Mesh(new PlaneGeometry(0.28, 0.18), floodLens);
    lens.rotation.x = -Math.PI / 2;
    lens.position.set(0, 0.101, z);
    housing.receiveShadow = true;
    root.add(housing, lens);
    const flood = new SpotLight(FLOOD.color);
    flood.name = side < 0 ? 'flood_south' : 'flood_north';
    flood.power = FLOOD.power;
    flood.distance = FLOOD.distance;
    flood.angle = MathUtils.degToRad(FLOOD.angleDeg);
    flood.penumbra = 0.85;
    flood.decay = 2;
    flood.userData.fogScatter = false;
    flood.position.set(0, 0.15, z);
    flood.target.position.set(0, side < 0 ? pl.centerY : 2.6, side * (bodyHalf * 0.55));
    root.add(flood, flood.target);
  }

  // Brass door with the lock, in the opening's front plane.
  // The compartment door: plain brass engraved with the founding year (MDCCXV = 1715).
  const lockParts = buildPyramidLock(deps.bronze, 'MDCCXV', false);
  lockParts.root.position.set(0, sill + door.height / 2, -H);
  lockParts.root.rotation.y = Math.PI;
  root.add(lockParts.root);
  const doorCenter = new Vector3(px, py + sill + door.height / 2, pz - H);
  const doorWorld: RAPIER.Collider | null = physics.addStaticBox(
    world(0, sill + door.height / 2, -H + 0.0225),
    { x: dw, y: door.height / 2, z: 0.0225 },
    0,
    { surface: 'metal' },
  );
  // The circuit panel, on the plinth face to the right of the door (seen from the south).
  const panelAnchor = new Group();
  panelAnchor.name = 'panel_anchor';
  panelAnchor.position.set(-1.45, sill + 0.7, -H - 0.005);
  panelAnchor.rotation.y = Math.PI;
  root.add(panelAnchor);
  physics.addStaticBox(world(-1.45, sill + 0.7, -H - 0.1), { x: 0.36, y: 0.3, z: 0.1 }, 0, { group: GROUPS.INTERACTABLE, id: 'circuit_bridge' });
  // The player never steps into the alcove (reach-in only); not a WORLD occluder.
  physics.addStaticBox(world(0, sill + door.height / 2, (-H + back) / 2), { x: dw, y: door.height / 2, z: (back + H) / 2 }, 0, {
    group: GROUPS.BLOCKER,
  });

  // Alcove: warm light (on once the door opens), the jammer, the manifesto and the part.
  const alcoveLight = new PointLight(ALCOVE_COLOR, 0, 1.6, 2);
  alcoveLight.name = 'alcove_light';
  alcoveLight.userData.fogScatter = false;
  alcoveLight.position.set(0, lintel - 0.12, (back - H) / 2 + 0.1);
  root.add(alcoveLight);

  const jammer = createJammer({ onDisabled: deps.onJammerDisabled, onSound: deps.onJammerSound });
  jammer.root.position.set(0.05, sill, back - 0.17);
  jammer.root.rotation.y = Math.PI;
  root.add(jammer.root);
  jammer.indicator.position.set(0, sill + 0.02, -H - 0.05);
  root.add(jammer.indicator);
  const jp = jammer.root.position;
  physics.addStaticBox(world(jp.x, sill + 0.15, jp.z), { x: 0.21, y: 0.15, z: 0.15 }, 0, { group: GROUPS.INTERACTABLE, id: 'jammer' });

  const manifesto = new Mesh(new PlaneGeometry(0.21, 0.297), new MeshStandardNodeMaterial({ map: paperTexture(), roughness: 0.85 }));
  manifesto.name = MANIFESTO_ID;
  manifesto.rotation.set(-Math.PI / 2, 0, Math.PI + 0.25);
  manifesto.position.set(0.22, sill + 0.003, -H + 0.22);
  manifesto.receiveShadow = true;
  root.add(manifesto);
  physics.addStaticBox(world(0.22, sill + 0.02, -H + 0.22), { x: 0.12, y: 0.03, z: 0.16 }, 0, { group: GROUPS.INTERACTABLE, id: MANIFESTO_ID });

  const lenses = spectrumLenses();
  lenses.position.set(-0.24, sill, -H + 0.2);
  lenses.rotation.y = Math.PI + 0.3;
  root.add(lenses);
  physics.addStaticBox(world(-0.24, sill + 0.04, -H + 0.2), { x: 0.11, y: 0.05, z: 0.09 }, 0, { group: GROUPS.INTERACTABLE, id: LENSES_ID });

  let doorColliders: Array<RAPIER.Collider | null> = [doorWorld];
  let doorT = -1; // seconds into the swing; -1 = closed
  const DOOR_SEC = 1.2;
  return {
    root,
    lockParts,
    plaque,
    plaqueText,
    jammer,
    manifesto,
    lenses,
    panelAnchor,
    doorCenter,
    openDoor(instant = false) {
      if (doorT < 0 || instant) doorT = instant ? DOOR_SEC : 0;
    },
    update(dt: number): void {
      if (doorT >= 0 && doorT <= DOOR_SEC) {
        doorT = Math.min(DOOR_SEC, doorT + dt);
        const t = doorT / DOOR_SEC;
        lockParts.doorPivot.rotation.y = -DOOR_SWING_RAD * t * t * (3 - 2 * t);
        if (doorT >= DOOR_SEC) doorT = DOOR_SEC + 1;
      }
      const doorOpen = MathUtils.clamp(-lockParts.doorPivot.rotation.y / DOOR_SWING_RAD, 0, 1);
      alcoveLight.intensity = (ALCOVE_POWER / (4 * Math.PI)) * Math.min(1, doorOpen * 1.5);
      if (doorOpen >= 0.5 && doorColliders.length) {
        for (const c of doorColliders) if (c) physics.removeCollider(c);
        doorColliders = [];
      }
      jammer.update(dt);
    },
  };
}
