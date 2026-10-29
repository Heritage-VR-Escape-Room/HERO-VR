/**
 * Primitive meshes for the cipher-disc lock (letters are canvas textures; A-Z
 * is Latin in every locale). Task 13 can hand CipherLock its own `LockParts`
 * built from the pyramid assembly instead.
 *
 * Local frame: the lock faces +Z, origin at the centre of the door opening.
 * The door hangs from its left edge (`doorPivot`); everything the player
 * works sits on the door and swings with it.
 */
import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  RingGeometry,
  SRGBColorSpace,
  type Texture,
} from 'three/webgpu';

export const LOCK_STEP_RAD = (Math.PI * 2) / 26;
export const TUMBLER_COUNT = 4;

export interface LockParts {
  root: Group;
  /** Camera pose while focused: a point in front of the dial, looking along -Z. */
  view: Object3D;
  /** Hinge on the door's left edge; rotation.y swings the door. */
  doorPivot: Object3D;
  /** The rotating inner alphabet ring (rotation.z). */
  innerRing: Object3D;
  /** One per tumbler; a hit on its upper half cycles forward, the lower half back. */
  tumblerFaces: Mesh[];
  /** Redraw the letter shown on tumbler i. */
  setTumblerLetter(i: number, letter: string): void;
  /** Tilts to pull; rotation.x. */
  handlePivot: Object3D;
  handle: Mesh;
  /** Where steam leaves the door seam, in root space. */
  steamOrigin: Object3D;
}

const BRASS = '#8a6d3b';
const BRASS_LIGHT = '#b08d57';
const INK = '#1c1710';

