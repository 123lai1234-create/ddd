"""Render the orthographic front view of the built mascot.

The reference PNG is aligned with this camera, so the render can be laid
directly over chibi-hero.png and compared pixel by pixel.

    blender --background --factory-startup --python blender/_ortho_render.py
"""
import math
import os

import bpy

OUT = r"D:\project\blender\out"
PX, W, Z_TOP, ROW_TOP = 1025.0, 2048, 1.800, 115.0


def main():
    bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT, "chibi.blend"))
    scn = bpy.context.scene
    z_center = Z_TOP - (W / 2.0 - ROW_TOP) / PX

    cd = bpy.data.cameras.get("SilCam") or bpy.data.cameras.new("SilCam")
    cd.type = "ORTHO"
    cd.ortho_scale = W / PX
    cam = bpy.data.objects.get("SilCam")
    if cam is None:
        cam = bpy.data.objects.new("SilCam", cd)
        bpy.context.collection.objects.link(cam)
    cam.location = (0.0, -6.0, z_center)
    cam.rotation_euler = (math.radians(90), 0.0, 0.0)
    scn.camera = cam

    scn.render.resolution_x = W
    scn.render.resolution_y = W
    scn.render.resolution_percentage = 100
    scn.render.film_transparent = True
    scn.render.image_settings.file_format = "PNG"
    scn.render.image_settings.color_mode = "RGBA"

    meshes = [o for o in scn.objects if o.type == "MESH" and o.name != "Floor"]
    for o in meshes:
        o.hide_render = False
    scn.render.filepath = os.path.join(OUT, "_ortho_front.png")
    bpy.ops.render.render(write_still=True)

    # the silhouette only: flat black, so the diff can threshold it
    for o in meshes:
        o.hide_render = False
    scn.render.filepath = os.path.join(OUT, "_sil_all.png")
    bpy.ops.render.render(write_still=True)
    print("[ortho] done")


main()
