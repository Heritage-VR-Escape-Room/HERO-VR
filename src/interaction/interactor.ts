/**
 * Interaction: each frame a 2.2 m ray from the camera is cast against the
 * INTERACTABLE collision group. The hit collider's `id` (set in its collider
 * data) names a registered Interactable; the `interact` binding fires it.
 */
import { Vector3, type Camera, type Object3D } from 'three/webgpu';
import type { ActionName } from '../logic/bindings';
import { GROUPS, type PhysicsWorld } from '../world/colliders';

export const INTERACT_RANGE_M = 2.2;

export interface Interactable {
  id: string;
  promptKey: string;
  object: Object3D;
  canInteract(): boolean;
  interact(): void;
}

export interface InteractorDeps {
  physics: PhysicsWorld;
  camera: Camera;
  /** Key events target (window). */
  target: EventTarget;
  bindings: () => Readonly<Record<ActionName, string>>;
  /** False while paused, inspecting or reading: nothing is focused or fires. */
  enabled: () => boolean;
}

export class Interactor {
  private readonly items = new Map<string, Interactable>();
  private current: Interactable | null = null;
  private readonly listeners = new Set<(i: Interactable | null) => void>();
  private readonly origin = new Vector3();
  private readonly dir = new Vector3();
  private readonly onKey = (e: Event): void => {
    const k = e as KeyboardEvent;
    if (k.repeat || k.code !== this.deps.bindings().interact) return;
    if (this.deps.enabled()) this.current?.interact();
  };

  constructor(private readonly deps: InteractorDeps) {
    deps.target.addEventListener('keydown', this.onKey);
  }

  register(i: Interactable): void {
    this.items.set(i.id, i);
  }

  unregister(id: string): void {
    this.items.delete(id);
    if (this.current?.id === id) this.setFocus(null);
  }

  focused(): Interactable | null {
    return this.current;
  }

  onFocusChange(cb: (i: Interactable | null) => void): () => void {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }

  /** Per frame, after the camera pose is set. */
  update(): void {
    let next: Interactable | null = null;
    if (this.deps.enabled()) {
      const cam = this.deps.camera;
      cam.getWorldPosition(this.origin);
      cam.getWorldDirection(this.dir);
      const hit = this.deps.physics.raycast(this.origin, this.dir, INTERACT_RANGE_M, GROUPS.INTERACTABLE);
      const id = hit?.data.id;
      const found = typeof id === 'string' ? this.items.get(id) : undefined;
      if (found?.canInteract()) next = found;
    }
    this.setFocus(next);
  }

  dispose(): void {
    this.deps.target.removeEventListener('keydown', this.onKey);
    this.listeners.clear();
  }

  private setFocus(next: Interactable | null): void {
    if (next === this.current) return;
    this.current = next;
    for (const cb of [...this.listeners]) cb(next);
  }
}
