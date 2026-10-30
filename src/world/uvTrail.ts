/**
 * The UV energy trail the Spectrum Lenses reveal: glowing violet dashes on
 * the ground from the pyramid north into the Schlossgarten, ending in a
 * light pillar. Invisible without the lenses.
 */
import {
  AdditiveBlending,
  CatmullRomCurve3,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  Vector3,
} from 'three/webgpu';

/** Trail waypoints (x, z): out of the pyramid's north face, past the bench, to the plaza's north edge. */
export const TRAIL_POINTS: ReadonlyArray<{ x: number; z: number }> = [
  { x: 0, z: -166.4 },
  { x: 1.8, z: -158 },
  { x: -1.2, z: -147 },
  { x: 1.2, z: -135 },
  { x: -1.8, z: -123 },
  { x: 1.5, z: -110 },
];
export const TRAIL_END = TRAIL_POINTS[TRAIL_POINTS.length - 1]!;
const DASH_EVERY_M = 0.9;

export function createUvTrail(groundAt: (x: number, z: number) => number) {
  const root = new Group();
  root.name = 'uv_trail';
  root.visible = false;
  const curve = new CatmullRomCurve3(TRAIL_POINTS.map((p) => new Vector3(p.x, groundAt(p.x, p.z) + 0.03, p.z)));
  const n = Math.floor(curve.getLength() / DASH_EVERY_M);
  const mat = new MeshBasicMaterial({ color: '#b066ff', transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
  const dashes = new InstancedMesh(new PlaneGeometry(0.16, 0.5), mat, n);
  const m = new Matrix4();
  const q = new Quaternion();
  const flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    q.setFromAxisAngle(new Vector3(0, 1, 0), Math.atan2(tan.x, tan.z)).multiply(flat);
    p.y = groundAt(p.x, p.z) + 0.03;
    dashes.setMatrixAt(i, m.compose(p, q, new Vector3(1, 1, 1)));
  }
  dashes.frustumCulled = false;
  root.add(dashes);
  // End marker: a ring on the ground and a soft pillar of light.
  const end = new Vector3(TRAIL_END.x, groundAt(TRAIL_END.x, TRAIL_END.z), TRAIL_END.z);
  const ring = new Mesh(new RingGeometry(0.7, 0.95, 48), mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(end).setY(end.y + 0.04);
  const pillar = new Mesh(
    new CylinderGeometry(0.5, 0.8, 9, 24, 1, true),
    new MeshBasicMaterial({ color: '#8a3dff', transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
  );
  pillar.position.copy(end).setY(end.y + 4.5);
  root.add(ring, pillar);
  let t = 0;
  return {
    root,
    curve,
    update(dt: number) {
      if (!root.visible) return;
      t += dt;
      mat.opacity = 0.65 + 0.3 * Math.sin(t * 3);
      ring.scale.setScalar(1 + 0.08 * Math.sin(t * 2));
    },
  };
}
