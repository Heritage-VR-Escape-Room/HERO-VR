/**
 * Inspect view (Uncharted style): the object lifts from where it sits into
 * the player's hands, the world stays behind it, dimmed and out of focus, and
 * the player turns it freely: drag with the mouse, or either stick, with a
 * little weight to the motion. The wheel or the triggers zoom. An object can
 * hide a detail that is only found by turning it the right way (a stamp
 * under a strap, a mark on the back); finding it is announced and reported.
 * Items that can be taken offer E / A to take them straight from the hands.
 * Esc / B / right-click puts the object back.
 *
 * The clone is held by the player's camera inside the world scene (a
 * separate overlay pass would start from a cleared frame and lose the world
 * behind), self-lit through its own textures so it reads at night without
 * adding a light, while depth of field blurs the world and a dark veil dims it.
 */
import {
  Box3,
  Color,
  Euler,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  type PerspectiveCamera,
  type Scene,
  Vector3,
  type Material,
  type Object3D,
  type WebGPURenderer,
} from 'three/webgpu';
import type { I18n } from '../logic/i18n';
import type { PostChain } from '../render/post';
import type { ModalSession } from './modal';

export const INSPECT = { distance: 0.45, minDistance: 0.25, maxDistance: 0.8, zoomStep: 0.0004, rotateSpeed: 0.008 } as const;
/** Lift and put-back time (s). */
export const INSPECT_LIFT_SEC = 0.45;
/** A hidden detail counts as found once it faces the camera within this angle for DISCOVER_HOLD_SEC. */
export const DISCOVER_ANGLE_DEG = 28;
export const DISCOVER_HOLD_SEC = 0.6;

export interface InspectDeps {
  renderer: WebGPURenderer;
  /** The world scene: the camera joins it while holding an object. */
  scene: Scene;
  /** The main camera: the overlay copies its field of view and aspect. */
  camera: PerspectiveCamera;
  post: Pick<PostChain, 'setDofFocus'>;
  modal: ModalSession;
  i18n: I18n;
  canvas: HTMLCanvasElement;
  /** Interact binding (KeyE by default): takes a takeable item. */
  takeKey?: () => string;
  onSound?: (s: 'inspect_lift' | 'inspect_found') => void;
}

export interface InspectOptions {
  /** Caption shown above the object. */
  textKey?: string;
  /**
   * A hidden detail: the direction (in the source object's own space) that
   * must be turned toward the player to find it, and what to say when found.
   */
  discover?: { localDir: Vector3; foundKey: string; onFound?: () => void };
  /** Offer "take" (E / A): called, then the view closes. */
  onTake?: () => void;
}

