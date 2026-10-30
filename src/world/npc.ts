/**
 * Plaza people (spec §6/§7 beat 2): the newsstand owner and the hostile
 * citizens. The placeholder humans ship no usable clips (the owner model's
 * only clip is a death, which is never played), so everything is procedural
 * on the skeleton: arms lowered out of a T-pose, idle breathing sway, the
 * owner's shouting loop, and a glare (head look-at, max 70 degrees) at the
 * player within 6 m.
 *
 * Bones are turned about the NPC's own axes (forward = the model's +Z, left =
 * +X, up = +Y), not about bone-local axes, which differ between rigs.
 */
import { Group, MathUtils, Quaternion, Sphere, Vector3, type Bone, type Object3D, type SkinnedMesh } from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { GLTF } from './assets';

export const GLARE_RADIUS_M = 6;
export const GLARE_MAX_DEG = 70;
/** Forearms turned in toward the body after lowering a T-pose. */
const FOREARM_IN_RAD = 0.45;
/** Forearm twist that turns a lowered T-pose's palms from facing forward to facing the thighs. */
const PALM_TWIST_RAD = 1.4;
/** Arms lowered more than this come from a T-pose (an A-pose rig only needs a small drop). */
const T_POSE_MIN_RAD = MathUtils.degToRad(45);

/**
 * shout: the kiosk owner leaning into his rant; glare: stands and stares;
 * argue: gestures at someone in front; police: hands behind the back, scanning;
 * ride: seated on a bicycle, pedalling (see `pedal`).
 */
export type NpcBehaviour = 'shout' | 'glare' | 'argue' | 'police' | 'ride';

interface Joint {
  bone: Bone;
  rest: Quaternion;
}

const FIND: Record<string, RegExp> = {
  spine: /^(mixamorig)?spine2|^spine_03/i,
  neck: /^(mixamorig)?neck|^neck_/i,
  head: /^(mixamorig)?head_|^head_\d/i,
  armL: /^(mixamorig)?leftarm_|^upperarm_l_/i,
  armR: /^(mixamorig)?rightarm_|^upperarm_r_/i,
  foreL: /^(mixamorig)?leftforearm_|^lowerarm_l_/i,
  foreR: /^(mixamorig)?rightforearm_|^lowerarm_r_/i,
  thighL: /^(mixamorig)?leftupleg_|^upperleg_l_/i,
  thighR: /^(mixamorig)?rightupleg_|^upperleg_r_/i,
  shinL: /^(mixamorig)?leftleg_|^lowerleg_l_/i,
  shinR: /^(mixamorig)?rightleg_|^lowerleg_r_/i,
};

/** A cough: bend over, hand to mouth, for this long. */
export const COUGH_SEC = 1.3;

const _pq = new Quaternion();
const _d = new Quaternion();
const _a = new Quaternion();
const _v = new Vector3();
const _elbow = new Vector3();

/** Frustum-cull a skinned mesh against its bind-pose sphere, enlarged, never recomputed. */
export function cullWithFixedSphere(m: SkinnedMesh, scale = 1.6): void {
  m.geometry.computeBoundingSphere();
  const s = m.geometry.boundingSphere!;
  m.boundingSphere = new Sphere(s.center.clone(), s.radius * scale);
  m.frustumCulled = true;
}

/** Set a bone to its rest rotation turned by `delta` (world space). */
function turn(j: Joint, delta: Quaternion): void {
  j.bone.quaternion.copy(j.rest);
  j.bone.parent!.getWorldQuaternion(_pq);
  j.bone.quaternion.copy(_pq).invert().multiply(delta).multiply(_pq).multiply(j.rest);
  j.bone.updateMatrixWorld();
}

export interface NpcOptions {
  behaviour: NpcBehaviour;
  /** Lower the arms out of an authored T-pose (degrees about the forward axis). */
  armsDownDeg?: number;
  /** Phase offset so two NPCs never sway in step. */
  seed?: number;
  /** Cough now and then: seconds between coughs (min, max). */
  coughEvery?: [number, number];
  /** Called as a cough starts (for the sound, at the NPC's position). */
  onCough?: (npc: Npc) => void;
}

