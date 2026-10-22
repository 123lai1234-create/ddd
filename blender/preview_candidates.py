"""Render preview PNGs of candidate base meshes so they can be compared."""

import bpy
import os
import sys
import math
from mathutils import Vector

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "candidates")
os.makedirs(OUT, exist_ok=True)

CANDIDATES = [
    ("meshy-original", r"C:\Users\User\minimax-glb-tmp\chibi.glb"),
    ("meshy-fixed", r"C:\Users\User\minimax-glb-tmp\chibi-fixed.glb"),
    ("meshy-tinted-low", r"C:\Users\User\minimax-glb-tmp\chibi-tinted-low.glb"),
    ("triposr-uhd-front",
     r"C:\Users\User\.minimax\sessions\mvs_4523b3f8d78e4a098b3512a12e688cec"
     r"\workspace\kid-3d-project\3d-models-uhd\character_front_mc320_watertight.glb"),
    ("triposr-hq-front",
     r"C:\Users\User\.minimax\sessions\mvs_4523b3f8d78e4a098b3512a12e688cec"
     r"\workspace\kid-3d-project\3d-models-hq\character_front_mc256_watertight.glb"),
    ("chibi-base-obj",
     r"C:\Users\User\.minimax\sessions\mvs_4523b3f8d78e4a098b3512a12e688cec"
     r"\workspace\kid-3d-project\chibi_base.obj"),
]


def purge():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)


def setup():
    scn = bpy.context.scene
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
        try:
            scn.render.engine = engine
            break
        except TypeError:
            continue
    scn.render.resolution_x = 900
    scn.render.resolution_y = 1100
    try:
        scn.view_settings.view_transform = "Standard"
        scn.view_settings.look = "None"
    except (TypeError, ValueError):
        pass

    bpy.ops.mesh.primitive_plane_add(size=20.0, location=(0, 0, 0))
    floor = bpy.context.object
    floor.name = "Floor"
    mat = bpy.data.materials.new("FloorMat")
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (
        0.72, 0.74, 0.78, 1.0)
    floor.data.materials.append(mat)

    for name, loc, rot, size, energy in (
            ("Key", (-1.8, -2.4, 2.6), (math.radians(52), 0, math.radians(-36)), 3.0, 160),
            ("Fill", (2.6, -1.6, 1.5), (math.radians(76), 0, math.radians(58)), 3.5, 60),
            ("Rim", (0.9, 2.6, 2.2), (math.radians(128), 0, math.radians(196)), 2.5, 110)):
        bpy.ops.object.light_add(type="AREA", location=loc)
        lt = bpy.context.object
        lt.name = name
        lt.data.size = size
        lt.data.energy = energy
        lt.rotation_euler = rot

    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.55, 0.57, 0.62, 1.0)
    bg.inputs[1].default_value = 0.45
    scn.world = world

    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = 70
    cam = bpy.data.objects.new("Cam", cam_data)
    bpy.context.collection.objects.link(cam)
    scn.camera = cam
    return cam


def load(path):
    if path.lower().endswith(".obj"):
        bpy.ops.wm.obj_import(filepath=path)
    else:
        bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    return meshes


def bounds(meshes):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for ob in meshes:
        if ob.name == "Floor":
            continue
        for c in ob.bound_box:
            w = ob.matrix_world @ Vector(c)
            for i in range(3):
                lo[i] = min(lo[i], w[i])
                hi[i] = max(hi[i], w[i])
    return lo, hi


def normalise(meshes, target_h=1.8):
    """Imported meshes come in Y-up at wildly different scales. Re-orient to
    Z-up with feet on the ground and a known height so one camera rig works."""
    lo, hi = bounds(meshes)
    ext = hi - lo
    # up axis = longest extent
    up_axis = max(range(3), key=lambda i: ext[i])
    rot = None
    if up_axis == 1:
        rot = (Vector((0, 0, 0)),
               __import__("mathutils").Euler((math.radians(90), 0, 0)))
    elif up_axis == 0:
        rot = (Vector((0, 0, 0)),
               __import__("mathutils").Euler((0, math.radians(90), 0)))

    meshes = [o for o in meshes if o.name != "Floor"]
    if rot is not None:
        for ob in meshes:
            ob.rotation_euler = rot[1]
        bpy.context.view_layer.update()

    lo, hi = bounds(meshes)
    height = hi.z - lo.z
    if height < 1e-9:
        return meshes
    s = target_h / height
    cx = (lo.x + hi.x) * 0.5
    for ob in meshes:
        ob.scale = (s, s, s)
        ob.location = (ob.location.x * s, ob.location.y * s,
                       ob.location.z * s)
    bpy.context.view_layer.update()

    lo, hi = bounds(meshes)
    dx = (lo.x + hi.x) * 0.5
    dz = lo.z
    for ob in meshes:
        ob.location.x -= dx
        ob.location.z -= dz
    bpy.context.view_layer.update()
    return meshes


def render(name, path):
    purge()
    setup()
    meshes = load(path)
    if not meshes:
        print(f"[skip] {name}: nothing loaded")
        return
    meshes = normalise(meshes)

    cam = bpy.context.scene.camera
    cam.location = (0.0, -4.2, 1.10)
    d = Vector((0.0, 0.0, 0.92)) - cam.location
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

    verts = sum(len(o.data.vertices) for o in meshes)
    faces = sum(len(o.data.polygons) for o in meshes)
    out = os.path.join(OUT, f"{name}.png")
    bpy.context.scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print(f"[ok] {name}: verts={verts} faces={faces} -> {out}")


for name, path in CANDIDATES:
    if os.path.exists(path):
        try:
            render(name, path)
        except Exception as exc:          # keep going through the list
            print(f"[fail] {name}: {exc}")
    else:
        print(f"[missing] {name}: {path}")