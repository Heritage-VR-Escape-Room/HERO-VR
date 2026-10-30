"""
Convert a textured OBJ scan (Polycam / RealityScan style: map_Kd, norm, map_Pr,
map_ao) into a GLB, so the regular optimize.mjs pipeline can take it.

  blender -b -P obj_to_glb.py -- in.obj out.glb

The OBJ importer brings in the base colour, normal and roughness maps; the AO
map is wired into the glTF occlusion slot through a glTF Material Output group.
"""
import os
import sys

import bpy


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :]
    src, dst = argv[0], argv[1]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.obj_import(filepath=src)
    folder = os.path.dirname(src)
    mtl = None
    for line in open(os.path.join(folder, [f for f in os.listdir(folder) if f.endswith(".mtl")][0]), encoding="utf-8"):
        if line.startswith("map_ao"):
            mtl = line.split(None, 1)[1].strip()
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        nt = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf:
            bsdf.inputs["Metallic"].default_value = 0.0
        if mtl and bsdf:
            img = bpy.data.images.load(os.path.join(folder, mtl))
            img.colorspace_settings.name = "Non-Color"
            tex = nt.nodes.new("ShaderNodeTexImage")
            tex.image = img
            group = bpy.data.node_groups.get("glTF Material Output") or bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
            if not group.interface.items_tree:
                group.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
            gnode = nt.nodes.new("ShaderNodeGroup")
            gnode.node_tree = group
            sep = nt.nodes.new("ShaderNodeSeparateColor")
            nt.links.new(tex.outputs["Color"], sep.inputs["Color"])
            nt.links.new(sep.outputs[0], gnode.inputs[0])
    bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_image_format="AUTO")
    print("OBJ_TO_GLB", dst)


main()