export class Npc {
  readonly root = new Group();
  private readonly joints: Partial<Record<keyof typeof FIND, Joint>> = {};
  private t: number;
  private lookYaw = 0;
  private lookPitch = 0;
  private readonly q = new Quaternion();
  private readonly fwd = new Vector3();
  private readonly up = new Vector3();
  private readonly left = new Vector3();
  private readonly headPos = new Vector3();
  private coughIn: number;
  private coughT = -1;
  /** Pedal crank angle (radians) while riding; the cyclist module advances it. */
  pedal = 0;

  constructor(
    gltf: GLTF,
    private readonly opts: NpcOptions,
  ) {
    const model = cloneSkinned(gltf.scene) as Object3D;
    model.traverse((o) => {
      const m = o as Object3D & { isMesh?: boolean; isSkinnedMesh?: boolean };
      if (m.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        // Skinned bounds come from the bind pose and the procedural pose can leave
        // them, so cull against a generous fixed sphere (bind pose x1.6) rather
        // than not culling at all (that drew every NPC in every pass).
        if (m.isSkinnedMesh) cullWithFixedSphere(o as SkinnedMesh);
      }
      if ((o as Bone).isBone)
        for (const [k, re] of Object.entries(FIND)) {
          const key = k as keyof typeof FIND;
          if (!this.joints[key] && re.test(o.name)) this.joints[key] = { bone: o as Bone, rest: o.quaternion.clone() };
        }
    });
    this.root.add(model);
    this.t = (opts.seed ?? 0) * 7.3;
    this.coughIn = this.nextCough();
  }

  private nextCough(): number {
    const c = this.opts.coughEvery;
    return c ? c[0] + Math.random() * (c[1] - c[0]) : Infinity;
  }

  /** Names of the bones found per role (for tests and debugging). */
  rig(): Record<string, string> {
    return Object.fromEntries(Object.entries(this.joints).map(([k, j]) => [k, j!.bone.name]));
  }

