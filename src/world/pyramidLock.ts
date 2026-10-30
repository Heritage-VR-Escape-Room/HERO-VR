/**
 * The pyramid's brass door with its cipher-disc lock, built as `LockParts`
 * for CipherLock (spec §7 beats 3 and 6): a 0.9 x 1.1 m door leaf engraved
 * "Y O F Z" (canvas height map, normal from height), an outer fixed A-Z ring
 * of radius 0.16 m, an inner rotating ring of radius 0.11 m, four tumblers
 * and a pull handle.
 *
 * Local frame as lockMeshes: faces +Z, origin at the centre of the door
 * opening, which is flush with the wall face (z = 0). The door hangs from its
 * left edge and swings out toward the player.
 */
import {
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  RingGeometry,
  CanvasTexture,
  NoColorSpace,
} from 'three/webgpu';
import { labelTexture, ringTexture, TUMBLER_COUNT, type LockParts } from '../puzzles/lockMeshes';
import { engravedBrassMaterial } from './plazaMaterials';
import type { PbrSet } from './pbr';

export const DOOR = { width: 0.9, height: 1.1, thickness: 0.045 } as const;
export const RING = { outer: 0.16, inner: 0.11 } as const;
const DIAL_Y = 0.1;
const TUMBLER_Y = -0.2;
const HANDLE_Y = -0.38;
const ENGRAVING_Y = 0.36;

const BRASS = '#9a7640';
const BRASS_LIGHT = '#c09a5c';

const brass = (c: string, rough = 0.5): MeshStandardMaterial => new MeshStandardMaterial({ color: c, roughness: rough, metalness: 0.8 });
const lit = (map: CanvasTexture): MeshStandardMaterial => new MeshStandardMaterial({ map, roughness: 0.55, metalness: 0.35 });

