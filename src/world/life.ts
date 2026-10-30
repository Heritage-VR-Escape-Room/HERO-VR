/**
 * Plaza life (owner request): cyclists circling the plaza with their bells,
 * two locals arguing about Port Said, a policeman on watch under a lamp,
 * people coughing in the mist, a stray dog sniffing round the kiosk, pigeons
 * that scatter as the player walks through them, and a newspaper the wind
 * pushes across the cobbles. All procedural on placeholder models; Low
 * graphics run fewer cyclists and pigeons.
 */
import {
  AnimationMixer,
  CanvasTexture,
  DoubleSide,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type Bone,
  type Object3D,
  type SkinnedMesh,
} from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { I18n } from '../logic/i18n';
import { loadModel } from './assets';
import { GROUPS, type PhysicsWorld } from './colliders';
import { cullWithFixedSphere, Npc } from './npc';

export type LifeSound = 'bike_bell' | 'dog_bark' | 'pigeon_flutter' | 'cough';

type XZ = { x: number; z: number };

export interface LifeDeps {
  physics: PhysicsWorld;
  i18n: I18n;
  groundAt: (x: number, z: number) => number;
  /** Plaza centre. */
  center: XZ;
  /** Fewer cyclists and pigeons on Low. */
  low: boolean;
  onSound: (s: LifeSound, at: Vector3) => void;
}

export interface TalkablePerson {
  role: 'police' | 'local_m' | 'local_f';
  root: Object3D;
}

export interface PlazaLife {
  root: Group;
  /** People the player can talk to (the main game registers their interactables). */
  people: TalkablePerson[];
  /** The newspaper, readable while it lies still. */
  /** The newspaper; `restingAt()` is the spot index it lies still at, or -1 while it blows. */
  newspaper: { object: Object3D; restingAt(): number };
  /** Where the arguing pair stand (overheard lines play nearby). */
  argueAt: XZ;
  policeAt: XZ;
  update(dt: number, player: Vector3): void;
}

const T_POSE_ARMS_DOWN_DEG = 86;
const facing = (from: XZ, to: XZ): number => Math.atan2(to.x - from.x, to.z - from.z);

function placeNpc(n: Npc, at: XZ, look: XZ, groundAt: LifeDeps['groundAt']): void {
  n.root.position.set(at.x, groundAt(at.x, at.z), at.z);
  n.root.rotation.y = facing(at, look);
}

// --- Cyclists -------------------------------------------------------------

interface Cyclist {
  root: Group;
  rider: Npc;
  /** Angle on the loop (radians) and its direction. */
  a: number;
  dir: 1 | -1;
  radius: number;
  speed: number;
  bellIn: number;
}

const CYCLE_SPEED = 4.2;
/** Bicycle wheel circumference (m) per crank turn, for the pedal cadence. */
const METRES_PER_CRANK = 4.5;

// --- Pigeons ----------------------------------------------------------------

interface Pigeon {
  root: Object3D;
  mixer: AnimationMixer;
  home: Vector3;
  /** 'ground' pecking, 'fly' scattering, 'away' gone until `back`. */
  state: 'ground' | 'fly' | 'away';
  vel: Vector3;
  t: number;
}

// --- Dog ------------------------------------------------------------------------

interface DogRig {
  legs: Array<{ bone: Bone; rest: Quaternion; phase: number }>;
  tail: Array<{ bone: Bone; rest: Quaternion }>;
  head?: { bone: Bone; rest: Quaternion };
}

/** A sheet of newspaper: masthead and a headline in the current language. */
function newspaperTexture(i18n: I18n): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 360;
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const draw = (): void => {
    const g = c.getContext('2d')!;
    g.fillStyle = '#d9d2bf';
    g.fillRect(0, 0, 512, 360);
    g.fillStyle = '#1d1a16';
    g.font = 'bold 34px "IM Fell English", serif';
    g.textAlign = 'center';
    g.fillText('Badische Abendpost', 256, 46);
    g.fillRect(24, 60, 464, 3);
    g.font = 'bold 40px "Noto Sans", "Noto Naskh Arabic", sans-serif';
    g.direction = i18n.dir() === 'rtl' ? 'rtl' : 'ltr';
    g.fillText(i18n.t('doc.newspaper.headline'), 256, 118, 470);
    g.fillStyle = '#5b554b';
    for (let y = 150; y < 340; y += 14) {
      g.fillRect(24, y, 140, 6);
      g.fillRect(186, y, 140, 6);
      g.fillRect(348, y, 140, 6);
    }
    tex.needsUpdate = true;
  };
  draw();
  i18n.onChange(draw);
  return tex;
}

