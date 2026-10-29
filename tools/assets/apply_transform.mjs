// Wrap a glTF scene in one root node carrying a uniform scale, a yaw and a translation, leaving every other node,
// the skin and the animations untouched (so the authored pose survives, unlike a Blender round trip).
//   node apply_transform.mjs in.glb out.glb '{"scale":0.01,"yaw":0,"pivot":[x,y,z]}'
// pivot is in glTF space; it ends up at the origin (bottom-center of the model).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const [, , input, output, json] = process.argv;
const { scale, yaw, pivot } = JSON.parse(json);
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(input);
const scene = doc.getRoot().listScenes()[0];

const wrapper = doc.createNode('model_root');
for (const child of scene.listChildren()) {
  scene.removeChild(child);
  wrapper.addChild(child);
}
// Drop camera/light helper nodes some exporters leave behind.
for (const n of wrapper.listChildren()) if (!n.getMesh() && !n.getSkin() && /^(camera|lamp|light)/i.test(n.getName())) n.dispose();

// translation = R * s * (-pivot), rotation = yaw about +Y
const half = (yaw * Math.PI) / 360;
const [sin, cos] = [Math.sin(half), Math.cos(half)];
const rot = (v) => {
  const a = (yaw * Math.PI) / 180;
  return [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)];
};
const t = rot(pivot.map((v) => -v * scale));
wrapper.setScale([scale, scale, scale]).setRotation([0, sin, 0, cos]).setTranslation(t);
scene.addChild(wrapper);
await io.write(output, doc);
