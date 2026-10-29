import { describe, it, expect } from 'vitest';
import { Object3D, Vector3 } from 'three/webgpu';
import { Fritz } from '../../src/companion/fritz';

function makeFritz(): Fritz {
  return new Fritz({
    runner: { play() {} },
    director: { say: () => true },
    highlight: { setHighlighted() {} },
    now: () => 0,
  });
}

/** A tiny clip-less model: named wing and head nodes. */
function model() {
  const scene = new Object3D();
  const [wl, wr, head] = ['Wing_L', 'Wing_R', 'Head'].map((n) => {
    const o = new Object3D();
    o.name = n;
    scene.add(o);
    return o;
  }) as [Object3D, Object3D, Object3D];
  return { gltf: { scene, animations: [] }, wl, wr, head };
}

describe('Fritz procedural animation on an attached model', () => {
  it('flaps the model wing nodes in fly', () => {
    const f = makeFritz();
    f.addPerch('a', new Vector3(0, 0, 0), 0);
    f.addPerch('b', new Vector3(12, 0, 0), 0);
    f.place('a');
    const m = model();
    f.attachModel(m.gltf);
    void f.flyTo('b');
    const seen: number[] = [];
    for (let i = 0; i < 20; i++) {
      f.update(0.02);
      seen.push(m.wl.rotation.z);
    }
    expect(f.state).toBe('fly');
    expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(0.5);
    // Wings beat in opposition.
    expect(m.wr.rotation.z).toBeCloseTo(-m.wl.rotation.z, 5);
  });

  it('moves the model head in idle', () => {
    const f = makeFritz();
    const m = model();
    f.attachModel(m.gltf);
    for (let i = 0; i < 150; i++) f.update(0.02); // 3 s: perch -> idle
    expect(f.state).toBe('idle');
    const seen: number[] = [];
    for (let i = 0; i < 50; i++) {
      f.update(0.02);
      seen.push(m.head.rotation.z);
    }
    expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(0.05);
  });
});