export async function createPlazaLife(d: LifeDeps): Promise<PlazaLife> {
  const root = new Group();
  root.name = 'plaza_life';
  const c = d.center;
  const at = (dx: number, dz: number): XZ => ({ x: c.x + dx, z: c.z + dz });
  const [eric, claudia, carla, police, bicycle, dogModel, pigeonModel, kioskMan] = await Promise.all([
    loadModel('human_npc_m2'),
    loadModel('human_npc_f2'),
    loadModel('human_npc_f'),
    loadModel('police'),
    loadModel('bicycle'),
    loadModel('dog'),
    loadModel('pigeon'),
    loadModel('human_npc_m'),
  ]);
  const npcs: Npc[] = [];
  const cough = (n: Npc): void => d.onSound('cough', n.root.position.clone().setY(n.root.position.y + 1.5));
  const addCollider = (p: XZ, id: string): void => {
    d.physics.addStaticCylinder({ x: p.x, y: 0.88, z: p.z }, 0.88, 0.28);
    d.physics.addStaticBox({ x: p.x, y: 0.95, z: p.z }, { x: 0.38, y: 0.95, z: 0.38 }, 0, { group: GROUPS.INTERACTABLE, id });
  };

  // Two locals arguing about who brought the fog, on the open south-west side of the plaza.
  const argueAt = at(14, -7);
  const mPos = at(13.4, -7);
  const fPos = at(14.6, -6.8);
  const man = new Npc(eric, { behaviour: 'argue', armsDownDeg: T_POSE_ARMS_DOWN_DEG, seed: 3, coughEvery: [22, 40], onCough: cough });
  const woman = new Npc(claudia, { behaviour: 'argue', armsDownDeg: T_POSE_ARMS_DOWN_DEG, seed: 5 });
  placeNpc(man, mPos, fPos, d.groundAt);
  placeNpc(woman, fPos, mPos, d.groundAt);
  man.root.name = 'local_m';
  woman.root.name = 'local_f';
  addCollider(mPos, 'npc_local_m');
  addCollider(fPos, 'npc_local_f');

  // A policeman on watch under the south-east lamp.
  const policeAt = at(-15, -15.6);
  const cop = new Npc(police, { behaviour: 'police', armsDownDeg: T_POSE_ARMS_DOWN_DEG, seed: 7, coughEvery: [30, 55], onCough: cough });
  placeNpc(cop, policeAt, c, d.groundAt);
  cop.root.name = 'police';
  addCollider(policeAt, 'npc_police');

  // A man by the bench coughing into his sleeve.
  const cougherAt = at(12, 16);
  // (The owner's model rests in an A-pose: a small drop brings the arms down.)
  const cougher = new Npc(kioskMan, { behaviour: 'glare', armsDownDeg: 10, seed: 9, coughEvery: [7, 14], onCough: cough });
  placeNpc(cougher, cougherAt, at(0, 0), d.groundAt);
  d.physics.addStaticCylinder({ x: cougherAt.x, y: 0.88, z: cougherAt.z }, 0.88, 0.28);
  npcs.push(man, woman, cop, cougher);
  for (const n of npcs) root.add(n.root);

  // --- Cyclists: two rings round the plaza, opposite ways. -------------------------
  const cyclists: Cyclist[] = [];
  const riderModels = [eric, claudia, carla];
  const count = d.low ? 2 : 4;
  for (let i = 0; i < count; i++) {
    const g = new Group();
    g.name = `cyclist_${i}`;
    const bike = bicycle.scene.clone(true);
    bike.rotation.y = -Math.PI / 2; // the model's length runs along +X; ride along +Z
    const rider = new Npc(riderModels[i % riderModels.length]!, { behaviour: 'ride', armsDownDeg: 60, seed: 11 + i });
    rider.root.position.set(0, -0.12, -0.36);
    g.add(bike, rider.root);
    root.add(g);
    const outer = i % 2 === 0;
    cyclists.push({
      root: g,
      rider,
      a: (i / count) * Math.PI * 2,
      dir: outer ? 1 : -1,
      radius: outer ? 31 : 27.5,
      speed: CYCLE_SPEED * (0.85 + 0.3 * Math.random()),
      bellIn: 6 + Math.random() * 14,
    });
  }

  // --- Pigeons pecking north of the pyramid. -------------------------------------
  const clip = pigeonModel.animations[0];
  const pigeons: Pigeon[] = [];
  const flock = d.low ? 4 : 7;
  for (let i = 0; i < flock; i++) {
    const p = cloneSkinned(pigeonModel.scene) as Object3D;
    const hx = c.x + (Math.random() - 0.5) * 6;
    const hz = c.z + 6.5 + Math.random() * 4;
    const home = new Vector3(hx, d.groundAt(hx, hz), hz);
    p.position.copy(home);
    p.rotation.y = Math.random() * Math.PI * 2;
    p.traverse((o) => ((o as SkinnedMesh).isSkinnedMesh ? cullWithFixedSphere(o as SkinnedMesh, 2) : undefined));
    const mixer = new AnimationMixer(p);
    if (clip) {
      const act = mixer.clipAction(clip);
      act.time = Math.random() * clip.duration;
      act.play();
    }
    root.add(p);
    pigeons.push({ root: p, mixer, home, state: 'ground', vel: new Vector3(), t: Math.random() * 10 });
  }

  // --- The dog: wanders round the kiosk, sniffing, wagging; barks at the player. ---------
  const dog = cloneSkinned(dogModel.scene) as Object3D;
  const dogRoot = new Group();
  dogRoot.name = 'dog';
  dogRoot.add(dog);
  root.add(dogRoot);
  const rig: DogRig = { legs: [], tail: [] };
  dog.traverse((o) => {
    const b = o as Bone;
    if ((o as SkinnedMesh).isSkinnedMesh) cullWithFixedSphere(o as SkinnedMesh);
    if (!b.isBone) return;
    const n = b.name.toLowerCase();
    const rest = b.quaternion.clone();
    if (/^(front_)?thigh\.[lr]/.test(n)) rig.legs.push({ bone: b, rest, phase: (n.startsWith('front') ? 0 : Math.PI) + (n.includes('.l') ? 0 : Math.PI) });
    else if (/^spine\.00[123]_/.test(n)) rig.tail.push({ bone: b, rest });
    else if (/^head_/.test(n)) rig.head = { bone: b, rest };
  });
  // Point the model's head along +Z (its length runs along X).
  dogRoot.updateMatrixWorld(true);
  const headX = rig.head ? rig.head.bone.getWorldPosition(new Vector3()).x - dogRoot.position.x : 1;
  dog.rotation.y = headX > 0 ? -Math.PI / 2 : Math.PI / 2;
  const dogPath: XZ[] = [at(-14, 14), at(-21, 16.5), at(-23, 8), at(-15, 5), at(-9, 9)];
  let dogTarget = 0;
  let dogPause = 2;
  let dogT = 0;
  let barkCool = 0;
  dogRoot.position.set(dogPath[0]!.x, d.groundAt(dogPath[0]!.x, dogPath[0]!.z), dogPath[0]!.z);

  // --- The newspaper: blown along by gusts, then still for a while. ---------------------
  const paperMat = new MeshStandardMaterial({ map: newspaperTexture(d.i18n), roughness: 0.9, side: DoubleSide });
  const paper = new Mesh(new PlaneGeometry(0.42, 0.3), paperMat);
  paper.name = 'newspaper';
  const paperRoot = new Group();
  paperRoot.add(paper);
  root.add(paperRoot);
  const paperSpots: XZ[] = [at(6, -7), at(-4, -9.5), at(-9, 3), at(4, 4.5)];
  let paperSpot = 0;
  let paperT = 0;
  let paperFrom = new Vector3();
  let paperMoving = false;
  const paperRest = (): void => {
    const s = paperSpots[paperSpot]!;
    paperRoot.position.set(s.x, d.groundAt(s.x, s.z) + 0.01, s.z);
    paper.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI);
  };
  paperRest();
  // The paper is readable wherever it comes to rest.
  for (const [i, s] of paperSpots.entries()) {
    d.physics.addStaticBox({ x: s.x, y: d.groundAt(s.x, s.z) + 0.1, z: s.z }, { x: 0.35, y: 0.12, z: 0.35 }, 0, {
      group: GROUPS.INTERACTABLE,
      id: `newspaper_${i}`,
    });
  }

  // Background life casts no shadows: every skinned mesh in the shadow pass is
  // drawn again per shadow map, which halved the frame rate on Medium.
  root.traverse((o) => {
    if ((o as Mesh).isMesh) o.castShadow = false;
  });

  const tmp = new Vector3();
  return {
    root,
    people: [
      { role: 'police', root: cop.root },
      { role: 'local_m', root: man.root },
      { role: 'local_f', root: woman.root },
    ],
    newspaper: { object: paper, restingAt: () => (paperMoving ? -1 : paperSpot) },
    argueAt,
    policeAt,
    update(dt, player) {
      for (const n of npcs) n.update(dt, player);

      // Cyclists: ride the ring, slow and ring the bell when the player is in the way.
      for (const cy of cyclists) {
        const ahead = cy.a + (cy.dir * 4) / cy.radius;
        tmp.set(c.x + Math.sin(ahead) * cy.radius, 0, c.z + Math.cos(ahead) * cy.radius);
        const blocked = Math.hypot(player.x - tmp.x, player.z - tmp.z) < 2.6;
        const v = blocked ? 0 : cy.speed;
        cy.a += (cy.dir * v * dt) / cy.radius;
        const x = c.x + Math.sin(cy.a) * cy.radius;
        const z = c.z + Math.cos(cy.a) * cy.radius;
        cy.root.position.set(x, d.groundAt(x, z), z);
        // Tangent of the circle in the riding direction.
        cy.root.rotation.y = Math.atan2(Math.cos(cy.a), -Math.sin(cy.a)) + (cy.dir < 0 ? Math.PI : 0);
        cy.root.rotation.z = -cy.dir * 0.08; // lean into the curve
        cy.rider.pedal += (v * dt * Math.PI * 2) / METRES_PER_CRANK;
        cy.rider.update(dt, player);
        cy.bellIn -= dt;
        if ((blocked && cy.bellIn < 12) || cy.bellIn <= 0) {
          d.onSound('bike_bell', cy.root.position.clone().setY(1.1));
          cy.bellIn = 10 + Math.random() * 18;
        }
      }

      // Pigeons: peck; scatter when the player comes within 4 m; come back later.
      for (const p of pigeons) {
        p.t += dt;
        p.mixer.update(dt * (p.state === 'fly' ? 3 : 1));
        if (p.state === 'ground') {
          p.root.position.y = p.home.y + Math.max(0, Math.sin(p.t * 5)) * 0.015;
          if (Math.hypot(player.x - p.root.position.x, player.z - p.root.position.z) < 4) {
            p.state = 'fly';
            p.t = 0;
            tmp.set(p.root.position.x - player.x, 0, p.root.position.z - player.z).normalize();
            p.vel.set(tmp.x * 4 + (Math.random() - 0.5) * 2, 3.5 + Math.random() * 1.5, tmp.z * 4 + (Math.random() - 0.5) * 2);
            p.root.rotation.y = Math.atan2(p.vel.x, p.vel.z);
            d.onSound('pigeon_flutter', p.root.position);
          }
        } else if (p.state === 'fly') {
          p.root.position.addScaledVector(p.vel, dt);
          p.vel.y += 0.6 * dt;
          if (p.t > 6) {
            p.state = 'away';
            p.root.visible = false;
            p.t = 0;
          }
        } else if (p.t > 25 && Math.hypot(player.x - p.home.x, player.z - p.home.z) > 12) {
          p.state = 'ground';
          p.root.visible = true;
          p.root.position.copy(p.home);
        }
      }

      // Dog: trot between sniffing spots; bark once at the player now and then.
      dogT += dt;
      barkCool -= dt;
      const goal = dogPath[dogTarget]!;
      const dx = goal.x - dogRoot.position.x;
      const dz = goal.z - dogRoot.position.z;
      const dist = Math.hypot(dx, dz);
      let moving = false;
      if (dogPause > 0) dogPause -= dt;
      else if (dist < 0.3) {
        dogTarget = (dogTarget + 1) % dogPath.length;
        dogPause = 2 + Math.random() * 4;
      } else {
        moving = true;
        const step = Math.min(dist, 1.1 * dt);
        dogRoot.position.x += (dx / dist) * step;
        dogRoot.position.z += (dz / dist) * step;
        dogRoot.position.y = d.groundAt(dogRoot.position.x, dogRoot.position.z);
        const want = Math.atan2(dx, dz);
        dogRoot.rotation.y += MathUtils.clamp(MathUtils.euclideanModulo(want - dogRoot.rotation.y + Math.PI, Math.PI * 2) - Math.PI, -3 * dt, 3 * dt);
      }
      const dq = new Quaternion();
      const side = new Vector3(1, 0, 0);
      for (const l of rig.legs) {
        dq.setFromAxisAngle(side, moving ? 0.45 * Math.sin(dogT * 9 + l.phase) : 0);
        l.bone.quaternion.copy(l.rest).multiply(dq);
      }
      for (const [i, tb] of rig.tail.entries()) {
        dq.setFromAxisAngle(new Vector3(0, 0, 1), 0.35 * Math.sin(dogT * (moving ? 8 : 5) + i * 0.6));
        tb.bone.quaternion.copy(tb.rest).multiply(dq);
      }
      const playerDist = Math.hypot(player.x - dogRoot.position.x, player.z - dogRoot.position.z);
      if (rig.head) {
        // Nose down to sniff while standing; up toward a nearby player.
        dq.setFromAxisAngle(side, !moving && playerDist > 5 ? 0.35 + 0.1 * Math.sin(dogT * 3) : -0.1);
        rig.head.bone.quaternion.copy(rig.head.rest).multiply(dq);
      }
      if (playerDist < 5 && barkCool <= 0) {
        d.onSound('dog_bark', dogRoot.position.clone().setY(0.6));
        barkCool = 18 + Math.random() * 12;
      }

      // Newspaper: rest 9-16 s, then a gust carries it to the next spot, tumbling.
      paperT += dt;
      if (!paperMoving && paperT > 9 + (paperSpot % 3) * 3.5) {
        paperMoving = true;
        paperT = 0;
        paperFrom = paperRoot.position.clone();
        paperSpot = (paperSpot + 1) % paperSpots.length;
      }
      if (paperMoving) {
        const s = paperSpots[paperSpot]!;
        const k = Math.min(1, paperT / 4);
        const e = k * k * (3 - 2 * k);
        paperRoot.position.set(
          MathUtils.lerp(paperFrom.x, s.x, e),
          MathUtils.lerp(paperFrom.y, d.groundAt(s.x, s.z), e) + Math.sin(k * Math.PI) * 0.8 + Math.abs(Math.sin(k * 9)) * 0.15,
          MathUtils.lerp(paperFrom.z, s.z, e),
        );
        paper.rotation.x += dt * 6;
        paper.rotation.y += dt * 3.3;
        if (k >= 1) {
          paperMoving = false;
          paperT = 0;
          paperRest();
        }
      }
    },
  };
}

/** The interactable id for the newspaper resting at spot `i`. */
export const newspaperId = (i: number): string => `newspaper_${i}`;
export const NEWSPAPER_SPOTS = 4;
