import { describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three/webgpu';
import { createFollower, followSpot, HOVER_HEIGHT_M } from '../../src/companion/follow';

describe('Fritz follows the player, always flying', () => {
  it('aims ahead and to the right (bearing 0 = north = +Z, east = -X)', () => {
    const s = followSpot({ x: 0, z: 0 }, 0);
    expect(s.z).toBeCloseTo(3.5);
    expect(s.x).toBeCloseTo(-1.3); // right of a player facing north is east (-X)
  });

  it('hovers at head height, over obstacles, and snaps after a teleport', () => {
    const fritz = { position: new Vector3(0, 0, 0), hover: vi.fn() };
    const f = createFollower(fritz, () => 0, [{ x: -1.3, z: 3.5, half: 4, top: 7 }]);
    f.update({ x: 0, y: 0, z: 0 }, 0);
    expect(fritz.hover).not.toHaveBeenCalled();
    f.enabled = true;
    f.update({ x: 0, y: 0, z: 0 }, 0);
    const [target] = fritz.hover.mock.calls.at(-1)! as [Vector3];
    expect(target.y).toBeCloseTo(8.2); // above the 7 m obstacle
    f.update({ x: 0, y: 0, z: 100 }, 0);
    expect(fritz.position.z).toBeCloseTo(103.5);
    const [t2] = fritz.hover.mock.calls.at(-1)! as [Vector3];
    expect(t2.y).toBeCloseTo(HOVER_HEIGHT_M);
    f.enabled = false;
    f.update({ x: 0, y: 0, z: 100 }, 0);
    expect(fritz.hover).toHaveBeenLastCalledWith(null);
  });
});
