"""Render front (+Z side) and side previews of a GLB with Workbench, for checking scale and facing.

  blender -b -P preview.py -- in.glb out_prefix
Writes <out_prefix>_front.png and <out_prefix>_side.png. The front camera sits on the glTF +Z side looking back,
so a model that "faces +Z" shows its face/front in the front render.
"""
import math
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
src, prefix = args[0], args[1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
dg = bpy.context.evaluated_depsgraph_get()
mn = Vector((1e18,) * 3)
mx = Vector((-1e18,) * 3)
for o in meshes:
    for c in o.evaluated_get(dg).bound_box:
        w = o.matrix_world @ Vector(c)
        mn = Vector(min(mn[i], w[i]) for i in range(3))
        mx = Vector(max(mx[i], w[i]) for i in range(3))
center = (mn + mx) / 2
span = max((mx - mn).length, 0.1)

scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "STUDIO"
scene.display.shading.color_type = "TEXTURE"
scene.render.resolution_x = scene.render.resolution_y = 640
scene.world = bpy.data.worlds.new("w")
scene.world.color = (0.35, 0.37, 0.4)
scene.render.film_transparent = False

cam_data = bpy.data.cameras.new("cam")
cam_data.type = "ORTHO"
cam_data.ortho_scale = span * 1.1
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

# Blender -Y == glTF +Z. Front camera at -Y looking +Y; side camera at +X looking -X.
for name, offset, rot in (
    ("front", Vector((0, -span * 2, 0)), (math.radians(90), 0, 0)),
    ("side", Vector((span * 2, 0, 0)), (math.radians(90), 0, math.radians(90))),
):
    cam.location = center + offset
    cam.rotation_euler = rot
    scene.render.filepath = f"{prefix}_{name}.png"
    bpy.ops.render.render(write_still=True)
print("PREVIEW_DONE", prefix)
