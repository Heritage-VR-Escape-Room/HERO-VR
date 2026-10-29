// Summarize a GLB: triangle count, world bounds, root nodes, clips, skins. Usage: node inspect.mjs file.glb [--tree]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

const file = process.argv[2];
const showTree = process.argv.includes('--tree');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(file);
const root = doc.getRoot();

function tris(mesh) {
  let t = 0;
  for (const p of mesh.listPrimitives()) {
    const idx = p.getIndices();
    t += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
  }
  return t;
}

const scene = root.listScenes()[0];
const b = getBounds(scene);
const size = b.max.map((v, i) => +(v - b.min[i]).toFixed(3));
let total = 0;
scene.traverse((n) => {
  const m = n.getMesh();
  if (m) total += tris(m);
});
console.log(JSON.stringify({
  file,
  tris: Math.round(total),
  size,
  min: b.min.map((v) => +v.toFixed(3)),
  max: b.max.map((v) => +v.toFixed(3)),
  rootNodes: scene.listChildren().map((n) => n.getName()),
  materials: root.listMaterials().length,
  textures: root.listTextures().map((t) => `${t.getMimeType()} ${t.getSize()?.join('x')}`),
  clips: root.listAnimations().map((a) => `${a.getName()} (${a.listChannels().length}ch)`),
  skins: root.listSkins().map((s) => `${s.getName()} joints=${s.listJoints().length}`),
}, null, 1));
if (showTree) {
  const walk = (n, d) => {
    const m = n.getMesh();
    const bb = m ? ` mesh=${m.getName()} tris=${tris(m)}` : '';
    console.log(`${'  '.repeat(d)}${n.getName()}${bb} s=${n.getScale().map((v) => +v.toFixed(3))}`);
    if (d < 4) n.listChildren().forEach((c) => walk(c, d + 1));
  };
  scene.listChildren().forEach((n) => walk(n, 0));
}
