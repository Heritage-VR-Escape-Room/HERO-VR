import { describe, it, expect } from 'vitest';
import { Object3D, Vector3 } from 'three/webgpu';
import { Fritz, findRig } from '../../src/companion/fritz';

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

describe('findRig on the placeholder crow bone names', () => {
  it('finds both wings (clavicle bones) and the head', () => {
    const root = new Object3D();
    // Names as three.js sanitizes them from the CC-BY Crow GLB (public/assets/raven_rigged).
    for (const n of ['CROW__Neck_04', 'CROW__Head_05', 'CROW__L_Clavicle_07', 'WingLeftC_011', 'CROW__R_Clavicle_019', 'WingRightC_023']) {
      const o = new Object3D();
      o.name = n;
      root.add(o);
    }
    const rig = findRig(root);
    expect(rig.wings.map((w) => w.node.name).sort()).toEqual(['CROW__L_Clavicle_07', 'CROW__R_Clavicle_019']);
    expect(rig.wings.find((w) => w.node.name.includes('_L_'))!.side).toBe(1);
    expect(rig.head!.name).toBe('CROW__Head_05');
  });
});

describe('Fritz bird rig (world-axis wings, folded on the perch)', () => {
  /** Left and right wing chains spread flat along +-X, like the crow's authored flight pose. */
  function birdModel() {
    const scene = new Object3D();
    const chain = (side: 'L' | 'R', sx: number) => {
      const names = [`CROW__${side}_Clavicle`, `CROW__${side}_UpperArm`, `CROW__${side}_Forearm`, `CROW__${side}_Hand`];
      let parent: Object3D = scene;
      const nodes = names.map((n, i) => {
        const o = new Object3D();
        o.name = n;
        o.position.set(i === 0 ? sx * 0.05 : sx * 0.15, 0, 0);
        parent.add(o);
        parent = o;
        return o;
      });
      const tip = new Object3D();
      tip.position.set(sx * 0.3, 0, 0);
      nodes[3]!.add(tip);
      return tip;
    };
    const head = new Object3D();
    head.name = 'CROW__Head';
    scene.add(head);
    return { gltf: { scene, animations: [] }, tipL: chain('L', 1), tipR: chain('R', -1) };
  }
  const world = (o: Object3D) => {
    o.updateWorldMatrix(true, false);
    return new Vector3().setFromMatrixPosition(o.matrixWorld);
  };

  it('folds both wing tips back along the body while perched', () => {
    const f = makeFritz();
    f.addPerch('a', new Vector3(0, 0, 0), 0);
    f.place('a');
    const m = birdModel();
    const spreadL = world(m.tipL).x;
    f.attachModel(m.gltf, { wingAxes: 'world' });
    f.update(0.02);
    const l = world(m.tipL);
    const r = world(m.tipR);
    expect(Math.abs(l.x)).toBeLessThan(spreadL * 0.4); // tucked in near the body
    expect(l.z).toBeLessThan(0); // pointing back (Fritz faces +Z at bearing 0)
    expect(r.z).toBeLessThan(0);
    expect(l.x).toBeCloseTo(-r.x, 5); // mirror images
  });

  it('spreads and beats the wings about the body axis in flight', () => {
    const f = makeFritz();
    f.addPerch('a', new Vector3(0, 0, 0), 0);
    f.addPerch('b', new Vector3(0, 0, 12), 0);
    f.place('a');
    const m = birdModel();
    f.attachModel(m.gltf, { wingAxes: 'world' });
    void f.flyTo('b');
    const ys: number[] = [];
    for (let i = 0; i < 20; i++) {
      f.update(0.02);
      ys.push(world(m.tipL).y - f.position.y);
      const l = world(m.tipL).sub(f.position);
      expect(Math.hypot(l.x, l.y)).toBeGreaterThan(0.4); // spread, not folded
    }
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.2);
  });
});
