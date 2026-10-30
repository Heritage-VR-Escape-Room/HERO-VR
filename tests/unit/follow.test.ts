import { describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three/webgpu';
import { createFollower, followSpot } from '../../src/companion/follow';

describe('Fritz follows the player', () => {
  it('stands ahead and to the right (bearing 0 = north = +Z, east = -X)', () => {
    const s = followSpot({ x: 0, z: 0 }, 0);
    expect(s.z).toBeCloseTo(3.5);
    expect(s.x).toBeCloseTo(-1.3); // right of a player facing north is east (-X)
  });

  it('flies only once the player is far enough, and snaps after a teleport', () => {
    const fritz = { position: new Vector3(-1.3, 0, 3.5), state: 'perch', addPerch: vi.fn(), flyTo: vi.fn(async () => {}), place: vi.fn() };
    const f = createFollower(fritz, () => 0);
    f.enabled = true;
    f.update({ x: 0, z: 0 }, 0);
    expect(fritz.flyTo).not.toHaveBeenCalled();
    f.update({ x: 0, z: 9 }, 0);
    expect(fritz.flyTo).toHaveBeenCalledWith('follow');
    f.update({ x: 0, z: 100 }, 0);
    expect(fritz.place).toHaveBeenCalledWith('follow');
  });
});
