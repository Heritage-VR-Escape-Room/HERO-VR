/** Test-only: summarize a loaded glTF (clip names, bone names, triangles, bounds). Dynamically imported by the hook. */
import { Box3, Mesh, Vector3, type Bone } from 'three/webgpu';
import type { GLTF } from '../world/assets';

export function describeModel(gltf: GLTF) {
  const bones: string[] = [];
  let tris = 0;
  gltf.scene.traverse((o) => {
    if ((o as Bone).isBone) bones.push(o.name);
    const m = o as Mesh;
    if (m.isMesh) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
  });
  gltf.scene.updateMatrixWorld(true);
  const box = new Box3().setFromObject(gltf.scene, true);
  const size = box.getSize(new Vector3());
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return {
    clips: gltf.animations.map((c) => c.name),
    bones,
    tris: Math.round(tris),
    size: [r(size.x), r(size.y), r(size.z)] as [number, number, number],
    min: [r(box.min.x), r(box.min.y), r(box.min.z)] as [number, number, number],
  };
}