export class InspectView {
  private readonly cam: PerspectiveCamera;
  /** Carries the clone; turned by the player. */
  private readonly pivot = new Group();
  private readonly dim: Mesh;
  private readonly hint: HTMLDivElement;
  private readonly caption: HTMLDivElement;
  private distance: number = INSPECT.distance;
  /** Distance at which the object fills the view; zoom limits scale with it. */
  private fit: number = INSPECT.distance;
  private dragging = false;
  private active = false;
  private opts: InspectOptions = {};
  private unsubLocale: (() => void) | null = null;
  /** Turning still to be applied (radians about the view's X and Y axes). */
  private spinX = 0;
  private spinY = 0;
  /** Lift 0 -> 1 on open, back to 0 on close. */
  private lift = 0;
  private closing = false;
  /** Where the object sits in camera space when lifted from (or put back to). */
  private readonly from = new Vector3();
  private readonly fromQ = new Quaternion();
  private readonly heldQ = new Quaternion();
  private found = false;
  private facingT = 0;
  private readonly tmp = new Vector3();

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') this.close();
    else if (this.opts.onTake && e.code === (this.deps.takeKey?.() ?? 'KeyE') && !e.repeat && this.lift >= 1) this.take();
  };
  private readonly onDown = (e: MouseEvent): void => {
    if (e.button === 2) this.close();
    else if (e.button === 0) this.dragging = true;
  };
  private readonly onUp = (e: MouseEvent): void => {
    if (e.button === 0) this.dragging = false;
  };
  private readonly onMove = (e: MouseEvent): void => {
    if (!this.dragging) return;
    this.rotate(e.movementX, e.movementY);
  };
  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.zoom(e.deltaY);
  };
  private readonly onContext = (e: Event): void => e.preventDefault();

  constructor(private readonly deps: InspectDeps) {
    this.cam = deps.camera;
    // A dark veil behind the held object: the world stays visible, dimmed (depth of field blurs it).
    this.dim = new Mesh(
      new PlaneGeometry(40, 40),
      new MeshBasicMaterial({ color: 0x05070a, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false }),
    );
    this.dim.position.z = -4;
    this.dim.renderOrder = 10;
    this.pivot.renderOrder = 11;

    this.hint = overlayDiv('inspect-hint', 'bottom:6vh;left:0;right:0;text-align:center;font-size:16px;opacity:0.8');
    this.caption = overlayDiv('inspect-caption', 'top:10vh;left:0;right:0;text-align:center;font-size:22px');
  }

  isOpen(): boolean {
    return this.active;
  }

  /** Turn the object (mouse-pixel deltas; the gamepad scales its sticks to these). */
  rotate(dx: number, dy: number): void {
    if (!this.active) return;
    this.spinY += dx * INSPECT.rotateSpeed;
    this.spinX += dy * INSPECT.rotateSpeed;
  }

  /** Zoom by a wheel delta (positive: further away). */
  zoom(delta: number): void {
    if (!this.active) return;
    const k = this.fit / INSPECT.distance;
    this.distance = MathUtils.clamp(this.distance + delta * INSPECT.zoomStep * k, this.fit * (INSPECT.minDistance / INSPECT.distance), this.fit * (INSPECT.maxDistance / INSPECT.distance));
  }

  /** Take a takeable item (E / A). */
  take(): void {
    const t = this.opts.onTake;
    if (!this.active || !t) return;
    this.opts.onTake = undefined;
    t();
    this.close(true);
  }

  canTake(): boolean {
    return this.active && !!this.opts.onTake;
  }

  /** Debug / tests: the view's internal state. */
  debugState(): { active: boolean; lift: number; closing: boolean; found: boolean; take: boolean; spin: number[] } {
    return { active: this.active, lift: this.lift, closing: this.closing, found: this.found, take: !!this.opts.onTake, spin: [this.spinX, this.spinY] };
  }

  /** The hidden detail has been found during this inspection. */
  discovered(): boolean {
    return this.found;
  }

  open(source: Object3D, opts: InspectOptions = {}): void {
    if (this.active) return;
    this.active = true;
    this.closing = false;
    this.opts = { ...opts };
    this.found = false;
    this.facingT = 0;
    this.spinX = this.spinY = 0;
    const radius = this.buildClone(source);
    // Held by the camera, in the world.
    if (!this.cam.parent) this.deps.scene.add(this.cam);
    this.cam.add(this.dim, this.pivot);
    // Small props sit at the default distance; big ones (the plaque) back off to fit.
    const halfFov = MathUtils.degToRad(this.cam.fov / 2) * Math.min(1, this.cam.aspect);
    this.fit = Math.max(INSPECT.distance, (radius / Math.sin(halfFov)) * 1.05);
    this.distance = this.fit;

    // Lift from where the object really is, as the player's camera sees it.
    const cam = this.deps.camera;
    cam.updateMatrixWorld();
    const box = new Box3().setFromObject(source);
    box.getCenter(this.from).applyMatrix4(cam.matrixWorldInverse);
    // Too close or behind (shouldn't happen): start just below the hold point.
    if (this.from.z > -0.2) this.from.set(0, -0.3, -this.fit);
    const srcQ = source.getWorldQuaternion(new Quaternion());
    this.fromQ.copy(cam.getWorldQuaternion(new Quaternion()).invert().multiply(srcQ));
    this.lift = 0;
    this.applyLift();

    this.unsubLocale = this.deps.i18n.onChange(() => this.renderText());
    this.renderText();
    this.deps.onSound?.('inspect_lift');
    this.deps.modal.enter();
    this.deps.post.setDofFocus(this.distance);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('mousedown', this.onDown);
    window.addEventListener('mouseup', this.onUp);
    window.addEventListener('mousemove', this.onMove);
    window.addEventListener('contextmenu', this.onContext);
    this.deps.canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  /** Put the object back (animated) and leave; `instant` skips the put-back (it was taken). */
  close(instant = false): void {
    if (!this.active || this.closing) return;
    this.closing = true;
    this.dragging = false;
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('mousedown', this.onDown);
    window.removeEventListener('mouseup', this.onUp);
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('contextmenu', this.onContext);
    this.deps.canvas.removeEventListener('wheel', this.onWheel);
    this.unsubLocale?.();
    this.unsubLocale = null;
    this.hint.style.display = 'none';
    this.caption.style.display = 'none';
    if (instant) this.finishClose();
    else this.heldQ.copy(this.pivot.quaternion);
  }

  /** Per frame: lift / put back, spin with weight, discovery. */
  update(dt: number): void {
    if (!this.active) return;
    if (this.closing) {
      this.lift = Math.max(0, this.lift - dt / INSPECT_LIFT_SEC);
      this.applyLift();
      if (this.lift <= 0) this.finishClose();
      return;
    }
    this.lift = Math.min(1, this.lift + dt / INSPECT_LIFT_SEC);
    // Turn: the input is a pending turn, taken up smoothly (a held object has a
    // little weight) but never more than the player asked for.
    const k = 1 - Math.exp(-14 * dt);
    const dy = this.spinY * k;
    const dx = this.spinX * k;
    if (dx || dy) {
      this.heldQ.premultiply(_q.setFromAxisAngle(Y_AXIS, dy));
      this.heldQ.premultiply(_q.setFromAxisAngle(X_AXIS, dx));
    }
    this.spinX -= dx;
    this.spinY -= dy;
    this.applyLift();
    this.deps.post.setDofFocus(this.distance);

    // Discovery: the hidden detail's direction, turned toward the camera (+Z in view space).
    const d = this.opts.discover;
    if (d && !this.found && this.lift >= 1) {
      this.tmp.copy(d.localDir).normalize().applyQuaternion(this.pivot.quaternion);
      if (this.tmp.z > Math.cos(MathUtils.degToRad(DISCOVER_ANGLE_DEG))) this.facingT += dt;
      else this.facingT = 0;
      if (this.facingT >= DISCOVER_HOLD_SEC) {
        this.found = true;
        this.caption.textContent = this.deps.i18n.t(d.foundKey);
        this.caption.style.display = 'block';
        this.caption.classList.add('inspect-found');
        this.deps.onSound?.('inspect_found');
        d.onFound?.();
      }
    }
  }

  /** Kept for callers: the held object is drawn with the world now. */
  render(): void {}

  private applyLift(): void {
    const e = this.lift * this.lift * (3 - 2 * this.lift);
    const hold = this.tmp.set(0, 0, -this.distance);
    this.pivot.position.lerpVectors(this.from, hold, e);
    this.pivot.quaternion.slerpQuaternions(this.fromQ, this.heldQ, e);
    (this.dim.material as MeshBasicMaterial).opacity = 0.55 * e;
  }

  private finishClose(): void {
    this.active = false;
    this.closing = false;
    this.caption.classList.remove('inspect-found');
    this.cam.remove(this.dim, this.pivot);
    this.disposeClone();
    this.deps.post.setDofFocus(null);
    this.deps.modal.exit();
  }

  private renderText(): void {
    const { i18n } = this.deps;
    const dir = i18n.dir();
    for (const el of [this.hint, this.caption]) {
      el.dir = dir;
      el.lang = i18n.locale();
    }
    this.hint.textContent = i18n.t(this.opts.onTake ? 'ui.inspect.hint_take' : 'ui.inspect.hint');
    this.hint.style.display = 'block';
    const key = this.found && this.opts.discover ? this.opts.discover.foundKey : this.opts.textKey;
    this.caption.textContent = key ? i18n.t(key) : '';
    this.caption.style.display = key ? 'block' : 'none';
  }

  /** Returns the clone's bounding radius (m). */
  private buildClone(source: Object3D): number {
    this.disposeClone();
    source.updateWorldMatrix(true, true);
    const worldScale = source.getWorldScale(new Vector3());
    const clone = source.clone(true);
    clone.visible = true;
    clone.traverse((o) => {
      o.visible = true;
      const m = o as Mesh;
      if (!m.isMesh) return;
      m.material = cloneMaterial(m.material);
      m.castShadow = false;
      m.renderOrder = 11;
      // Self-lit through its own colour so it reads in the night without a light.
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) selfLight(mat);
    });
    clone.position.set(0, 0, 0);
    clone.quaternion.identity();
    clone.scale.copy(worldScale);
    clone.updateMatrixWorld(true);
    // Centre the visual on the pivot so it spins about its own middle.
    const box = new Box3().setFromObject(clone);
    clone.position.sub(box.getCenter(new Vector3()));
    const radius = box.getSize(new Vector3()).length() / 2;
    // Held pose: large flat things (plaques, signs) nearly face-on so they read; small props at an angle.
    if (radius > 0.4) this.heldQ.setFromEuler(_e.set(0.08, -0.15, 0));
    else this.heldQ.setFromEuler(_e.set(0.35, -0.5, 0));
    this.pivot.add(clone);
    return radius;
  }

  private disposeClone(): void {
    for (const child of [...this.pivot.children]) {
      this.pivot.remove(child);
      child.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose();
      });
    }
  }
}

