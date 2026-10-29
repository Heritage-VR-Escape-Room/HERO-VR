/**
 * Slice blockers: a ring of invisible BLOCKER cylinders whose inner faces
 * stand on SLICE_RADIUS around the plaza centre, so the player physically
 * cannot leave the slice. Walking into the ring (within `triggerMargin` of
 * it) pushes the player 2 m back toward the plaza and Fritz says "not yet"
 * (at most once per cooldown).
 */
import { PLAYER } from '../player/controller';
import { PLAZA_CENTER, SLICE_RADIUS } from '../logic/worldLayout';
import { GROUPS, type PhysicsWorld, type Vec3Like } from './colliders';

export interface BlockerConfig {
  /** Cylinder radius (m). */
  radius: number;
  /** Distance between neighbouring cylinder centres (m); less than 2 * radius so they overlap. */
  spacing: number;
  height: number;
  /** The push triggers this far before the player's capsule touches the ring. */
  triggerMargin: number;
  pushBack: number;
  barkCooldownSec: number;
}

/** Adds the ring; returns the number of cylinders. */
export function addSliceBlockers(physics: PhysicsWorld, cfg: BlockerConfig): number {
  const ring = SLICE_RADIUS + cfg.radius;
  const count = Math.ceil((2 * Math.PI * ring) / cfg.spacing);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    physics.addStaticCylinder(
      { x: PLAZA_CENTER.x + Math.sin(a) * ring, y: cfg.height / 2 - 0.5, z: PLAZA_CENTER.z + Math.cos(a) * ring },
      cfg.height / 2,
      cfg.radius,
      { group: GROUPS.BLOCKER, blocker: 'slice' },
    );
  }
  return count;
}

export interface BoundaryDeps {
  /** Seconds. */
  now: () => number;
  bark: () => void;
}

export class SliceBoundary {
  private lastBark = -Infinity;

  constructor(
    private readonly cfg: BlockerConfig,
    private readonly deps: BoundaryDeps,
  ) {}

  /** Where to put the player's feet if they walked into the ring, else null. */
  check(feet: Vec3Like): Vec3Like | null {
    const dx = feet.x - PLAZA_CENTER.x;
    const dz = feet.z - PLAZA_CENTER.z;
    const d = Math.hypot(dx, dz);
    if (d < SLICE_RADIUS - PLAYER.radius - this.cfg.triggerMargin) return null;
    const t = this.deps.now();
    if (t - this.lastBark >= this.cfg.barkCooldownSec) {
      this.lastBark = t;
      this.deps.bark();
    }
    const k = (d - this.cfg.pushBack) / d;
    return { x: PLAZA_CENTER.x + dx * k, y: feet.y, z: PLAZA_CENTER.z + dz * k };
  }
}
