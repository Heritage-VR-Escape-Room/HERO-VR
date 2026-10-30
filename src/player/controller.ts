/**
 * First-person controller: a Rapier kinematic character (capsule) moved at
 * the fixed physics rate, with mouse look, crouch, head-bob and footsteps.
 *
 * Yaw is a compass bearing of the view direction in degrees, clockwise from
 * north (+Z), matching the world frame (east = -X).
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { Euler, MathUtils, type Camera } from 'three/webgpu';
import { GROUPS, interactionGroups, type PhysicsWorld, type Vec3Like } from '../world/colliders';
import { Footsteps, SPRINT_STRIDE_M, WALK_STRIDE_M } from './footsteps';

export const PLAYER = {
  radius: 0.3,
  height: 1.75,
  walkSpeed: 1.8,
  sprintSpeed: 4.2,
  crouchSpeed: 1.0,
  eyeHeight: 1.65,
  crouchEyeHeight: 1.1,
  stepOffset: 0.3,
  slopeLimitDeg: 45,
  lookScale: 0.0022,
  pitchLimitDeg: 85,
  headBobAmplitude: 0.025,
} as const;

/** Gap Rapier keeps between the capsule and the world. */
const SKIN = 0.01;
/** Teleports place the feet this far above the requested point; gravity settles them. */
const TELEPORT_CLEARANCE = 2 * SKIN;
/** Eye height and head-bob weight approach their targets at this rate (1/s). */
const EASE_RATE = 10;

export interface MoveInput {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
  crouch: boolean;
  /** Analog stick (gamepad): x right, y forward, magnitude 0..1; adds to the keys. */
  stick?: { x: number; y: number };
}

export interface LookSettings {
  mouseSensitivity: number;
  invertY: boolean;
  headBob: boolean;
}

export interface ControllerDeps {
  input: () => MoveInput;
  look: () => LookSettings;
}

const ease = (cur: number, target: number, dt: number): number => cur + (target - cur) * (1 - Math.exp(-EASE_RATE * dt));

export class PlayerController {
  readonly footsteps: Footsteps;
  private readonly body: RAPIER.RigidBody;
  private readonly collider: RAPIER.Collider;
  private readonly kcc: RAPIER.KinematicCharacterController;
  private readonly groups = interactionGroups(GROUPS.PLAYER, GROUPS.WORLD | GROUPS.INTERACTABLE | GROUPS.BLOCKER);
  /** Capsule centre above the feet. */
  private readonly centerY = PLAYER.height / 2;

