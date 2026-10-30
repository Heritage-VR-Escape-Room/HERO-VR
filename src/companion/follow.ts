/**
 * Fritz follows the player (owner request). He lands only once, for his
 * introduction; from then on he is always in the air, hovering at about head
 * height ahead of the player and a little to the right, where they can see
 * him. Near the pyramid he rises above it instead of flying into the stone.
 */
import { Vector3 } from 'three/webgpu';

/** Where Fritz wants to be (ground position): 3.5 m ahead and 1.3 m to the right. */
export function followSpot(player: { x: number; z: number }, yawDeg: number): { x: number; z: number } {
  const b = (yawDeg * Math.PI) / 180;
  // Bearing b: forward = (-sin b, cos b) in x/z (east = -X); right = (-cos b, -sin b).
  const fx = -Math.sin(b);
  const fz = Math.cos(b);
  const rx = -Math.cos(b);
  const rz = -Math.sin(b);
  return { x: player.x + fx * 3.5 + rx * 1.3, z: player.z + fz * 3.5 + rz * 1.3 };
}

/** Hover height above the ground (the player's eye is at about 1.66 m). */
export const HOVER_HEIGHT_M = 2.1;
/** Beyond this he is put at the spot directly (a teleport, a reload). */
export const FOLLOW_SNAP_M = 40;

/** A box (x/z half extents, top height) Fritz flies over rather than through. */
export interface Obstacle {
  x: number;
  z: number;
  half: number;
  top: number;
}

export interface Follower {
  enabled: boolean;
  update(player: { x: number; y: number; z: number }, yawDeg: number): void;
}

export function createFollower(
  fritz: { position: Vector3; hover(target: Vector3 | null, look?: Vector3): void },
  groundAt: (x: number, z: number) => number,
  obstacles: Obstacle[] = [],
): Follower {
  const target = new Vector3();
  const look = new Vector3();
  let wasEnabled = false;
  return {
    enabled: false,
    update(player, yawDeg) {
      if (!this.enabled) {
        if (wasEnabled) fritz.hover(null);
        wasEnabled = false;
        return;
      }
      wasEnabled = true;
      const s = followSpot(player, yawDeg);
      let y = groundAt(s.x, s.z) + HOVER_HEIGHT_M;
      for (const o of obstacles) if (Math.abs(s.x - o.x) < o.half && Math.abs(s.z - o.z) < o.half) y = Math.max(y, o.top + 1.2);
      target.set(s.x, y, s.z);
      look.set(player.x, player.y + 1.6, player.z);
      if (Math.hypot(fritz.position.x - s.x, fritz.position.z - s.z) > FOLLOW_SNAP_M) fritz.position.copy(target);
      fritz.hover(target, look);
    },
  };
}
