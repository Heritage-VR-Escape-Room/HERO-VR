/**
 * Fritz follows the player (owner request): he lands on the ground ahead and
 * a little to the right, where the player can see him, and hops after the
 * player in short flights once they get more than a few metres away.
 */
import { Vector3 } from 'three/webgpu';

/** Where Fritz wants to be: 3.5 m ahead and 1.3 m to the right, inside the player's view. */
export function followSpot(player: { x: number; z: number }, yawDeg: number): { x: number; z: number } {
  const b = (yawDeg * Math.PI) / 180;
  // Bearing b: forward = (-sin b, cos b) in x/z (east = -X); right = (-cos b, -sin b).
  const fx = -Math.sin(b);
  const fz = Math.cos(b);
  const rx = -Math.cos(b);
  const rz = -Math.sin(b);
  return { x: player.x + fx * 3.5 + rx * 1.3, z: player.z + fz * 3.5 + rz * 1.3 };
}

/** Fly when he is this far from the spot. */
export const FOLLOW_SLACK_M = 4;
/** Beyond this he is put down at the spot directly (a teleport, a reload). */
export const FOLLOW_SNAP_M = 40;

export interface Follower {
  enabled: boolean;
  update(player: { x: number; z: number }, yawDeg: number): void;
}

export function createFollower(
  fritz: {
    position: Vector3;
    state: string;
    addPerch(id: string, p: Vector3, facingDeg: number): void;
    flyTo(id: string): Promise<void>;
    place(id: string): void;
  },
  groundAt: (x: number, z: number) => number,
): Follower {
  const tmp = new Vector3();
  return {
    enabled: false,
    update(player, yawDeg) {
      if (!this.enabled || fritz.state === 'fly') return;
      const s = followSpot(player, yawDeg);
      const d = Math.hypot(fritz.position.x - s.x, fritz.position.z - s.z);
      if (d < FOLLOW_SLACK_M) return;
      // Face the player once landed.
      const facing = (Math.atan2(-(player.x - s.x), player.z - s.z) * 180) / Math.PI;
      fritz.addPerch('follow', tmp.set(s.x, groundAt(s.x, s.z), s.z), facing);
      if (d > FOLLOW_SNAP_M) fritz.place('follow');
      else void fritz.flyTo('follow');
    },
  };
}
