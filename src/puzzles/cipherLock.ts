/**
 * The cipher-disc lock (spec §7 beat 6). Interacting focuses it: the camera
 * blends to the `view` anchor over 0.5 s and the cursor is freed through the
 * shared modal session. A/D or the wheel turn the inner ring, clicks on a
 * tumbler's top/bottom half cycle it, E or a click on the handle pulls. Esc
 * leaves. A right answer opens the door and then marks the puzzle solved and
 * autosaves.
 *
 * The camera is only overridden after the player controller has written its
 * pose each frame (`update`), so leaving needs no yaw/pitch bookkeeping: the
 * blend simply runs back to the controller's own pose.
 */
import {
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PointLight,
  Quaternion,
  Raycaster,
  SphereGeometry,
  Vector2,
  Vector3,
  type PerspectiveCamera,
} from 'three/webgpu';
import type { StoryDirector } from '../dialogue/director';
import type { Interactable } from '../interaction/interactor';
import type { ModalSession } from '../interaction/modal';
import type { ActionName } from '../logic/bindings';
import { createCipherDisc } from '../logic/cipher';
import type { I18n } from '../logic/i18n';
import { buildLockMeshes, LOCK_STEP_RAD, TUMBLER_COUNT, type LockParts } from './lockMeshes';

export const LOCK_PUZZLE_ID = 'cipher_lock';
export const LOCK_HINT_KEYS = ['hint.lock.1', 'hint.lock.2', 'hint.lock.3', 'hint.lock.4'] as const;
export const USED_KEYS: readonly string[] = ['prompt.use', 'ui.lock.hint', ...LOCK_HINT_KEYS];

export const LOCK_TIMING = { blendSec: 0.5, shakeSec: 0.4, doorSec: 0.8, steamSec: 1.4 } as const;
const DOOR_OPEN_RAD = -MathUtils.degToRad(110);
const HANDLE_PULL_RAD = 0.5;
const WHEEL_PX_PER_STEP = 60;
const STEAM_PUFFS = 24;
const LAMP_INTENSITY = 1.2;

export type LockSound = 'ring_tick' | 'tumbler_click' | 'handle_rattle' | 'lock_clunk' | 'steam';

export interface CipherLockDeps {
  director: Pick<StoryDirector, 'markSolved' | 'autosave' | 'registerPuzzle'>;
  modal: ModalSession;
  camera: PerspectiveCamera;
  canvas: HTMLCanvasElement;
  /** Key events target (window). */
  target: EventTarget;
  bindings: () => Readonly<Record<ActionName, string>>;
  i18n: I18n;
  /** Sound hook; the audio system (Task 15) plugs in here. */
  onSound?: (name: LockSound) => void;
  /** Meshes from the pyramid assembly (Task 13); primitives when absent. */
  parts?: LockParts;
}

export interface LockState {
  focused: boolean;
  /** Focused and the camera has arrived: input is accepted. */
  ready: boolean;
  solved: boolean;
  doorOpen: boolean;
  shaking: boolean;
  ringOffset: number;
  tumblers: string;
}

type Phase = 'idle' | 'shaking' | 'opening' | 'solved';

const smooth = (t: number): number => t * t * (3 - 2 * t);

export class CipherLock {
  readonly id = LOCK_PUZZLE_ID;
  readonly parts: LockParts;
  readonly interactable: Interactable;
  /** Fires on the ring step, tumbler click, rattle, clunk and steam moments. */
  onSound: ((name: LockSound) => void) | undefined;

  private readonly disc = createCipherDisc();
  private readonly ray = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly hint: HTMLDivElement;
  private readonly puffs: Mesh[] = [];
  /** A warm lamp at the player's shoulder that fades in with the focus, so the dial reads in the night scene. */
  private readonly lamp = new PointLight('#ffd9a0', 0, 3, 2);

