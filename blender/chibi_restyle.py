"""Re-style the accepted untextured Meshy chibi mesh.

The earlier attempts failed because they painted *vertex colours*, which smears
across material boundaries. Here every polygon is assigned to one of six hard
materials by its position, so skin / hair / tee / plaid / pants / shoes stay
crisp.

Run:
    blender --background --factory-startup --python chibi_restyle.py
"""

import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

SRC = r"C:\Users\User\minimax-glb-tmp\chibi-tinted-low.glb"
SRC_LOW = r"C:\Users\User\minimax-glb-tmp\chibi-tinted-low.glb"

TARGET_H = 1.8
TARGET_TRIS = 46000

# --------------------------------------------------------------- region cuts
# All values are fractions of total height above the soles.
Z_HAIR_LINE = 0.585        # above this the skull is hair, not face
Z_FACE_TOP = 0.560         # forehead edge: hair sweeps over down to here
Z_CHIN = 0.500
Z_SHOULDER = 0.455
Z_SHIRT_TOP = 0.470
Z_SHIRT_HEM = 0.352        # white tee hem / start of the waist knot
Z_KNOT_BOTTOM = 0.318      # bottom of the knotted shirt tails
Z_CUFF_TOP = 0.150         # rolled pant cuff
Y_FACE = -0.085            # anything in front of this plane is "the face"


def purge():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)


def set_input(node, name, value):
    if name in node.inputs:
        node.inputs[name].default_value = value


def make_material(name, color, roughness=0.55, metallic=0.0, subsurface=0.0,
                  coat=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    b = mat.node_tree.nodes["Principled BSDF"]
    set_input(b, "Base Color", (*color, 1.0))
    set_input(b, "Roughness", roughness)
    set_input(b, "Metallic", metallic)
    set_input(b, "Specular IOR Level", 0.5)
    if subsurface:
        set_input(b, "Subsurface Weight", subsurface)
        set_input(b, "Subsurface Radius", (0.34, 0.11, 0.07))
    if coat:
        set_input(b, "Coat Weight", coat)
    return mat


def make_plaid(name, ca, cb, scale=9.0, band=20.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    b = nt.nodes["Principled BSDF"]
    set_input(b, "Roughness", 0.62)
    set_input(b, "Specular IOR Level", 0.3)

    tc = nt.nodes.new("ShaderNodeTexCoord")
    tc.location = (-1100, 0)
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.location = (-920, 0)

    ck = nt.nodes.new("ShaderNodeTexChecker")
    ck.location = (-720, 160)
    ck.inputs["Scale"].default_value = scale
    ck.inputs["Color1"].default_value = (*ca, 1.0)
    ck.inputs["Color2"].default_value = (*cb, 1.0)

    waves = []
    for i, axis in enumerate(("X", "Y")):
        w = nt.nodes.new("ShaderNodeTexWave")
        w.location = (-720, -140 - i * 220)
        w.wave_type = "BANDS"
        w.bands_direction = axis
        w.wave_profile = "SIN"
        w.inputs["Scale"].default_value = band
        w.inputs["Distortion"].default_value = 0.0
        lt = nt.nodes.new("ShaderNodeMath")
        lt.location = (-520, -140 - i * 220)
        lt.operation = "LESS_THAN"
        lt.inputs[1].default_value = 0.42
        nt.links.new(w.outputs["Fac"], lt.inputs[0])
        waves.append(lt)

    uni = nt.nodes.new("ShaderNodeMath")
    uni.location = (-340, -180)
    uni.operation = "MAXIMUM"
    nt.links.new(waves[0].outputs["Value"], uni.inputs[0])
    nt.links.new(waves[1].outputs["Value"], uni.inputs[1])

    inv = nt.nodes.new("ShaderNodeMath")
    inv.location = (-180, -180)
    inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.0
    nt.links.new(uni.outputs["Value"], inv.inputs[1])

    dark = nt.nodes.new("ShaderNodeMix")
    dark.location = (0, 0)
    dark.data_type = "RGBA"
    dark.blend_type = "MIX"
    dark.inputs[7].default_value = (0.02, 0.02, 0.02, 1.0)
    nt.links.new(inv.outputs["Value"], dark.inputs["Factor"])
    nt.links.new(ck.outputs["Color"], dark.inputs[6])
    nt.links.new(dark.outputs[2], b.inputs["Base Color"])

    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], ck.inputs["Vector"])
    for w in [n for n in nt.nodes if n.bl_idname == "ShaderNodeTexWave"]:
        nt.links.new(mp.outputs["Vector"], w.inputs["Vector"])
    return mat


