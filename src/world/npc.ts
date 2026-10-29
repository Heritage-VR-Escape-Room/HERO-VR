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
import { Group, MathUtils, Quaternion, Vector3, type Bone, type Object3D } from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { GLTF } from './assets';

export const GLARE_RADIUS_M = 6;
export const GLARE_MAX_DEG = 70;

export type NpcBehaviour = 'shout' | 'glare';

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
};

const _pq = new Quaternion();
const _d = new Quaternion();
const _a = new Quaternion();
const _v = new Vector3();

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
        // Skinned bounds come from the bind pose; the procedural pose can leave them.
        if (m.isSkinnedMesh) o.frustumCulled = false;
      }
      if ((o as Bone).isBone)
        for (const [k, re] of Object.entries(FIND)) {
          const key = k as keyof typeof FIND;
          if (!this.joints[key] && re.test(o.name)) this.joints[key] = { bone: o as Bone, rest: o.quaternion.clone() };
        }
    });
    this.root.add(model);
    this.t = (opts.seed ?? 0) * 7.3;
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
    const shout = this.opts.behaviour === 'shout';

    // Spine: breathing sway; the owner leans into each shout.
    const beat = shout ? Math.max(0, Math.sin(t * 2.2)) : 0;
    if (j.spine) {
      const sway = about(this.fwd, 0.025 * Math.sin(t * 0.7)).multiply(about(this.left, 0.02 * Math.sin(t * 1.3) + 0.12 * beat, _a));
      turn(j.spine, sway);
    }

    // Arms: lowered out of the T-pose; the owner waves his right arm (a paper in hand) on each shout.
    const down = MathUtils.degToRad(this.opts.armsDownDeg ?? 0);
    const breathe = 0.03 * Math.sin(t * 1.3);
    if (j.armL) turn(j.armL, about(this.fwd, -(down + breathe), _d));
    if (j.armR) {
      const raise = shout ? 1.1 + 0.5 * beat : 0;
      turn(j.armR, about(this.fwd, down + breathe).multiply(about(this.left, -raise, _a)));
    }
    if (j.foreR && shout) turn(j.foreR, about(this.left, -0.6 - 0.5 * beat, _d));

    // Head: glare at the player within 6 m (yaw clamped to 70 degrees), else look ahead.
    const head = j.head;
    if (head) {
      head.bone.getWorldPosition(this.headPos);
      _v.subVectors(player, this.headPos);
      const dist = Math.hypot(_v.x, _v.z);
      let yaw = 0;
      let pitch = 0;
      if (dist <= GLARE_RADIUS_M && dist > 0.01) {
        const along = _v.dot(this.fwd);
        const side = _v.dot(this.left);
        const max = MathUtils.degToRad(GLARE_MAX_DEG);
        yaw = MathUtils.clamp(Math.atan2(side, along), -max, max);
        pitch = MathUtils.clamp(Math.atan2(_v.y, dist), -0.5, 0.5);
      }
      const k = 1 - Math.exp(-6 * dt);
      this.lookYaw += (yaw - this.lookYaw) * k;
      this.lookPitch += (pitch - this.lookPitch) * k;
      const nod = shout ? 0.15 * beat : 0.02 * Math.sin(t * 0.9);
      // Turning about +Y by +yaw swings +Z (forward) toward +X (left).
      turn(head, about(this.up, this.lookYaw).multiply(about(this.left, -this.lookPitch + nod, _a)));
    }
  }

  /** Current glare yaw in degrees (positive toward the NPC's left). */
  glareYawDeg(): number {
    return MathUtils.radToDeg(this.lookYaw);
  }
}