/** Height map for the door leaf: plate = 1, grooves = 0 (a border, rivets, and the engraved letters). */
function doorHeightMap(letters: string): CanvasTexture {
  const w = 512;
  const h = Math.round((w * DOOR.height) / DOOR.width);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#000';
  g.lineWidth = 6;
  g.strokeRect(18, 18, w - 36, h - 36);
  g.lineWidth = 3;
  g.strokeRect(34, 34, w - 68, h - 68);
  g.fillStyle = '#000';
  for (const [x, y] of [
    [26, 26],
    [w - 26, 26],
    [26, h - 26],
    [w - 26, h - 26],
  ] as const) {
    g.beginPath();
    g.arc(x, y, 6, 0, Math.PI * 2);
    g.fill();
  }
  // Engraved letters above the dial (centre at ENGRAVING_Y metres above the door centre).
  const py = h / 2 - (ENGRAVING_Y / DOOR.height) * h;
  g.font = `bold ${Math.round(h * 0.085)}px "Times New Roman", serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letters.split('').join('  '), w / 2, py);
  g.lineWidth = 2;
  g.strokeRect(w * 0.22, py - h * 0.065, w * 0.56, h * 0.13);
  const t = new CanvasTexture(c);
  t.colorSpace = NoColorSpace;
  t.anisotropy = 8;
  return t;
}

/** `withDial: false` builds a plain compartment door (engraving, handle and hinges, no cipher dial or tumblers). */
export function buildPyramidLock(brassSet: PbrSet, engraved = 'YOFZ', withDial = true): LockParts {
  const root = new Group();
  root.name = 'cipher_lock';

  const doorPivot = new Group();
  doorPivot.name = 'door_pivot';
  doorPivot.position.set(-DOOR.width / 2, 0, 0);
  root.add(doorPivot);
  const face = new Group();
  face.position.x = DOOR.width / 2;
  doorPivot.add(face);

  const leaf = new Mesh(new BoxGeometry(DOOR.width - 0.01, DOOR.height - 0.01, DOOR.thickness), [
    brass(BRASS, 0.5),
    brass(BRASS, 0.5),
    brass(BRASS, 0.5),
    brass(BRASS, 0.5),
    engravedBrassMaterial(brassSet, doorHeightMap(engraved)),
    brass('#5a4524', 0.6),
  ]);
  leaf.name = 'door_leaf';
  leaf.position.z = -DOOR.thickness / 2;
  leaf.castShadow = leaf.receiveShadow = true;
  face.add(leaf);
  const front = 0.001;

  // Dial: a backing boss, the fixed outer A-Z ring, the rotating inner disc, a centre cap and a pointer at 12 o'clock.
  const dial = new Group();
  dial.position.set(0, DIAL_Y, front);
  if (withDial) face.add(dial);
  const body = new Mesh(new CylinderGeometry(RING.outer + 0.02, RING.outer + 0.025, 0.02, 64), brass('#4a3719', 0.55));
  body.rotation.x = Math.PI / 2;
  body.position.z = 0.01;
  dial.add(body);
  const outer = new Mesh(new RingGeometry(RING.inner + 0.004, RING.outer, 96), lit(ringTexture(BRASS, RING.inner / RING.outer) as CanvasTexture));
  outer.position.z = 0.0205;
  dial.add(outer);
  const innerRing = new Mesh(new CircleGeometry(RING.inner, 96), lit(ringTexture(BRASS_LIGHT, 0.7) as CanvasTexture));
  innerRing.position.z = 0.023;
  dial.add(innerRing);
  const cap = new Mesh(new CylinderGeometry(0.025, 0.028, 0.014, 24), brass('#d8b36c', 0.35));
  cap.rotation.x = Math.PI / 2;
  cap.position.z = 0.03;
  dial.add(cap);
  const tick = new Mesh(new BoxGeometry(0.01, 0.022, 0.008), brass('#d8b36c', 0.35));
  tick.position.set(0, RING.outer + 0.012, 0.022);
  dial.add(tick);

  // Four tumblers in a housing below the dial.
  const housing = new Mesh(new BoxGeometry(0.4, 0.15, 0.03), brass('#4a3719', 0.55));
  housing.position.set(0, TUMBLER_Y, front + 0.015);
  if (withDial) face.add(housing);
  const tumblerFaces: Mesh[] = [];
  const draws: Array<(t: string) => void> = [];
  for (let i = 0; i < TUMBLER_COUNT; i++) {
    const x = (i - (TUMBLER_COUNT - 1) / 2) * 0.09;
    const lab = labelTexture('A', 64, 96, 'bold 60px "Times New Roman", serif', BRASS_LIGHT, true);
    const f = new Mesh(new PlaneGeometry(0.072, 0.11), lit(lab.tex as CanvasTexture));
    f.position.set(x, TUMBLER_Y, front + 0.031);
    f.userData['tumbler'] = i;
    if (withDial) face.add(f);
    tumblerFaces.push(f);
    draws.push(lab.draw);
  }

  // Pull handle on a pivot below the tumblers.
  const handlePivot = new Group();
  handlePivot.position.set(0, HANDLE_Y, front + 0.02);
  face.add(handlePivot);
  const handle = new Mesh(new CylinderGeometry(0.016, 0.016, 0.26, 16), brass('#d8b36c', 0.35));
  handle.rotation.z = Math.PI / 2;
  handle.position.z = 0.04;
  handle.userData['handle'] = true;
  handlePivot.add(handle);
  for (const sx of [-0.12, 0.12]) {
    const post = new Mesh(new CylinderGeometry(0.012, 0.014, 0.045, 12), brass('#d8b36c', 0.35));
    post.rotation.x = Math.PI / 2;
    post.position.set(sx, 0, 0.02);
    handlePivot.add(post);
  }
  // A big hinge strap on the left edge.
  for (const y of [0.4, -0.4]) {
    const strap = new Mesh(new BoxGeometry(0.14, 0.045, 0.012), brass('#3d2d14', 0.6));
    strap.position.set(-DOOR.width / 2 + 0.11, y, front + 0.006);
    face.add(strap);
  }

  const view = new Object3D();
  view.position.set(0, 0.0, 0.8);
  root.add(view);
  const steamOrigin = new Object3D();
  steamOrigin.position.set(0.3, 0, 0.06);
  root.add(steamOrigin);

  return {
    root,
    view,
    doorPivot,
    innerRing,
    tumblerFaces,
    setTumblerLetter: (i, letter) => draws[i]?.(letter),
    handlePivot,
    handle,
    steamOrigin,
  };
}