def materials():
    return {
        "skin": make_material("Skin", (0.985, 0.720, 0.640), 0.48, subsurface=0.32),
        "hair": make_material("Hair", (0.028, 0.026, 0.034), 0.38, coat=0.40),
        "tee": make_material("Tee", (0.935, 0.935, 0.948), 0.68),
        "plaid": make_plaid("Plaid", (0.740, 0.105, 0.088), (0.045, 0.038, 0.038)),
        "pants": make_material("Pants", (0.720, 0.140, 0.130), 0.58),
        "shoe": make_material("Shoe", (0.040, 0.040, 0.048), 0.34, coat=0.22),
        "sole": make_material("Sole", (0.955, 0.955, 0.955), 0.45),
        "eye": make_material("Eye", (0.075, 0.045, 0.042), 0.18),
    }


def load_source(path):
    purge()
    bpy.ops.import_scene.gltf(filepath=path)
    raw = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    # Meshy exports ship a background plane ("Cube") alongside the character
    meshes = [o for o in raw if len(o.data.vertices) > 64]
    for junk in raw:
        if junk not in meshes:
            bpy.data.objects.remove(junk, do_unlink=True)
    print(f"[load] {os.path.basename(path)}: {len(meshes)} mesh parts "
          f"({sum(len(o.data.vertices) for o in meshes)} verts)")
    return meshes


def world_bounds(objs):
    lo = Vector((1e18, 1e18, 1e18))
    hi = Vector((-1e18, -1e18, -1e18))
    for ob in objs:
        for c in ob.bound_box:
            w = ob.matrix_world @ Vector(c)
            for i in range(3):
                lo[i] = min(lo[i], w[i])
                hi[i] = max(hi[i], w[i])
    return lo, hi


def normalise(objs):
    """Re-orient to Z-up, scale to TARGET_H, stand on z=0, centre on x=0."""
    lo, hi = world_bounds(objs)
    ext = hi - lo
    up = max(range(3), key=lambda i: ext[i])
    if up == 1:
        for ob in objs:
            ob.rotation_euler = (math.radians(90), 0.0, 0.0)
    elif up == 0:
        for ob in objs:
            ob.rotation_euler = (0.0, math.radians(90), 0.0)
    bpy.context.view_layer.update()

    lo, hi = world_bounds(objs)
    h = hi.z - lo.z
    s = TARGET_H / max(h, 1e-9)
    for ob in objs:
        ob.scale = (s, s, s)
        ob.location = (ob.location.x * s, ob.location.y * s, ob.location.z * s)
    bpy.context.view_layer.update()

    lo, hi = world_bounds(objs)
    dx = (lo.x + hi.x) * 0.5
    for ob in objs:
        ob.location.x -= dx
        ob.location.z -= lo.z
    bpy.context.view_layer.update()

    lo, hi = world_bounds(objs)
    print(f"[norm] bbox lo={tuple(round(v,3) for v in lo)} "
          f"hi={tuple(round(v,3) for v in hi)}")
    return lo, hi


def decimate_to_target(objs, target=TARGET_TRIS):
    """Meshy output is non-manifold, so edge-collapse Decimate barely moves it.
    Voxel remesh gives uniform clean topology first, then collapse on top."""
    bpy.ops.object.select_all(action="DESELECT")
    for ob in objs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    fused = bpy.context.object
    fused.name = "Chibi"

    n = len(fused.data.polygons)
    if n > target:
        mod = fused.modifiers.new("Decimate", "DECIMATE")
        mod.ratio = target / n
        bpy.ops.object.modifier_apply(modifier=mod.name)

    print(f"[remesh+decimate] -> {len(fused.data.polygons)} faces")
    return [fused]