  private inputEnabled = false;
  private yaw = 0; // degrees, bearing
  private pitch = 0; // degrees, + looks up
  private vy = 0;
  private grounded = false;
  private prevFeet = { x: 0, y: 0, z: 0 };
  private feet = { x: 0, y: 0, z: 0 };
  private eye: number = PLAYER.eyeHeight;
  private crouching = false;
  private moving = false;
  private sprinting = false;
  private bobPhase = 0;
  private bobWeight = 0;
  private readonly euler = new Euler(0, 0, 0, 'YXZ');

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly camera: Camera,
    private readonly deps: ControllerDeps,
  ) {
    const world = physics.world;
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const halfHeight = PLAYER.height / 2 - PLAYER.radius;
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(halfHeight, PLAYER.radius).setCollisionGroups(this.groups),
      this.body,
    );
    this.kcc = world.createCharacterController(SKIN);
    this.kcc.setUp({ x: 0, y: 1, z: 0 });
    this.kcc.enableAutostep(PLAYER.stepOffset, 0.15, false);
    this.kcc.setMaxSlopeClimbAngle(MathUtils.degToRad(PLAYER.slopeLimitDeg));
    this.kcc.setMinSlopeSlideAngle(MathUtils.degToRad(PLAYER.slopeLimitDeg));
    this.kcc.enableSnapToGround(PLAYER.stepOffset);
    this.kcc.setSlideEnabled(true);
    this.footsteps = new Footsteps(physics);
  }

  /** Feet position (bottom of the capsule) after the last physics step. */
  get position(): Readonly<Vec3Like> {
    return this.feet;
  }

  get yawDeg(): number {
    return this.yaw;
  }

  get pitchDeg(): number {
    return this.pitch;
  }

  get isGrounded(): boolean {
    return this.grounded;
  }

  setInputEnabled(on: boolean): void {
    this.inputEnabled = on;
  }

  /** Place the feet at `pos`, facing bearing `yawDeg`, with gaze pitch `pitchDeg` (level by default). */
  teleport(pos: Vec3Like, yawDeg: number, pitchDeg = 0): void {
    // Start just clear of the floor: a capsule spawned exactly touching it can be pushed through.
    const y = pos.y + TELEPORT_CLEARANCE;
    this.body.setTranslation({ x: pos.x, y: y + this.centerY, z: pos.z }, true);
    this.physics.world.propagateModifiedBodyPositionsToColliders();
    this.feet = { x: pos.x, y, z: pos.z };
    this.prevFeet = { ...this.feet };
    this.yaw = yawDeg;
    this.pitch = pitchDeg;
    this.vy = 0;
  }

  /** Raw mouse deltas (MouseEvent.movementX/Y). Ignored while input is disabled. */
  look(dx: number, dy: number): void {
    if (!this.inputEnabled) return;
    const s = this.deps.look();
    const k = PLAYER.lookScale * s.mouseSensitivity;
    this.yaw = MathUtils.euclideanModulo(this.yaw + MathUtils.radToDeg(dx * k), 360);
    const dPitch = MathUtils.radToDeg(dy * k) * (s.invertY ? 1 : -1);
    this.pitch = MathUtils.clamp(this.pitch + dPitch, -PLAYER.pitchLimitDeg, PLAYER.pitchLimitDeg);
  }

  /** One fixed physics step: computes the kinematic move. Call before the world steps. */
  fixedUpdate(dt: number): void {
    this.physics.syncQueries();
    const inp = this.inputEnabled ? this.deps.input() : null;
    let fwd = 0;
    let strafe = 0;
    if (inp) {
      fwd = (inp.forward ? 1 : 0) - (inp.back ? 1 : 0) + (inp.stick?.y ?? 0);
      strafe = (inp.right ? 1 : 0) - (inp.left ? 1 : 0) + (inp.stick?.x ?? 0);
    }
    this.crouching = inp?.crouch ?? this.crouching;
    const len = Math.hypot(fwd, strafe);
    this.moving = len > 0;
    this.sprinting = this.moving && !this.crouching && (inp?.sprint ?? false);
    const speed = this.crouching ? PLAYER.crouchSpeed : this.sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed;

    // Bearing b: forward = (-sin b, 0, cos b); right (b + 90) = (-cos b, 0, -sin b).
    const b = MathUtils.degToRad(this.yaw);
    const sb = Math.sin(b);
    const cb = Math.cos(b);
    // A half-pushed stick walks slower; keys (and diagonals) are full speed.
    const scale = len > 0 ? (speed * dt * Math.min(1, len)) / len : 0;
    const dx = (-sb * fwd - cb * strafe) * scale;
    const dz = (cb * fwd - sb * strafe) * scale;

    this.vy = this.grounded ? 0 : this.vy;
    this.vy += this.physics.world.gravity.y * dt;
    this.kcc.computeColliderMovement(
      this.collider,
      { x: dx, y: this.vy * dt, z: dz },
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      this.groups,
    );
    const m = this.kcc.computedMovement();
    this.grounded = this.kcc.computedGrounded();
    if (this.grounded && this.vy < 0) this.vy = 0;

    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
    this.prevFeet = { ...this.feet };
    this.feet = { x: t.x + m.x, y: t.y + m.y - this.centerY, z: t.z + m.z };

    const walked = Math.hypot(m.x, m.z);
    if (this.grounded && walked > 1e-5) {
      this.footsteps.update(walked, this.sprinting, this.feet);
      this.bobPhase += (walked / (this.sprinting ? SPRINT_STRIDE_M : WALK_STRIDE_M)) * Math.PI * 2;
    }
  }

  /** Per-frame: eye height, head-bob and camera pose. `alpha` interpolates between the last two physics steps. */
  update(dt: number, alpha: number): void {
    const s = this.deps.look();
    this.eye = ease(this.eye, this.crouching ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight, dt);
    this.bobWeight = ease(this.bobWeight, s.headBob && this.moving && this.grounded ? 1 : 0, dt);
    const bob = s.headBob || this.bobWeight > 1e-3 ? PLAYER.headBobAmplitude * this.bobWeight * Math.sin(this.bobPhase) : 0;

    const a = MathUtils.clamp(alpha, 0, 1);
    const p = this.prevFeet;
    const f = this.feet;
    this.camera.position.set(p.x + (f.x - p.x) * a, p.y + (f.y - p.y) * a + this.eye + bob, p.z + (f.z - p.z) * a);
    this.euler.set(MathUtils.degToRad(this.pitch), Math.PI - MathUtils.degToRad(this.yaw), 0);
    this.camera.quaternion.setFromEuler(this.euler);
  }
}