  private focused = false;
  private blend = 0; // 0 = controller pose, 1 = lock view
  private phase: Phase = 'idle';
  private phaseT = 0;
  private ringTarget = 0; // unwrapped radians
  private wheelAcc = 0;
  private steamT = -1;

  private readonly poseP = new Vector3();
  private readonly poseQ = new Quaternion();
  private readonly viewP = new Vector3();
  private readonly viewQ = new Quaternion();
  private readonly scale = new Vector3();

  private readonly onKey = (e: Event): void => {
    const k = e as KeyboardEvent;
    if (!this.focused) return;
    if (k.code === 'Escape') {
      this.leave();
      return;
    }
    if (k.repeat || !this.ready) return;
    const b = this.deps.bindings();
    if (k.code === b.interact) this.pull();
    else if (k.code === b.left) this.rotate(-1);
    else if (k.code === b.right) this.rotate(1);
  };
  private readonly onWheel = (e: WheelEvent): void => {
    if (!this.focused) return;
    e.preventDefault();
    if (!this.ready) return;
    this.wheelAcc += e.deltaY;
    while (Math.abs(this.wheelAcc) >= WHEEL_PX_PER_STEP) {
      const dir = Math.sign(this.wheelAcc);
      this.wheelAcc -= dir * WHEEL_PX_PER_STEP;
      this.rotate(dir);
    }
  };
  private readonly onDown = (e: MouseEvent): void => {
    if (!this.focused || !this.ready || e.button !== 0) return;
    this.click(e.clientX, e.clientY);
  };

  constructor(private readonly deps: CipherLockDeps) {
    this.parts = deps.parts ?? buildLockMeshes();
    this.onSound = deps.onSound;
    this.lamp.position.set(0.25, 0.3, 0.55);
    this.parts.root.add(this.lamp);
    this.hint = document.createElement('div');
    this.hint.id = 'lock-hint';
    this.hint.style.cssText =
      'position:fixed;left:0;right:0;bottom:6vh;text-align:center;color:#f2efe6;opacity:0.85;font:16px "Noto Sans","Noto Naskh Arabic",sans-serif;' +
      'text-shadow:0 1px 4px #000;pointer-events:none;z-index:10;display:none';
    document.body.append(this.hint);
    deps.i18n.onChange(() => this.renderHint());

    this.interactable = {
      id: LOCK_PUZZLE_ID,
      promptKey: 'prompt.use',
      object: this.parts.root,
      canInteract: () => this.phase !== 'solved' && !this.focused,
      interact: () => this.focus(),
    };

    deps.target.addEventListener('keydown', this.onKey);
    deps.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    deps.canvas.addEventListener('mousedown', this.onDown);
    deps.director.registerPuzzle(LOCK_PUZZLE_ID, () => this.forceSolved());
  }

  state(): LockState {
    return {
      focused: this.focused,
      ready: this.ready,
      solved: this.phase === 'solved',
      doorOpen: this.parts.doorPivot.rotation.y < DOOR_OPEN_RAD * 0.5,
      shaking: this.phase === 'shaking',
      ringOffset: this.disc.ringOffset(),
      tumblers: [0, 1, 2, 3].map((i) => this.disc.tumbler(i)).join(''),
    };
  }

  private get ready(): boolean {
    return this.focused && this.blend >= 1;
  }

  focus(): void {
    if (this.focused || this.phase === 'solved') return;
    this.focused = true;
    this.deps.modal.enter();
    this.renderHint();
  }

  /** Esc: blend back; the cursor is handed back to the game once the camera has arrived. */
  leave(): void {
    if (!this.focused) return;
    this.focused = false;
    this.hint.style.display = 'none';
  }

  /** Step the inner ring (+1 clockwise). */
  rotate(steps: number): void {
    if (steps === 0 || this.phase === 'solved') return;
    this.disc.rotateRing(steps);
    this.ringTarget -= steps * LOCK_STEP_RAD;
    this.onSound?.('ring_tick');
  }