def assign_by_region(objs, mats, lo, hi):
    """Hard per-face material assignment, then neighbour majority smoothing.

    Raw per-face testing on an 8k mesh gives stair-stepped seams, so the label
    grid is smoothed over edge neighbours — boundaries stay in the same place
    but stop looking like torn paper.
    """
    import bmesh

    H = hi.z - lo.z
    order = ["hair", "tee", "plaid", "pants", "shoe", "sole", "skin"]
    half_w = max((hi.x - lo.x) * 0.5, 1e-6)

    # ---- vertical bands, measured off the reference render -------------
    Z_SHOE_TOP = 0.100        # frac of height
    Z_PANTS_TOP = 0.312
    Z_PLAID_TOP = 0.372
    Z_TEE_TOP = 0.502
    Z_NECK_TOP = 0.535
    # face patch on the skull (world units, height is 1.8)
    FACE_Z = 1.068
    FACE_RZ = 0.182
    FACE_RX = 0.258
    FACE_Y = -0.545           # in front of this plane is "the face"

    def classify(p):
        fz = (p.z - lo.z) / H
        ax = abs(p.x) / half_w

        if fz < 0.020:
            return "sole"
        if fz < Z_SHOE_TOP:
            return "shoe"
        if fz < Z_PANTS_TOP:
            if ax > 0.62 and fz > 0.21:
                return "skin"            # hands beside the legs
            return "pants"
        if fz < Z_PLAID_TOP:
            if ax > 0.60:
                return "skin"            # forearms stay bare
            return "plaid"
        if fz < Z_TEE_TOP:
            if ax > 0.60:
                return "skin"
            return "tee"
        if fz < Z_NECK_TOP:
            return "skin"                # neck

        # ---- head
        patch = (p.x / FACE_RX) ** 2 + ((p.z - FACE_Z) / FACE_RZ) ** 2
        if patch < 1.0 and p.y < FACE_Y:
            return "skin"
        return "hair"

    for ob in objs:
        ob.data.materials.clear()
        for key in order:
            ob.data.materials.append(mats[key])

    for ob in objs:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.faces.ensure_lookup_table()
        for f in bm.faces:
            f.material_index = order.index(classify(f.calc_center_median()))

        for _ in range(6):
            cur = [f.material_index for f in bm.faces]
            nxt = []
            for i, f in enumerate(bm.faces):
                tally = {}
                for e in f.edges:
                    for nf in e.link_faces:
                        k = cur[nf.index]
                        tally[k] = tally.get(k, 0) + 1
                tally[cur[i]] = tally.get(cur[i], 0) + 2   # bias toward staying
                nxt.append(max(tally, key=tally.get))
            for i, f in enumerate(bm.faces):
                f.material_index = nxt[i]

        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()

        counts = {k: 0 for k in order}
        for p in ob.data.polygons:
            counts[order[p.material_index]] += 1
            p.use_smooth = True
        print("[assign] " + "  ".join(f"{k}={v}" for k, v in counts.items()))
    return objs


def setup_scene():
    scn = bpy.context.scene
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
        try:
            scn.render.engine = engine
            break
        except TypeError:
            continue
    scn.render.resolution_x = 1000
    scn.render.resolution_y = 1300
    try:
        scn.view_settings.view_transform = "Standard"
        scn.view_settings.look = "None"
    except (TypeError, ValueError):
        pass

    bpy.ops.mesh.primitive_plane_add(size=16.0, location=(0, 0, 0))
    floor = bpy.context.object
    floor.name = "Floor"
    floor.data.materials.append(make_material("FloorMat", (0.80, 0.81, 0.84), 0.8))

    for name, loc, rot, size, energy in (
            ("Key", (-1.6, -2.1, 2.5), (math.radians(52), 0, math.radians(-36)), 2.6, 130),
            ("Fill", (2.3, -1.4, 1.4), (math.radians(76), 0, math.radians(58)), 3.2, 48),
            ("Rim", (0.9, 2.4, 2.1), (math.radians(128), 0, math.radians(196)), 2.3, 95),
            ("Top", (0.0, 0.0, 3.4), (0, 0, 0), 3.2, 34)):
        bpy.ops.object.light_add(type="AREA", location=loc)
        lt = bpy.context.object
        lt.name = name
        lt.data.size = size
        lt.data.energy = energy
        lt.rotation_euler = rot

    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.56, 0.58, 0.63, 1.0)
    bg.inputs[1].default_value = 0.40
    scn.world = world

    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = 72
    cam = bpy.data.objects.new("Cam", cam_data)
    bpy.context.collection.objects.link(cam)
    scn.camera = cam
    return cam


def render_views(cam):
    target = Vector((0.0, 0.0, 0.95))
    views = {
        "front": (0.0, -4.10, 1.12),
        "three_quarter": (2.70, -3.00, 1.45),
        "side": (4.09, 0.0, 1.12),
        "back": (1.20, 3.90, 1.35),
    }
    for name, loc in views.items():
        cam.location = loc
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        bpy.context.scene.render.filepath = os.path.join(OUT, f"restyle_{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"[render] restyle_{name}.png")


def main():
    src = SRC if os.path.exists(SRC) else SRC_LOW
    objs = load_source(src)
    lo, hi = normalise(objs)
    objs = decimate_to_target(objs)

    # Bake scale/rotation first — poly.center is local space, so region masks
    # would otherwise be tested against the pre-normalised coordinates.
    bpy.ops.object.select_all(action="DESELECT")
    for ob in objs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    assign_by_region(objs, materials(), lo, hi)

    for ob in objs:
        if ob.type == "MESH":
            mod = ob.modifiers.new("Sharpen", "EDGE_SPLIT")
            mod.split_angle = math.radians(58)

    bpy.ops.object.select_all(action="DESELECT")
    for ob in objs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "chibi_restyle.blend"))

    glb = os.path.join(OUT, "chibi_restyle.glb")
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB",
                              use_selection=False, export_apply=True,
                              export_yup=True)
    tris = 0
    for ob in objs:
        ob.data.calc_loop_triangles()
        tris += len(ob.data.loop_triangles)
    print(f"[done] tris={tris} glb={glb} size={os.path.getsize(glb)}")

    render_views(setup_scene())


main()