const X_AXIS = new Vector3(1, 0, 0);
const Y_AXIS = new Vector3(0, 1, 0);
const _q = new Quaternion();
const _e = new Euler();

function selfLight(mat: Material): void {
  const m = mat as Material & { transparent: boolean; depthWrite: boolean; emissive?: Color; emissiveMap?: unknown; map?: unknown; color?: Color; emissiveIntensity?: number; fog?: boolean };
  m.fog = false;
  // Drawn in the transparent pass, after the veil (renderOrder 10 < 11), at full opacity.
  m.transparent = true;
  m.depthWrite = true;
  if (!m.emissive) return;
  if (m.map) {
    m.emissive.set(0xffffff);
    if (!m.emissiveMap) m.emissiveMap = m.map;
    m.emissiveIntensity = Math.max(m.emissiveIntensity ?? 0, 0.55);
  } else if (m.color) {
    m.emissive.copy(m.color).multiplyScalar(0.5);
    m.emissiveIntensity = Math.max(m.emissiveIntensity ?? 0, 1);
  }
}

function cloneMaterial(m: Material | Material[]): Material | Material[] {
  return Array.isArray(m) ? m.map((x) => x.clone()) : m.clone();
}

function overlayDiv(id: string, css: string): HTMLDivElement {
  const el = document.createElement('div');
  el.id = id;
  el.style.cssText = `position:fixed;display:none;color:#f2efe6;font-family:"Noto Sans","Noto Naskh Arabic",sans-serif;text-shadow:0 1px 4px #000;pointer-events:none;z-index:15;${css}`;
  document.body.appendChild(el);
  return el;
}

export const USED_KEYS: readonly string[] = ['ui.inspect.hint', 'ui.inspect.hint_take'];