  /** Test hook: put the tumblers on `letters` (A-Z, four of them). */
  setTumblers(letters: string): void {
    for (let i = 0; i < TUMBLER_COUNT; i++) {
      const want = letters[i];
      if (!want) continue;
      for (let guard = 0; guard < 26 && this.disc.tumbler(i) !== want; guard++) this.disc.cycleTumbler(i, 1);
      this.parts.setTumblerLetter(i, this.disc.tumbler(i));
    }
  }

  /** Pull the handle: wrong answers rattle, the right one opens the door. */
  pull(): void {
    if (this.phase !== 'idle') return;
    this.phaseT = 0;
    if (this.disc.isCorrect()) {
      this.phase = 'opening';
      this.onSound?.('lock_clunk');
      this.onSound?.('steam');
      this.startSteam();
    } else {
      this.phase = 'shaking';
      this.onSound?.('handle_rattle');
    }
  }

  /** Straight to the solved state, no effects (save restore). */
  forceSolved(): void {
    this.phase = 'solved';
    this.parts.doorPivot.rotation.y = DOOR_OPEN_RAD;
    this.parts.handlePivot.rotation.x = 0;
    this.leave();
    this.releaseModalNow();
  }

  /** Per frame, AFTER the player controller has set the camera pose. */
  update(dt: number): void {
    const p = this.parts;
    const step = dt / LOCK_TIMING.blendSec;
    const prevBlend = this.blend;
    this.blend = MathUtils.clamp(this.blend + (this.focused ? step : -step), 0, 1);
    if (prevBlend > 0 && this.blend === 0 && !this.focused) this.releaseModalNow();

    // Ring eases toward its target angle.
    const ring = p.innerRing.rotation;
    ring.z += (this.ringTarget - ring.z) * (1 - Math.exp(-18 * dt));

    this.advancePhase(dt);
    this.updateSteam(dt);

    this.lamp.intensity = LAMP_INTENSITY * smooth(this.blend);
    if (this.blend > 0) this.applyCamera(smooth(this.blend));
  }

  dispose(): void {
    this.deps.target.removeEventListener('keydown', this.onKey);
    this.deps.canvas.removeEventListener('wheel', this.onWheel);
    this.deps.canvas.removeEventListener('mousedown', this.onDown);
    this.hint.remove();
  }

  /** Test hook: client-pixel centre of each tumbler with a point in its top and bottom half. */
  tumblerScreenPoints(): Array<{ x: number; top: number; bottom: number }> {
    const cam = this.deps.camera;
    cam.updateMatrixWorld();
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const r = this.deps.canvas.getBoundingClientRect();
    const proj = (f: Mesh, dy: number): Vector3 => {
      const v = f.localToWorld(new Vector3(0, dy, 0)).project(cam);
      return new Vector3(r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height, 0);
    };
    return this.parts.tumblerFaces.map((f) => ({ x: proj(f, 0).x, top: proj(f, 0.025).y, bottom: proj(f, -0.025).y }));
  }

  private releaseModalNow(): void {
    this.deps.modal.exit();
  }

  private advancePhase(dt: number): void {
    const p = this.parts;
    this.phaseT += dt;
    if (this.phase === 'shaking') {
      const t = Math.min(this.phaseT / LOCK_TIMING.shakeSec, 1);
      p.doorPivot.rotation.z = Math.sin(this.phaseT * 70) * 0.012 * (1 - t);
      p.handlePivot.rotation.x = Math.sin(this.phaseT * 55) * 0.18 * (1 - t);
      if (t >= 1) {
        p.doorPivot.rotation.z = 0;
        p.handlePivot.rotation.x = 0;
        this.phase = 'idle';
      }
    } else if (this.phase === 'opening') {
      const t = Math.min(this.phaseT / LOCK_TIMING.doorSec, 1);
      p.handlePivot.rotation.x = HANDLE_PULL_RAD * Math.min(t * 4, 1) * (1 - smooth(Math.max(t - 0.5, 0) * 2));
      p.doorPivot.rotation.y = DOOR_OPEN_RAD * smooth(t);
      if (t >= 1) {
        this.phase = 'solved';
        this.deps.director.markSolved(LOCK_PUZZLE_ID);
        this.deps.director.autosave(LOCK_PUZZLE_ID);
        this.leave();
      }
    }
  }

