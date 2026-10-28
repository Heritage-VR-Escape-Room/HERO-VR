/**
 * Rapier physics world: static level colliders, collision groups and
 * raycasts. Colliders carry user data (the footstep surface tag) in a side
 * table keyed by collider handle, since Rapier colliders have no userData.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3, type BufferGeometry, type Matrix4 } from 'three/webgpu';

export const GRAVITY = -9.81;

export const GROUPS = { WORLD: 1, INTERACTABLE: 2, PLAYER: 4, BLOCKER: 8 } as const;
export const ALL_GROUPS = 0xffff;

export type Surface = 'cobble' | 'gravel' | 'grass' | 'wood' | 'metal';

export interface ColliderData {
  surface?: Surface;
  [key: string]: unknown;
}

export interface StaticOptions extends ColliderData {
  /** Membership group; default WORLD. */
  group?: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface RaycastHit {
  point: Vec3Like;
  distance: number;
  collider: RAPIER.Collider;
  data: ColliderData;
}

/** Rapier interaction groups: membership in the high 16 bits, filter in the low 16. */
export function interactionGroups(membership: number, filter: number): number {
  return (((membership & 0xffff) << 16) | (filter & 0xffff)) >>> 0;
}

let initPromise: Promise<void> | null = null;

export class PhysicsWorld {
  private readonly data = new Map<number, ColliderData>();
  /** Colliders added since the last step are invisible to scene queries until the broad phase updates. */
  private queriesStale = false;

  private constructor(readonly world: RAPIER.World) {}

  static async create(): Promise<PhysicsWorld> {
    initPromise ??= RAPIER.init();
    await initPromise;
    return new PhysicsWorld(new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }));
  }

  /** Advance the simulation by one fixed step. */
  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
    this.queriesStale = false;
  }

  /**
   * Make newly added colliders visible to raycasts and character moves. A
   * zero-length step updates the broad phase without moving anything; call it
   * only when no kinematic target is pending (e.g. at the start of a fixed step).
   */
  syncQueries(): void {
    if (this.queriesStale) this.step(0);
  }

  addStaticBox(center: Vec3Like, halfExtents: Vec3Like, rotY = 0, opts: StaticOptions = {}): RAPIER.Collider {
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), rotY);
    const desc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setTranslation(center.x, center.y, center.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    return this.addStatic(desc, opts);
  }

  /**
   * Heightfield of (nrows+1) x (ncols+1) heights (Rapier's column-major
   * layout), spanning `scale.x` by `scale.z` metres, heights multiplied by
   * `scale.y`, centred on `center`.
   */
  addHeightfield(
    nrows: number,
    ncols: number,
    heights: Float32Array,
    scale: Vec3Like,
    center: Vec3Like,
    opts: StaticOptions = {},
  ): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.heightfield(nrows, ncols, heights, scale).setTranslation(center.x, center.y, center.z);
    return this.addStatic(desc, opts);
  }

  /** Triangle mesh from a (possibly indexed) geometry, baked through `matrix` into world space. */
  addTrimesh(geometry: BufferGeometry, matrix: Matrix4, opts: StaticOptions = {}): RAPIER.Collider {
    const pos = geometry.getAttribute('position');
    const vertices = new Float32Array(pos.count * 3);
    const v = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      vertices.set([v.x, v.y, v.z], i * 3);
    }
    const index = geometry.getIndex();
    const indices = index ? Uint32Array.from(index.array) : Uint32Array.from({ length: pos.count }, (_, i) => i);
    return this.addStatic(RAPIER.ColliderDesc.trimesh(vertices, indices), opts);
  }

  /** Closest hit along `dir` (normalised here) within `maxDist`, against colliders in `groupMask`. */
  raycast(origin: Vec3Like, dir: Vec3Like, maxDist: number, groupMask: number): RaycastHit | null {
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const d = { x: dir.x / len, y: dir.y / len, z: dir.z / len };
    this.syncQueries();
    const ray = new RAPIER.Ray(origin, d);
    const hit = this.world.castRay(ray, maxDist, true, undefined, interactionGroups(ALL_GROUPS, groupMask));
    if (!hit) return null;
    const t = hit.timeOfImpact;
    return {
      point: { x: origin.x + d.x * t, y: origin.y + d.y * t, z: origin.z + d.z * t },
      distance: t,
      collider: hit.collider,
      data: this.dataOf(hit.collider),
    };
  }

  dataOf(collider: RAPIER.Collider): ColliderData {
    return this.data.get(collider.handle) ?? {};
  }

  private addStatic(desc: RAPIER.ColliderDesc, opts: StaticOptions): RAPIER.Collider {
    const { group = GROUPS.WORLD, ...data } = opts;
    desc.setCollisionGroups(interactionGroups(group, ALL_GROUPS));
    const collider = this.world.createCollider(desc);
    this.data.set(collider.handle, data);
    this.queriesStale = true;
    return collider;
  }
}
