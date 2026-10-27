"""Face-only polish for a build that already came out of chibi_restyle.py.

The full chibi_polish.py run starts from a snapshot of the old pipeline and
redoes the whole thing. This one starts from whatever build is in front of it
and only fixes the face, so it can be run on top of the latest pipeline
output without undoing any of the work that came after.

    blender --background --factory-startup --python polish_face.py

    CHIBI_SRC   the .blend to read      (default: out/chibi_restyle.blend)
    CHIBI_DST   the .glb to write      (default: out/chibi_polish.glb)
"""

import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import chibi_polish as P

SRC = os.environ.get("CHIBI_SRC", os.path.join(HERE, "out", "chibi_restyle.blend"))
DST = os.environ.get("CHIBI_DST", os.path.join(HERE, "out", "chibi_polish.glb"))


def main():
    P.purge()
    bpy.ops.wm.open_mainfile(filepath=SRC)
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for ob in objs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    lo, hi = P.world_bounds(objs)
    print(f"[load] {os.path.basename(SRC)}: {len(objs)} meshes, "
          f"{sum(len(o.data.polygons) for o in objs)} faces")

    P.polish_face_only(objs, lo, hi)

    for ob in objs:
        for p in ob.data.polygons:
            p.use_smooth = True

    bpy.ops.export_scene.gltf(filepath=DST, export_format="GLB",
                              use_selection=False, export_apply=True,
                              export_yup=True,
                              export_draco_mesh_compression_enable=True,
                              export_draco_mesh_compression_level=6)
    tris = 0
    for ob in bpy.context.scene.objects:
        if ob.type == "MESH":
            ob.data.calc_loop_triangles()
            tris += len(ob.data.loop_triangles)
    print(f"[done] tris={tris} out={DST} size={os.path.getsize(DST)}")

    if os.environ.get("CHIBI_RENDER"):
        cam = P.setup_scene()
        P.render_views(cam)


main()