  private applyCamera(e: number): void {
    const cam = this.deps.camera;
    this.parts.view.updateWorldMatrix(true, false);
    this.parts.view.matrixWorld.decompose(this.viewP, this.viewQ, this.scale);
    this.poseP.copy(cam.position);
    this.poseQ.copy(cam.quaternion);
    cam.position.lerpVectors(this.poseP, this.viewP, e);
    cam.quaternion.slerpQuaternions(this.poseQ, this.viewQ, e);
  }

  private click(clientX: number, clientY: number): void {
    const r = this.deps.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1));
    const cam = this.deps.camera;
    cam.updateMatrixWorld();
    this.ray.setFromCamera(this.ndc, cam);
    const hit = this.ray.intersectObjects([...this.parts.tumblerFaces, this.parts.handle], false)[0];
    if (!hit) return;
    if (hit.object.userData['handle']) {
      this.pull();
      return;
    }
    const i = hit.object.userData['tumbler'] as number | undefined;
    if (i === undefined) return;
    const upper = hit.object.worldToLocal(hit.point.clone()).y > 0;
    this.cycleTumbler(i, upper ? 1 : -1);
  }

  /** Cycle tumbler `i` one letter; the top half goes forward through the alphabet. */
  cycleTumbler(i: number, dir: 1 | -1): void {
    if (this.phase !== 'idle') return;
    this.disc.cycleTumbler(i, dir);
    this.parts.setTumblerLetter(i, this.disc.tumbler(i));
    this.onSound?.('tumbler_click');
  }

  private renderHint(): void {
    if (!this.focused) return;
    this.hint.dir = this.deps.i18n.dir();
    this.hint.textContent = this.deps.i18n.t('ui.lock.hint');
    this.hint.style.display = 'block';
  }

  private startSteam(): void {
    const geo = new SphereGeometry(0.05, 8, 6);
    for (let i = 0; i < STEAM_PUFFS; i++) {
      const m = new Mesh(geo, new MeshBasicMaterial({ color: '#d8d8d0', transparent: true, opacity: 0, depthWrite: false }));
      m.userData['seed'] = [Math.random(), Math.random(), Math.random()];
      this.parts.root.add(m);
      this.puffs.push(m);
    }
    this.steamT = 0;
  }

  private updateSteam(dt: number): void {
    if (this.steamT < 0) return;
    this.steamT += dt;
    const o = this.parts.steamOrigin.position;
    const life = LOCK_TIMING.steamSec;
    for (const m of this.puffs) {
      const [a, b, c] = m.userData['seed'] as [number, number, number];
      const t = MathUtils.clamp((this.steamT - a * 0.4) / (life - 0.4), 0, 1);
      m.position.set(o.x + (b - 0.5) * 0.5 + (c - 0.5) * 0.2 * t, o.y + (a - 0.5) * 0.6 + t * 0.3, o.z + t * 0.25);
      m.scale.setScalar(0.5 + t * 2.2);
      (m.material as MeshBasicMaterial).opacity = t > 0 && t < 1 ? 0.45 * Math.sin(Math.PI * t) : 0;
    }
    if (this.steamT >= life) {
      for (const m of this.puffs) {
        m.removeFromParent();
        (m.material as MeshBasicMaterial).dispose();
      }
      this.puffs[0]?.geometry.dispose();
      this.puffs.length = 0;
      this.steamT = -1;
    }
  }
}
