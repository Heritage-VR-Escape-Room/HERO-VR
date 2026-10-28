/**
 * Footsteps: one event per stride walked, carrying the surface tag of the
 * collider under the feet (read with a short downward raycast).
 */
import { GROUPS, type PhysicsWorld, type Surface, type Vec3Like } from '../world/colliders';

export const WALK_STRIDE_M = 0.55;
export const SPRINT_STRIDE_M = 0.75;

/** The ray starts this far above the feet and reaches this far below them. */
const PROBE_UP = 0.2;
const PROBE_DOWN = 0.4;

export class Footsteps {
  private walked = 0;
  private readonly listeners = new Set<(s: Surface) => void>();

  constructor(private readonly physics: PhysicsWorld) {}

  onStep(cb: (surface: Surface) => void): () => void {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }

  /** Add `distance` metres walked on the ground; emits once per stride. */
  update(distance: number, sprinting: boolean, feet: Vec3Like): void {
    this.walked += distance;
    const stride = sprinting ? SPRINT_STRIDE_M : WALK_STRIDE_M;
    if (this.walked < stride) return;
    this.walked %= stride;
    const surface = this.surfaceAt(feet);
    if (!surface) return;
    for (const cb of [...this.listeners]) cb(surface);
  }

  private surfaceAt(feet: Vec3Like): Surface | undefined {
    const origin = { x: feet.x, y: feet.y + PROBE_UP, z: feet.z };
    return this.physics.raycast(origin, { x: 0, y: -1, z: 0 }, PROBE_UP + PROBE_DOWN, GROUPS.WORLD)?.data.surface;
  }
}
