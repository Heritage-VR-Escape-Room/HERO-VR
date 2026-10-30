"""Normalize a downloaded glTF/GLB: strip cameras/lights, scale to real size, pivot at bottom-center, face +Z.

Run headless with the portable Blender:
  blender -b -P fix_transform.py -- in.glb out.glb --size <m> --axis <height|length>
          [--keep <regex>] [--drop <regex>] [--yaw <deg>]

--size/--axis : target size in meters of the model's bounding box along height (up) or length (longest horizontal side)
--keep        : keep only mesh objects whose own name or ancestor name matches (extract one model from a pack)
--drop        : delete objects whose name matches
--yaw         : extra rotation about the up axis in degrees (fixes models that import facing the wrong way)

Static models get transforms applied (baked into the mesh) and are exported. Skinned models are never baked (that
would break the rig) and Blender's export would replace their authored pose with the rest pose, so for them this
script only MEASURES: it prints FIX_XFORM {scale, yaw, pivot} and optimize.mjs applies it to the raw glTF as a
root-node transform. (A GLB is still written so previews work.)
"""
import math
import re
import sys

import bpy
from mathutils import Matrix, Vector


def parse(argv):
    args = argv[argv.index("--") + 1:] if "--" in argv else []
    if len(args) < 2:
        sys.exit("usage: blender -b -P fix_transform.py -- in.glb out.glb --size <m> --axis <height|length>")
    opt = {"in": args[0], "out": args[1], "size": None, "axis": "height", "keep": None, "drop": None, "yaw": 0.0}
    i = 2
    while i < len(args):
        key = args[i].lstrip("-")
        opt[key] = args[i + 1]
        i += 2
    opt["size"] = float(opt["size"])
    opt["yaw"] = float(opt["yaw"])
    if opt["axis"] not in ("height", "length"):
        sys.exit("--axis must be height or length")
    return opt


def lineage_names(obj):
    names = []
    while obj:
        names.append(obj.name)
        obj = obj.parent
    return names


def world_bounds(meshes):
    mn = Vector((1e18, 1e18, 1e18))
    mx = Vector((-1e18, -1e18, -1e18))
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for o in meshes:
        ev = o.evaluated_get(depsgraph)
        for c in ev.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector((min(mn[i], w[i]) for i in range(3)))
            mx = Vector((max(mx[i], w[i]) for i in range(3)))
    return mn, mx


def main():
    o = parse(sys.argv)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=o["in"])

    # The glTF importer adds an "Icosphere" mesh as bone display shape; it is not part of the model.
    # Collect the armatures first: removing a shape object while iterating the
    # object list leaves a dead reference (rigs with several armatures).
    armatures = [obj for obj in bpy.data.objects if obj.type == "ARMATURE" and obj.pose]
    for obj in armatures:
            for pb in obj.pose.bones:
                if pb.custom_shape:
                    shape = pb.custom_shape
                    pb.custom_shape = None
                    if shape.name in bpy.data.objects:
                        bpy.data.objects.remove(shape, do_unlink=True)

    for obj in list(bpy.data.objects):
        doomed = obj.type in ("CAMERA", "LIGHT")
        if o["drop"] and re.search(o["drop"], obj.name):
            doomed = True
        if o["keep"] and obj.type == "MESH" and not any(re.search(o["keep"], n) for n in lineage_names(obj)):
            doomed = True
        if doomed:
            bpy.data.objects.remove(obj, do_unlink=True)

    meshes = [x for x in bpy.data.objects if x.type == "MESH"]
    if not meshes:
        sys.exit("no mesh objects left after filtering")
    skinned = any(x.type == "ARMATURE" for x in bpy.data.objects) or any(
        m.modifiers and any(md.type == "ARMATURE" for md in m.modifiers) for m in meshes
    )

    bpy.context.view_layer.update()
    mn, mx = world_bounds(meshes)
    size = mx - mn
    ref = size.z if o["axis"] == "height" else max(size.x, size.y)
    if ref <= 1e-9:
        sys.exit("degenerate bounds")
    scale = o["size"] / ref
    pivot = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))

    # Blender is Z-up and exports glTF +Z (forward) from Blender -Y. Yaw is about Z.
    rot = Matrix.Rotation(math.radians(o["yaw"]), 4, "Z")
    xform = rot @ Matrix.Scale(scale, 4) @ Matrix.Translation(-pivot)

    roots = [x for x in bpy.data.objects if x.parent is None]
    if skinned:
        root = bpy.data.objects.new("root", None)
        bpy.context.scene.collection.objects.link(root)
        for r in roots:
            r.parent = root
            r.matrix_parent_inverse = Matrix.Identity(4)
        root.matrix_world = xform
    else:
        for r in roots:
            r.matrix_world = xform @ r.matrix_world
        bpy.ops.object.select_all(action="DESELECT")
        for x in bpy.data.objects:
            if x.type == "MESH":
                x.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.make_single_user(object=True, obdata=True)
        bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    bpy.context.view_layer.update()
    mn2, mx2 = world_bounds([x for x in bpy.data.objects if x.type == "MESH"])
    # glTF space = (x, z, -y) of Blender space. Skinned models are re-posed from the RAW file by optimize.mjs
    # (Blender would export the rest pose, not the model's authored pose), using this transform.
    import json as _json
    print("FIX_XFORM", _json.dumps({"scale": scale, "yaw": o["yaw"], "pivot": [pivot.x, pivot.z, -pivot.y]}))
    print("FIX_RESULT", "skinned" if skinned else "static", "size", tuple(round(v, 3) for v in (mx2 - mn2)),
          "min", tuple(round(v, 3) for v in mn2))

    bpy.ops.export_scene.gltf(filepath=o["out"], export_format="GLB", export_yup=True, export_animations=True,
                              export_cameras=False, export_lights=False)


main()
