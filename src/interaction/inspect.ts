/**
 * Inspect view: a clone of an object is shown 0.45 m in front of the camera in
 * its own overlay scene, drawn after the post chain (so grade and grain do not
 * touch it) while depth of field blurs the world behind it. Left-drag rotates,
 * the wheel zooms between 0.25 and 0.8 m, Esc or right-click closes.
 */
import {
  AmbientLight,
  Box3,
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  type Material,
  type Object3D,
  type WebGPURenderer,
} from 'three/webgpu';
import type { I18n } from '../logic/i18n';
import type { PostChain } from '../render/post';
import type { ModalSession } from './modal';

export const INSPECT = { distance: 0.45, minDistance: 0.25, maxDistance: 0.8, zoomStep: 0.0004, rotateSpeed: 0.008 } as const;

export interface InspectDeps {
  renderer: WebGPURenderer;
  /** The main camera: the overlay copies its field of view and aspect. */
  camera: PerspectiveCamera;
  post: Pick<PostChain, 'setDofFocus'>;
  modal: ModalSession;
  i18n: I18n;
  canvas: HTMLCanvasElement;
}

export class InspectView {
  private readonly scene = new Scene();
  private readonly cam: PerspectiveCamera;
  private readonly pivot = new Group();
  private readonly hint: HTMLDivElement;
  private readonly caption: HTMLDivElement;
  private distance: number = INSPECT.distance;
  private dragging = false;
  private active = false;
  private textKey: string | undefined;
  private unsubLocale: (() => void) | null = null;

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') this.close();
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
    this.pivot.rotateOnWorldAxis(Y_AXIS, e.movementX * INSPECT.rotateSpeed);
    this.pivot.rotateOnWorldAxis(X_AXIS, e.movementY * INSPECT.rotateSpeed);
  };
  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.distance = MathUtils.clamp(this.distance + e.deltaY * INSPECT.zoomStep, INSPECT.minDistance, INSPECT.maxDistance);
    this.pivot.position.z = -this.distance;
  };
  private readonly onContext = (e: Event): void => e.preventDefault();

  constructor(private readonly deps: InspectDeps) {
    this.cam = new PerspectiveCamera(deps.camera.fov, deps.camera.aspect, 0.05, 5);
    this.scene.add(new AmbientLight(0xffffff, 0.9));
    const key = new DirectionalLight(0xfff0d8, 2.2);
    key.position.set(-0.6, 1, 0.8);
    this.scene.add(key, this.pivot);

    this.hint = overlayDiv('inspect-hint', 'bottom:6vh;left:0;right:0;text-align:center;font-size:16px;opacity:0.8');
    this.caption = overlayDiv('inspect-caption', 'top:10vh;left:0;right:0;text-align:center;font-size:22px');
  }

  isOpen(): boolean {
    return this.active;
  }

  open(source: Object3D, opts: { textKey?: string } = {}): void {
    if (this.active) return;
    this.active = true;
    this.buildClone(source);
    this.distance = INSPECT.distance;
    this.pivot.position.set(0, 0, -this.distance);
    this.cam.fov = this.deps.camera.fov;
    this.cam.aspect = this.deps.camera.aspect;
    this.cam.updateProjectionMatrix();

    this.textKey = opts.textKey;
    this.unsubLocale = this.deps.i18n.onChange(() => this.renderText());
    this.renderText();

    this.deps.modal.enter();
    this.deps.post.setDofFocus(INSPECT.distance);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('mousedown', this.onDown);
    window.addEventListener('mouseup', this.onUp);
    window.addEventListener('mousemove', this.onMove);
    window.addEventListener('contextmenu', this.onContext);
    this.deps.canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  close(): void {
    if (!this.active) return;
    this.active = false;
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
    this.disposeClone();
    this.deps.post.setDofFocus(null);
    this.deps.modal.exit();
  }

  /** Draw the overlay on top of the finished post chain. Call right after `post.render()`. */
  render(): void {
    if (!this.active) return;
    const r = this.deps.renderer;
    this.cam.aspect = this.deps.camera.aspect;
    this.cam.updateProjectionMatrix();
    const autoClear = r.autoClear;
    r.autoClear = false;
    r.clearDepth();
    r.render(this.scene, this.cam);
    r.autoClear = autoClear;
  }

  private renderText(): void {
    const { i18n } = this.deps;
    const dir = i18n.dir();
    for (const el of [this.hint, this.caption]) {
      el.dir = dir;
      el.lang = i18n.locale();
    }
    this.hint.textContent = i18n.t('ui.inspect.hint');
    this.hint.style.display = 'block';
    this.caption.textContent = this.textKey ? i18n.t(this.textKey) : '';
    this.caption.style.display = this.textKey ? 'block' : 'none';
  }

  private buildClone(source: Object3D): void {
    this.disposeClone();
    source.updateWorldMatrix(true, true);
    const worldScale = source.getWorldScale(new Vector3());
    const clone = source.clone(true);
    clone.visible = true;
    clone.traverse((o) => {
      o.visible = true;
      const m = o as Mesh;
      if (m.isMesh) m.material = cloneMaterial(m.material);
    });
    clone.position.set(0, 0, 0);
    clone.quaternion.copy(new Quaternion());
    clone.scale.copy(worldScale);
    clone.updateMatrixWorld(true);
    // Centre the visual on the pivot so it spins about its own middle.
    const centre = new Box3().setFromObject(clone).getCenter(new Vector3());
    clone.position.sub(centre);
    this.pivot.rotation.set(0.35, -0.5, 0);
    this.pivot.add(clone);
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
