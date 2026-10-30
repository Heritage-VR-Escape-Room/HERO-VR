import { describe, expect, it } from 'vitest';
import { LOCK_ACTIVE_RADIUS_M, PLAZA, lampPositions, lockIsActive, bearingToward } from '../../src/logic/plazaLayout';

describe('plaza placement', () => {
  it('puts the brief positions where they belong', () => {
    expect(PLAZA.pyramid.position).toEqual([0, 0, -170]);
    expect(PLAZA.pyramid.height).toBe(6.8);
    expect(PLAZA.bench.position).toEqual([6, 0, -150]);
    expect(PLAZA.kiosk.position).toEqual([-18, 0, -160]);
    expect(PLAZA.citizens.map((c) => c.position)).toEqual([
      [-2.7, 0, -174.7], // Anvin, by the circuit panel
      [-8, 0, -195],
    ]);
  });

  it('has 8 streetlamps on a 22 m ring around the pyramid', () => {
    const lamps = lampPositions();
    expect(lamps).toHaveLength(8);
    for (const l of lamps) expect(Math.hypot(l.x - 0, l.z + 170)).toBeCloseTo(22, 6);
  });

  it('names every perch and viewpoint', () => {
    expect(Object.keys(PLAZA.perches).sort()).toEqual(['bench_back', 'kiosk_roof', 'lamp_3', 'pyramid_tip']);
    expect(Object.keys(PLAZA.viewpoints).sort()).toEqual(['kiosk', 'lock', 'menu_orbit', 'plaque', 'pyramid', 'wake', 'wide']);
    for (const vp of Object.values(PLAZA.viewpoints)) {
      expect(vp.position).toHaveLength(3);
      expect(vp.target).toHaveLength(3);
    }
  });

  it('the wake bench faces the pyramid', () => {
    const b = bearingToward(PLAZA.bench.position, PLAZA.pyramid.position);
    // From (6, -150) the pyramid lies south-south-east in this frame (east = -X): bearing ~163 deg.
    expect(b).toBeCloseTo(180 - (Math.atan2(6, 20) * 180) / Math.PI, 6);
  });
});

describe('active puzzle', () => {
  const door = { x: 0, z: -173.3 };
  it('is the lock within 6 m of the pyramid door', () => {
    expect(LOCK_ACTIVE_RADIUS_M).toBe(6);
    expect(lockIsActive({ x: 0, z: -179.2 }, door, false)).toBe(true);
    expect(lockIsActive({ x: 0, z: -179.4 }, door, false)).toBe(false);
  });
  it('is the lock while it is focused, wherever the player stands', () => {
    expect(lockIsActive({ x: 0, z: -190 }, door, true)).toBe(true);
  });
});