export function canvasTexture(c: HTMLCanvasElement): Texture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** A disc texture with 26 upright letters around the rim, A at the top, clockwise. */
export function ringTexture(face: string, innerFrac: number): Texture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const h = size / 2;
  g.fillStyle = face;
  g.fillRect(0, 0, size, size);
  g.fillStyle = INK;
  g.font = `bold ${Math.round(h * (1 - innerFrac) * 0.7)}px "Times New Roman", serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const r = h * (1 + innerFrac) * 0.5;
  for (let i = 0; i < 26; i++) {
    g.save();
    g.translate(h, h);
    g.rotate(i * LOCK_STEP_RAD);
    g.fillText(String.fromCharCode(65 + i), 0, -r);
    g.restore();
  }
  return canvasTexture(c);
}

/** A redrawable label (tumbler letters, engraved plates); `arrows` adds up/down carets. */
export function labelTexture(text: string, w: number, h: number, font: string, bg: string, arrows = false): { tex: Texture; draw(t: string): void } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const tex = canvasTexture(c);
  const draw = (t: string): void => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = INK;
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(t, w / 2, h / 2 + 2);
    if (arrows) {
      const m = w / 2;
      g.beginPath();
      g.moveTo(m - 12, 22);
      g.lineTo(m + 12, 22);
      g.lineTo(m, 8);
      g.moveTo(m - 12, h - 22);
      g.lineTo(m + 12, h - 22);
      g.lineTo(m, h - 8);
      g.fill();
    }
    tex.needsUpdate = true;
  };
  draw(text);
  return { tex, draw };
}

const brass = (color: string, rough = 0.45): MeshStandardMaterial =>
  new MeshStandardMaterial({ color, roughness: rough, metalness: 0.75 });
const lit = (map: Texture): MeshStandardMaterial => new MeshStandardMaterial({ map, roughness: 0.75, metalness: 0.15 });

export function buildLockMeshes(engraved = 'YOFZ'): LockParts {
  const root = new Group();
  root.name = 'cipher_lock';
  const frameMat = brass('#5c4a2a', 0.6);

  // Opening: a dim warm alcove behind the door, framed by four bars.
  const alcove = new Mesh(
    new BoxGeometry(0.52, 0.74, 0.02),
    new MeshStandardMaterial({ color: '#2a1d10', emissive: '#6b3d12', emissiveIntensity: 0.9, roughness: 0.9 }),
  );
  alcove.position.z = -0.03;
  root.add(alcove);
  for (const [w, h, x, y] of [
    [0.6, 0.04, 0, 0.39],
    [0.6, 0.04, 0, -0.39],
    [0.04, 0.82, -0.28, 0],
    [0.04, 0.82, 0.28, 0],
  ] as const) {
    const bar = new Mesh(new BoxGeometry(w, h, 0.06), frameMat);
    bar.position.set(x, y, 0.0);
    root.add(bar);
  }

  // Door hung from its left edge.
  const doorPivot = new Group();
  doorPivot.position.set(-0.26, 0, 0.035);
  root.add(doorPivot);
  const face = new Group();
  face.position.x = 0.26;
  doorPivot.add(face);
  face.add(new Mesh(new BoxGeometry(0.52, 0.74, 0.03), brass(BRASS)));

  // Engraved target letters above the dial.
  const plate = labelTexture(engraved.split('').join('  '), 256, 64, 'bold 40px "Times New Roman", serif', BRASS_LIGHT);
  const engr = new Mesh(new PlaneGeometry(0.3, 0.075), lit(plate.tex));
  engr.position.set(0, 0.29, 0.0165);
  face.add(engr);

  // Dial: fixed outer ring, rotating inner ring, boss.
  const dialY = 0.07;
  const dial = new Group();
  dial.position.set(0, dialY, 0.0165);
  face.add(dial);
  const body = new Mesh(new CylinderGeometry(0.18, 0.18, 0.008, 48), brass('#3d2f18', 0.6));
  body.rotation.x = Math.PI / 2;
  body.position.z = -0.006;
  dial.add(body);
  const outerR = 0.17;
  const innerR = 0.125;
  const outer = new Mesh(new RingGeometry(innerR + 0.005, outerR, 96), lit(ringTexture(BRASS, 0.76)));
  // RingGeometry UVs span the outer radius, so the texture is drawn for the full disc of radius `outerR`.
  dial.add(outer);
  const innerRing = new Mesh(new CircleGeometry(innerR, 96), lit(ringTexture(BRASS_LIGHT, 0.7)));
  innerRing.position.z = 0.002;
  dial.add(innerRing);
  const boss = new Mesh(new CylinderGeometry(0.03, 0.03, 0.012, 24), brass('#d2b06a', 0.3));
  boss.rotation.x = Math.PI / 2;
  boss.position.z = 0.012;
  dial.add(boss);
  // Pointer tick at the top, so the player can see which outer letter is "12 o'clock".
  const tick = new Mesh(new BoxGeometry(0.008, 0.02, 0.006), brass('#d2b06a', 0.3));
  tick.position.set(0, outerR + 0.012, 0.004);
  dial.add(tick);

  // Four tumblers.
  const tumblerFaces: Mesh[] = [];
  const draws: Array<(t: string) => void> = [];
  for (let i = 0; i < TUMBLER_COUNT; i++) {
    const x = (i - (TUMBLER_COUNT - 1) / 2) * 0.095;
    const housing = new Mesh(new BoxGeometry(0.08, 0.12, 0.03), brass('#3d2f18', 0.6));
    housing.position.set(x, -0.19, 0.012);
    face.add(housing);
    const lab = labelTexture('A', 64, 96, 'bold 60px "Times New Roman", serif', BRASS_LIGHT, true);
    const f = new Mesh(new PlaneGeometry(0.068, 0.102), lit(lab.tex));
    f.position.set(x, -0.19, 0.0275);
    f.userData['tumbler'] = i;
    face.add(f);
    tumblerFaces.push(f);
    draws.push(lab.draw);
  }

  // Handle: a lever on a pivot below the tumblers.
  const handlePivot = new Group();
  handlePivot.position.set(0, -0.31, 0.02);
  face.add(handlePivot);
  const handle = new Mesh(new BoxGeometry(0.22, 0.035, 0.03), brass('#d2b06a', 0.3));
  handle.position.z = 0.02;
  handle.userData['handle'] = true;
  handlePivot.add(handle);
  for (const sx of [-0.1, 0.1]) {
    const knob = new Mesh(new CylinderGeometry(0.018, 0.018, 0.04, 16), brass('#d2b06a', 0.3));
    knob.rotation.x = Math.PI / 2;
    knob.position.set(sx, 0, 0.02);
    handlePivot.add(knob);
  }

  const view = new Object3D();
  view.position.set(0, -0.02, 0.72);
  root.add(view);
  const steamOrigin = new Object3D();
  steamOrigin.position.set(0.0, 0.0, 0.06);
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
