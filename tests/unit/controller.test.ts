import { describe, it, expect, beforeEach } from 'vitest';
import { PerspectiveCamera } from 'three/webgpu';
import { PhysicsWorld } from '../../src/world/colliders';
import { PlayerController, PLAYER, type MoveInput } from '../../src/player/controller';

const DT = 1 / 60;

function idle(): MoveInput {
  return { forward: false, back: false, left: false, right: false, sprint: false, crouch: false };
}

let physics: PhysicsWorld;
let camera: PerspectiveCamera;
let input: MoveInput;
let look: { mouseSensitivity: number; invertY: boolean; headBob: boolean };
let player: PlayerController;

/** Run n fixed steps (controller then physics), each followed by a frame update. */
function run(n: number): void {
  for (let i = 0; i < n; i++) {
    player.fixedUpdate(DT);
    physics.step(DT);
    player.update(DT, 1);
  }
}

beforeEach(async () => {
  physics = await PhysicsWorld.create();
  physics.addStaticBox({ x: 0, y: -0.5, z: 0 }, { x: 50, y: 0.5, z: 50 }, 0, { surface: 'cobble' });
  camera = new PerspectiveCamera();
  input = idle();
  look = { mouseSensitivity: 1, invertY: false, headBob: false };
  player = new PlayerController(physics, camera, { input: () => input, look: () => look });
  player.teleport({ x: 0, y: 0, z: 0 }, 0);
  player.setInputEnabled(true);
  run(30); // settle on the ground
});

describe('PlayerController', () => {
  it('exact tuning values', () => {
    expect(PLAYER).toMatchObject({
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
    });
  });

  it('stands on the ground with the eye at 1.65 m', () => {
    expect(player.position.y).toBeCloseTo(0, 1);
    expect(camera.position.y).toBeCloseTo(1.65, 1);
  });

  it('walks 1.8 m/s north when facing bearing 0 (+Z)', () => {
    const z0 = player.position.z;
    input.forward = true;
    run(60);
    expect(player.position.z - z0).toBeCloseTo(1.8, 1);
    expect(Math.abs(player.position.x)).toBeLessThan(0.01);
  });

  it('sprint 4.2 m/s, crouch 1.0 m/s and crouch eye 1.1 m', () => {
    input.forward = true;
    input.sprint = true;
    let z0 = player.position.z;
    run(60);
    expect(player.position.z - z0).toBeCloseTo(4.2, 1);
    input.sprint = false;
    input.crouch = true;
    run(30); // let the eye settle
    z0 = player.position.z;
    run(60);
    expect(player.position.z - z0).toBeCloseTo(1.0, 1);
    expect(camera.position.y).toBeCloseTo(1.1, 1);
  });

  it('strafes right towards east (-X) at bearing 0', () => {
    input.right = true;
    run(60);
    expect(player.position.x).toBeCloseTo(-1.8, 1);
  });

  it('yaw follows bearing: 90 deg faces east (-X)', () => {
    player.teleport({ x: 0, y: 0, z: 0 }, 90);
    input.forward = true;
    run(60);
    expect(player.position.x).toBeCloseTo(-1.8, 1);
    expect(player.yawDeg).toBeCloseTo(90, 6);
  });

  it('look scales movementX by 0.0022 x sensitivity, clockwise for +X', () => {
    look.mouseSensitivity = 2;
    player.look(100, 0);
    expect(player.yawDeg).toBeCloseTo((100 * 0.0022 * 2 * 180) / Math.PI, 6);
  });

  it('pitch: mouse down looks down, invertY flips, clamps at 85 deg', () => {
    player.look(0, 100);
    expect(player.pitchDeg).toBeCloseTo(-(100 * 0.0022 * 180) / Math.PI, 6);
    look.invertY = true;
    player.look(0, 200);
    expect(player.pitchDeg).toBeCloseTo((100 * 0.0022 * 180) / Math.PI, 6);
    player.look(0, 100000);
    expect(player.pitchDeg).toBeCloseTo(85, 6);
    player.look(0, -100000);
    expect(player.pitchDeg).toBeCloseTo(-85, 6);
  });

  it('input disabled: no look and no movement', () => {
    player.setInputEnabled(false);
    input.forward = true;
    const p0 = { ...player.position };
    player.look(500, 500);
    run(60);
    expect(player.yawDeg).toBe(0);
    expect(player.pitchDeg).toBe(0);
    expect(player.position.x).toBeCloseTo(p0.x, 4);
    expect(player.position.z).toBeCloseTo(p0.z, 4);
  });

  it('climbs a 0.25 m step but not a 0.6 m wall', () => {
    physics.addStaticBox({ x: 0, y: 0.125, z: 3 }, { x: 5, y: 0.125, z: 1 }, 0);
    input.forward = true;
    run(120);
    expect(player.position.y).toBeCloseTo(0.25, 1);
    player.teleport({ x: 20, y: 0, z: 0 }, 0);
    physics.addStaticBox({ x: 20, y: 0.3, z: 3 }, { x: 5, y: 0.3, z: 1 }, 0);
    run(120);
    expect(player.position.z).toBeLessThan(2);
  });

  it('head-bob moves the eye only when enabled', () => {
    input.forward = true;
    const ys: number[] = [];
    for (let i = 0; i < 60; i++) {
      run(1);
      ys.push(camera.position.y);
    }
    // Only the character controller's few-millimetre contact-skin wobble.
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.01);
    look.headBob = true;
    ys.length = 0;
    for (let i = 0; i < 90; i++) {
      run(1);
      ys.push(camera.position.y);
    }
    const range = Math.max(...ys) - Math.min(...ys);
    expect(range).toBeGreaterThan(0.03);
    expect(range).toBeLessThanOrEqual(2 * 0.025 + 0.01);
  });

  it('emits cobble footsteps while walking', () => {
    const steps: string[] = [];
    player.footsteps.onStep((s) => steps.push(s));
    input.forward = true;
    run(60); // 1.8 m -> 3 steps
    expect(steps).toEqual(['cobble', 'cobble', 'cobble']);
  });
});
