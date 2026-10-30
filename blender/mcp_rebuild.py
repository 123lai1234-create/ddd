"""Helper for driving the build from a live Blender GUI session over MCP.

    import sys; sys.path.insert(0, r'D:\\project\\blender')
    import mcp_rebuild; mcp_rebuild.rebuild(); mcp_rebuild.page_cam()

`rebuild()` runs chibi_build.py inside the running Blender (2 s instead of a
headless start-up), skipping the four preview renders.
"""

import importlib
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "chibi_build.py")

if HERE not in sys.path:
    sys.path.insert(0, HERE)


def rebuild(skip_renders=True, quiet=True):
    import chibi_lib
    importlib.reload(chibi_lib)
    src = open(BUILD, "r", encoding="utf-8").read()
    g = {"__name__": "chibi_build_mod", "__file__": BUILD}
    exec(compile(src, BUILD, "exec"), g)
    if skip_renders:
        g["render_views"] = lambda: (None, {})
    if quiet:
        import contextlib
        import io
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            g["main"]()
        g["_log"] = buf.getvalue()
    else:
        g["main"]()
    return g


def page_cam(lens=67.2):
    """Camera matching the page's model-viewer: orbit 0deg 82deg 4.4m,
    target (0, 0.9, 0.2) in gltf space, field-of-view 30deg."""
    phi = math.radians(82.0)
    off = Vector((0.0, -4.4 * math.sin(phi), 4.4 * math.cos(phi)))
    tgt = Vector((0.0, -0.2, 0.9))
    old = bpy.data.objects.get("PageCam")
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    cam_data = bpy.data.cameras.new("PageCam")
    cam_data.lens = lens
    cam = bpy.data.objects.new("PageCam", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = tgt + off
    cam.rotation_euler = (tgt - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam
    return cam


def silhouette():
    """Half width of the hair per height band - compare against
    blender/measure_hero.py's reference profile."""
    prof = {}
    for o in bpy.context.scene.objects:
        if o.type != "MESH" or not o.name.startswith("Hair"):
            continue
        mw = o.matrix_world
        for v in o.data.vertices:
            co = mw @ v.co
            key = int(round(co.z * 25.0)) / 25.0
            if abs(co.x) > prof.get(key, 0.0):
                prof[key] = abs(co.x)
    return [(z, round(prof[z], 3)) for z in sorted(prof, reverse=True)
            if z >= 0.95]