  /** Per frame; `player` is the player's eye position. */
  update(dt: number, player: Vector3): void {
    this.t += dt;
    const t = this.t;
    this.root.updateWorldMatrix(true, false);
    this.root.getWorldQuaternion(this.q);
    this.fwd.set(0, 0, 1).applyQuaternion(this.q);
    this.up.set(0, 1, 0).applyQuaternion(this.q);
    this.left.set(1, 0, 0).applyQuaternion(this.q);
    const about = (axis: Vector3, angle: number, out = new Quaternion()): Quaternion => out.setFromAxisAngle(axis, angle);
    const j = this.joints;
    const b = this.opts.behaviour;
    const shout = b === 'shout';
    // Coughing interrupts whatever the NPC is doing (not while riding).
    this.coughIn -= dt;
    if (this.coughIn <= 0 && this.coughT < 0 && b !== 'ride') {
      this.coughT = 0;
      this.opts.onCough?.(this);
    }
    let cough = 0;
    if (this.coughT >= 0) {
      this.coughT += dt;
      cough = Math.sin(Math.min(1, this.coughT / COUGH_SEC) * Math.PI);
      if (this.coughT >= COUGH_SEC) {
        this.coughT = -1;
        this.coughIn = this.nextCough();
      }
    }
    // Arguing: one arm then the other jabs forward every couple of seconds.
    const jab = b === 'argue' ? Math.max(0, Math.sin(t * 2.6)) : 0;
    const jabRight = b === 'argue' && Math.sin(t * 1.3) > 0;

    // Spine: breathing sway; the owner leans into each shout.
    const beat = shout ? Math.max(0, Math.sin(t * 2.2)) : 0;
    if (j.spine) {
      const lean = 0.12 * beat + 0.1 * jab + 0.4 * cough + (b === 'ride' ? 0.45 : 0);
      const sway = about(this.fwd, 0.025 * Math.sin(t * 0.7)).multiply(about(this.left, 0.02 * Math.sin(t * 1.3) + lean, _a));
      turn(j.spine, sway);
    }

    // Arms hang at the sides, a little behind the torso. The owner shouts with
    // his body and head, not his arms (a raised open hand read as a strange gesture).
    const down = MathUtils.degToRad(this.opts.armsDownDeg ?? 0);
    const breathe = 0.03 * Math.sin(t * 1.3);
    const back = 0.12;
    // Swing (about the left axis): negative raises a hanging arm forward.
    const swingL = b === 'ride' ? -1.0 : b === 'police' ? 0.35 : b === 'argue' && !jabRight ? -0.9 * jab : back;
    const swingR = b === 'ride' ? -1.0 : b === 'police' ? 0.35 : cough > 0 ? -1.25 * cough : b === 'argue' && jabRight ? -0.9 * jab : back;
    if (j.armL) turn(j.armL, about(this.left, swingL, _a).multiply(about(this.fwd, -(down + breathe), _d)));
    if (j.armR) turn(j.armR, about(this.left, swingR, _a).multiply(about(this.fwd, down + breathe, _d)));
    // A T-pose's palms face down; lowered, they would face forward. Twist each
    // forearm about its length so the palms turn to the thighs, and bring the
    // slight outward elbow bend in against the body.
    if (down > T_POSE_MIN_RAD && b !== 'ride') {
      if (j.foreL) this.forearm(j.foreL, FOREARM_IN_RAD, PALM_TWIST_RAD);
      if (j.foreR) this.forearm(j.foreR, -FOREARM_IN_RAD, -PALM_TWIST_RAD);
    }
    // Elbows: a cough brings the hand up to the mouth; an argument bends the jabbing arm.
    if (j.foreR && cough > 0) turn(j.foreR, about(this.left, -1.5 * cough, _d));
    else if (b === 'argue' && jab > 0.05) {
      const f = jabRight ? j.foreR : j.foreL;
      if (f) turn(f, about(this.left, -0.8 * jab, _d));
    }

    // Legs: seated on a saddle, thighs forward; the cranks drive them in opposite phase.
    if (b === 'ride') {
      const legs: Array<[Joint | undefined, Joint | undefined, number]> = [
        [j.thighL, j.shinL, 0],
        [j.thighR, j.shinR, Math.PI],
      ];
      for (const [thigh, shin, phase] of legs) {
        const a = this.pedal + phase;
        if (thigh) turn(thigh, about(this.left, -1.15 - 0.32 * Math.sin(a), _d));
        if (shin) turn(shin, about(this.left, 1.25 + 0.4 * Math.sin(a + Math.PI / 2), _d));
      }
    }

    // Head: glare at the player within 6 m (yaw clamped to 70 degrees), else look ahead.
    const head = j.head;
    if (head) {
      head.bone.getWorldPosition(this.headPos);
      _v.subVectors(player, this.headPos);
      const dist = Math.hypot(_v.x, _v.z);
      let yaw = 0;
      let pitch = 0;
      if (b === 'police' && dist > GLARE_RADIUS_M) {
        // On watch: scan slowly left and right.
        yaw = 0.6 * Math.sin(t * 0.35);
      } else if (dist <= GLARE_RADIUS_M && dist > 0.01 && b !== 'ride') {
        const along = _v.dot(this.fwd);
        const side = _v.dot(this.left);
        const max = MathUtils.degToRad(GLARE_MAX_DEG);
        yaw = MathUtils.clamp(Math.atan2(side, along), -max, max);
        pitch = MathUtils.clamp(Math.atan2(_v.y, dist), -0.5, 0.5);
      }
      const k = 1 - Math.exp(-6 * dt);
      this.lookYaw += (yaw - this.lookYaw) * k;
      this.lookPitch += (pitch - this.lookPitch) * k;
      const nod = shout ? 0.15 * beat : b === 'argue' ? 0.12 * jab : 0.02 * Math.sin(t * 0.9) + 0.35 * cough;
      // Turning about +Y by +yaw swings +Z (forward) toward +X (left).
      turn(head, about(this.up, this.lookYaw).multiply(about(this.left, -this.lookPitch + nod, _a)));
    }
  }

  /**
   * Bend a forearm in about the NPC's forward axis, then twist it about its
   * own length (elbow to wrist, measured after the bend) to turn the palm.
   */
  private forearm(j: Joint, inRad: number, twistRad: number): void {
    const bend = new Quaternion().setFromAxisAngle(this.fwd, inRad);
    turn(j, bend);
    const wrist = j.bone.children.find((c) => (c as Bone).isBone);
    if (!wrist) return;
    j.bone.getWorldPosition(_elbow);
    wrist.getWorldPosition(_v).sub(_elbow).normalize();
    turn(j, new Quaternion().setFromAxisAngle(_v, twistRad).multiply(bend));
  }

  /** Current glare yaw in degrees (positive toward the NPC's left). */
  glareYawDeg(): number {
    return MathUtils.radToDeg(this.lookYaw);
  }
}
