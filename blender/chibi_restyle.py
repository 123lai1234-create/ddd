"""Re-style the accepted untextured Meshy chibi mesh.

The earlier attempts failed because they painted *vertex colours*, which smears
across material boundaries. Every polygon is assigned to one of six hard
materials by its position, so skin / hair / tee / plaid / pants / shoes stay
crisp.

The face is the exception. Per-face assignment cannot draw an eye on this grid
- the border snaps to the nearest triangle edge and every feature comes out as
sawteeth or a stain - so the face is painted into a texture by face_texture.py
and the skull simply wears it.

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
import face_texture
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

_DEFAULT_SRC = r"C:\Users\User\minimax-glb-tmp\chibi-tinted-low.glb"
# Override with CHIBI_SRC to point at a different base mesh.
#
# Worth knowing before you re-export: the current base has NO texture at all
# (0 images, no UVs, only POSITION/NORMAL and one flat baseColorFactor), which
# is the only reason this script paints the face by hand. A Meshy export made
# with PBR textures enabled carries the reference artwork in a baseColorTexture
# and is already closer to the artwork than anything painted here - parse the
# GLB's JSON chunk and check images/baseColorTexture before running this.
SRC = os.environ.get("CHIBI_SRC", _DEFAULT_SRC)
SRC_LOW = _DEFAULT_SRC

# When set, the head texture is the reference photo projected onto the skull
# instead of hand-painted features - the reference already contains the artwork,
# so its pixels beat anything drawn from scratch. Set CHIBI_FACE="" to go back
# to the painted version.
REF_FACE = os.environ.get(
    "CHIBI_FACE", os.path.join(HERE, "ref", "chibi-ref-meshy.png"))

TARGET_H = 1.8
TARGET_TRIS = 48000
SUBDIV = 2

# Slot order baked into every polygon; index 7 is the painted face.
ORDER = ["hair", "tee", "plaid", "pants", "shoe", "sole", "skin", "face"]
Z_NECK_FRAC = 0.556        # frac of height where the neck ends and the head starts

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
                  coat=0.0, emission=0.0):
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
    if emission:
        set_input(b, "Emission Color", (*color, 1.0))
        set_input(b, "Emission Strength", emission)
    return mat


def make_plaid(name, ca, cb, scale=17.0, line=17.0, line_width=0.13):
    """Buffalo check driven by a coarse checker plus thin cross-lines.

    Earlier versions stacked SIN wave masks whose factors averaged out to a
    single flat red across the waist — the pattern has to come from the
    checker cells themselves, with the waves only adding thin dark seams.
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    b = nt.nodes["Principled BSDF"]
    set_input(b, "Roughness", 0.66)
    set_input(b, "Specular IOR Level", 0.28)

    tc = nt.nodes.new("ShaderNodeTexCoord")
    tc.location = (-900, 0)

    ck = nt.nodes.new("ShaderNodeTexChecker")
    ck.location = (-600, 140)
    ck.inputs["Scale"].default_value = scale
    ck.inputs["Color1"].default_value = (*ca, 1.0)
    ck.inputs["Color2"].default_value = (*cb, 1.0)

    masks = []
    for i, axis in enumerate(("X", "Z")):
        w = nt.nodes.new("ShaderNodeTexWave")
        w.location = (-600, -160 - i * 190)
        w.wave_type = "BANDS"
        w.bands_direction = axis
        w.wave_profile = "SAW"
        w.inputs["Scale"].default_value = line
        w.inputs["Distortion"].default_value = 0.0
        lt = nt.nodes.new("ShaderNodeMath")
        lt.location = (-410, -160 - i * 190)
        lt.operation = "LESS_THAN"
        lt.inputs[1].default_value = line_width
        nt.links.new(w.outputs["Fac"], lt.inputs[0])
        masks.append(lt)

    uni = nt.nodes.new("ShaderNodeMath")
    uni.location = (-230, -200)
    uni.operation = "MAXIMUM"
    nt.links.new(masks[0].outputs["Value"], uni.inputs[0])
    nt.links.new(masks[1].outputs["Value"], uni.inputs[1])

    dark = nt.nodes.new("ShaderNodeMix")
    dark.location = (0, 0)
    dark.data_type = "RGBA"
    dark.blend_type = "MIX"
    dark.inputs[7].default_value = (0.012, 0.010, 0.010, 1.0)
    nt.links.new(uni.outputs["Value"], dark.inputs["Factor"])
    nt.links.new(ck.outputs["Color"], dark.inputs[6])
    nt.links.new(dark.outputs[2], b.inputs["Base Color"])

    nt.links.new(tc.outputs["Object"], ck.inputs["Vector"])
    for w in [n for n in nt.nodes if n.bl_idname == "ShaderNodeTexWave"]:
        nt.links.new(tc.outputs["Object"], w.inputs["Vector"])
    return mat


def materials():
    return {
        "skin": make_material("Skin", (0.975, 0.660, 0.575), 0.50, subsurface=0.34),
        "hair": make_material("Hair", (0.028, 0.026, 0.034), 0.38, coat=0.40),
        "tee": make_material("Tee", (0.935, 0.935, 0.948), 0.68),
        "plaid": make_plaid("Plaid", (0.560, 0.062, 0.055), (0.030, 0.026, 0.026)),
        "pants": make_material("Pants", (0.615, 0.092, 0.082), 0.58),
        "shoe": make_material("Shoe", (0.040, 0.040, 0.048), 0.34, coat=0.22),
        "sole": make_material("Sole", (0.955, 0.955, 0.955), 0.45),
        # "face" is built later by face_texture.bake(), it reuses Skin's shading
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
    """Densify then thin back down to a web-friendly budget.

    Voxel/octree remesh either OOMs or empties this Meshy mesh (bad normals),
    and edge-collapse Decimate barely moves non-manifold input. Linear SIMPLE
    subdivision buys face density without moving the surface, which is what
    stops material borders from looking like sawteeth.
    """
    bpy.ops.object.select_all(action="DESELECT")
    for ob in objs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    fused = bpy.context.object
    fused.name = "Chibi"

    sub = fused.modifiers.new("Subdiv", "SUBSURF")
    sub.subdivision_type = "SIMPLE"
    sub.levels = SUBDIV
    sub.render_levels = SUBDIV
    bpy.ops.object.modifier_apply(modifier=sub.name)

    n = len(fused.data.polygons)
    if n > target:
        mod = fused.modifiers.new("Decimate", "DECIMATE")
        mod.ratio = target / n
        bpy.ops.object.modifier_apply(modifier=mod.name)

    print(f"[subdiv+decimate] {n} -> {len(fused.data.polygons)} faces")
    return [fused]


def smooth_reconstruction_spikes(objs, lo, hi):
    """Clean up the teeth Meshy leaves at clothing hems.

    Two passes, because the two failures are different:
    * sawtooth teeth that poke below the hem -> Laplacian pull rounds them
    * ragged dips that the reconstruction cuts into the hem -> clamp those
      vertices back up to the hem plane, which yields a flat clean edge
    """
    import bmesh

    H = hi.z - lo.z

    def z_at(frac):
        return lo.z + frac * H

    # (rounding band, clamping dips back up to this height)
    bands = ((0.330, 0.420, 0.382),     # tee hem
             (0.285, 0.370, 0.330),     # plaid / pant edge
             (0.100, 0.175, 0.120),     # rolled cuff
             (0.500, 0.590, 0.522))     # collar

    for ob in objs:
        bm = bmesh.new()
        bm.from_mesh(ob.data)

        for _ in range(6):
            # overlapping bands would feed the same vertex to smooth_vert twice
            hot = set()
            for a, b, _z in bands:
                za, zb = z_at(a), z_at(b)
                hot.update(v for v in bm.verts if za <= v.co.z <= zb)
            if hot:
                bmesh.ops.smooth_vert(bm, verts=list(hot), factor=0.55,
                                      use_axis_x=True, use_axis_y=True,
                                      use_axis_z=True)

        # pull the ragged dips back up onto the hem plane
        for a, b, target in bands:
            za, zb, zt = z_at(a), z_at(b), z_at(target)
            for v in bm.verts:
                if za <= v.co.z < zt:
                    v.co.z = zt

        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
    print("[smooth] hems flattened, spikes rounded")


def resculpt_proportions(objs, lo, hi,
                          hair_k=0.80, hair_from=0.60, hair_to=0.70,
                          hair_r0=0.20,
                          leg_from=0.10, leg_to=0.32, leg_k=0.93,
                          shoe_from=0.10, shoe_k=0.90):
    """Pull the silhouette in so it stops reading as a fuzzy helmet on a stump.

    Meshy ships the character as ONE fused mesh (decimate_to_target joins
    every part), so hair / body / limbs cannot be scaled as separate objects.
    The scalp is not a separate shell either - shrinking the whole upper head
    would shrink the skull with it and leave the face tiny inside a big head.

    Instead each move is radius-limited and height-blended:

    * hair: vertices above `hair_from` get pulled toward the head axis, but
      only the part that sticks out past `hair_r0`. The skull (inside r0)
      is untouched, so the face keeps its size while the spikes come in.
    * legs / shoes: narrow the lower body, which is the other thing that
      makes the proportions read as "oversized chibi".

    `hair_k` is the factor applied to the protruding radius, so 0.80 removes
    about a fifth of the volume without visibly squashing the skull.
    """
    import bmesh

    H = hi.z - lo.z
    z_hair_from = lo.z + hair_from * H
    z_hair_to = lo.z + hair_to * H
    z_leg_from = lo.z + leg_from * H
    z_leg_to = lo.z + leg_to * H
    z_shoe = lo.z + shoe_from * H

    # head axis: the character is centred on x=0, and the skull sits slightly
    # forward of the body centre.
    cx, cy = 0.0, -0.05

    moved = {"hair": 0, "leg": 0, "shoe": 0}
    for ob in objs:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        for v in bm.verts:
            co = v.co

            # --- hair: shrink only what protrudes past r0, faded in by height
            if co.z >= z_hair_from:
                t = min((co.z - z_hair_from) / max(z_hair_to - z_hair_from, 1e-6), 1.0)
                k = 1.0 + (hair_k - 1.0) * t
                dx, dy = co.x - cx, co.y - cy
                r = math.hypot(dx, dy)
                if r > hair_r0:
                    r2 = hair_r0 + (r - hair_r0) * k
                    s = r2 / r
                    co.x = cx + dx * s
                    co.y = cy + dy * s
                    moved["hair"] += 1

            # --- legs
            if z_leg_from <= co.z <= z_leg_to:
                co.x *= leg_k
                moved["leg"] += 1

            # --- shoes (below the cuff they flare out)
            if co.z <= z_shoe:
                co.x *= shoe_k
                moved["shoe"] += 1

        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()

    print(f"[proportions] hair verts={moved['hair']} leg={moved['leg']} "
          f"shoe={moved['shoe']} (hair_k={hair_k} leg_k={leg_k} shoe_k={shoe_k})")


def clear_face_fringe(objs, lo, hi, mats, z_top=0.640, z_bot=0.500, y_face=Y_FACE,
                      z_sl=0.610, z_sh=0.690, y_sb_lo=-0.33, y_sb_hi=-0.15):
    """Delete the flat shards of fringe that hang in front of the face.

    Meshy reconstructs the bangs as thin sheets that dangle across the eyes and
    nose. Moving their vertices does not help - pulling them back or lifting
    them just turns a few slabs into a dense curtain over the face (tried, it
    made the model strictly worse).

    They are separate sheets floating in front of the skull, and the painted
    face already sits on the skull behind them. So the fix is to delete the
    hair-material polygons that are in front of the face plane within the
    fringe height band, which uncovers the painted face.

    Only hair-material polygons are touched: the face polygons live at y >
    y_face, so the painted features are never candidates in the first place.
    """
    import bmesh

    hm = mats.get("hair")
    hair_names = {hm.name} if hm is not None else {
        m.name for m in mats.values() if m and m.name.lower().startswith("hair")
    }
    H = hi.z - lo.z
    z_hi = lo.z + z_top * H
    z_lo = lo.z + z_bot * H
    # z_sl / z_sh are FRACTIONS of the height - they must be converted to
    # absolute z before they can be compared against a vertex coordinate.
    z_sl_abs = lo.z + z_sl * H
    z_sh_abs = lo.z + z_sh * H

    removed = 0
    for ob in objs:
        me = ob.data
        slot_names = [s.material.name if s.material else "" for s in ob.material_slots]
        hair_slots = {i for i, n in enumerate(slot_names) if n in hair_names}
        if not hair_slots:
            continue

        bm = bmesh.new()
        bm.from_mesh(me)
        bm.normal_update()
        doomed = []
        for f in bm.faces:
            if f.material_index not in hair_slots:
                continue
            c = f.calc_center_median()
            # (a) sheets hanging in front of the face
            if z_lo <= c.z <= z_hi and c.y < y_face:
                doomed.append(f)
                continue
            # (b) the flat slabs standing beside the cheeks - the "headphone"
            # blocks. They sit much less far forward than the fringe over the
            # forehead (measured: slabs at y ~ -0.24, fringe at y ~ -0.38 and
            # beyond), so a Y window separates the two cleanly.
            if (z_sl_abs <= c.z <= z_sh_abs and abs(c.x) > 0.22
                    and y_sb_lo < c.y < y_sb_hi):
                doomed.append(f)
        if doomed:
            bmesh.ops.delete(bm, geom=doomed, context="FACES")
            removed += len(doomed)
        bm.to_mesh(me)
        bm.free()
        me.update()

    print(f"[fringe] removed {removed} hair polygons "
          f"(front band z {z_lo:.3f}..{z_hi:.3f} y<{y_face}; "
          f"side plates z {z_sl_abs:.3f}..{z_sh_abs:.3f})")


def soften_cloth_edges(objs, lo, hi,
                        hem=0.352, shoulder=0.455, band=0.030,
                        rounds=5, factor=0.22):
    """Round the torn edges of the tee at the hem and the shoulders.

    Same problem as the hairline: Meshy rebuilds the cloth boundary as a row
    of big triangles, and a hard material border on a ragged edge reads as
    shredded fabric. Smoothing those vertices rounds the edge without
    changing the silhouette the way deleting faces would.
    """
    import bmesh

    H = hi.z - lo.z
    bands = [(lo.z + (hem - band) * H, lo.z + (hem + band) * H),
             (lo.z + (shoulder - band) * H, lo.z + (shoulder + band) * H)]

    for ob in objs:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        for _ in range(rounds):
            hot = set()
            for e in bm.edges:
                zm = (e.verts[0].co.z + e.verts[1].co.z) * 0.5
                if any(za <= zm <= zb for za, zb in bands):
                    hot.update(e.verts)
            if hot:
                bmesh.ops.smooth_vert(bm, verts=list(hot), factor=factor,
                                      use_axis_x=True, use_axis_y=True,
                                      use_axis_z=True)
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
    print(f"[cloth] hem & shoulder edges rounded "
          f"(z frac {hem}+-{band}, {shoulder}+-{band})")


def refine_upper_head(objs, lo, hi, levels=1):
    """Double the grid over the face and fringe.

    Eyes and mouth are painted onto polygons, so they can only look sharp if
    the grid resolves them. Only the front of the head needs that density - the
    body and the back of the hair are smooth large surfaces already. New
    vertices land exactly on the shared edges, so the seam is watertight.
    """
    import bmesh

    x0 = 0.0
    y0 = -0.45
    r2 = 0.34 ** 2
    zlo, zhi = 0.98, 1.34

    def zone(v):
        return (zlo <= v.co.z <= zhi
                and (v.co.x - x0) ** 2 + (v.co.y - y0) ** 2 <= r2)

    for ob in objs:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        before = len(bm.faces)
        for _ in range(levels):
            sel = [e for e in bm.edges if zone(e.verts[0]) or zone(e.verts[1])]
            if not sel:
                break
            bmesh.ops.subdivide_edges(bm, edges=sel, cuts=1, use_grid_fill=True)
        after = len(bm.faces)
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
        print(f"[refine] {ob.name}: {before} -> {after} faces")


def soften_hairline(objs, lo, hi):
    """Round the ragged fringe where the bangs meet the forehead.

    Meshy reconstructs that boundary as a row of big triangles, and a hard
    material border on a ragged edge reads as sawteeth at any distance. Much
    gentler than the hem pass, because the forehead curve has to survive.
    """
    import bmesh

    H = hi.z - lo.z
    za, zb = lo.z + 0.628 * H, lo.z + 0.702 * H
    for ob in objs:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        for _ in range(5):
            hot = set()
            for e in bm.edges:
                if za <= (e.verts[0].co.z + e.verts[1].co.z) * 0.5 <= zb:
                    hot.update(e.verts)
            if hot:
                bmesh.ops.smooth_vert(bm, verts=list(hot), factor=0.22,
                                      use_axis_x=True, use_axis_y=True,
                                      use_axis_z=True)
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
    print(f"[hairline] fringe rounded in z {za:.3f}..{zb:.3f}")


def raise_fringe(objs, lo, hi, mats, shrink=0.30, at=0.735, reach=0.17):
    """Shorten the bangs so the brows clear them.

    The reference shows both brows above the lash line. Here the fringe hangs
    almost to the eyes - not a texture problem, the hair volume itself reaches
    too low. Hair is a separate shell resting on the skull, so it can be moved:
    every hair vertex in the forehead band is scaled toward the hairline, which
    shortens the spikes without flattening them, plus a small forward push so
    they stay in front of the forehead instead of sinking into it.

    Two things this must not do, both hit on the first attempt:
    * select by position only. normal.y <= -0.22 matches the entire front of the
      body - 28316 of 51568 verts moved, and the mesh exploded. Run after
      assign_by_region and test the material instead.
    * translate. The bangs fan out from the crown, so a flat offset lifts the
      outer spikes into the skull while the centre one barely moves. Scaling
      toward the hairline keeps the fan intact.
    """
    import bmesh

    H = hi.z - lo.z
    top = lo.z + at * H
    floor = top - reach * H
    hair = ORDER.index("hair")

    for ob in objs:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        moved = 0
        for v in bm.verts:
            if not (floor <= v.co.z < top):
                continue
            faces = v.link_faces
            if not faces or any(f.material_index != hair for f in faces):
                continue          # shared with skin -> part of the skull, leave it
            drop = top - v.co.z
            v.co.z = top - drop * shrink
            v.co.y -= drop * shrink * 0.45       # stay in front of the brow
            moved += 1
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
        print(f"[fringe] {ob.name}: {moved} hair verts lifted toward z={top:.3f}")
    print(f"[fringe] bangs shrunk to {shrink:.0%} in z {floor:.3f}..{top:.3f}")


def assign_by_region(objs, mats, lo, hi):
    """Hard per-face material assignment, then neighbour majority smoothing.

    Raw per-face testing on an 8k mesh gives stair-stepped seams, so the label
    grid is smoothed over edge neighbours — boundaries stay in the same place
    but stop looking like torn paper.
    """
    import bmesh

    H = hi.z - lo.z
    half_w = max((hi.x - lo.x) * 0.5, 1e-6)

    # ---- vertical bands, measured off the reference render -------------
    Z_SHOE_TOP = 0.120        # frac of height
    Z_PANTS_TOP = 0.330
    Z_PLAID_TOP = 0.400
    Z_TEE_TOP = 0.522
    Z_NECK_TOP = Z_NECK_FRAC
    # face patch on the skull (world units, height is 1.8)
    # hairline as a fraction of total height, front vs. temple
    HAIRLINE_FRONT = 0.712
    HAIRLINE_SIDE = 0.655

    # Bare arms. x alone cannot tell an arm from the hip - they touch, and the
    # vertex profile through the band is continuous. But the arms hang clear
    # of the leg silhouette, so a threshold well under the leg does separate
    # them. The old guess was ax > 0.80, which never fired at all: max ax
    # anywhere in z/H 0.19..0.46 is 0.77, so every forearm came out red.
    ARM_AX = 0.62
    ARM_SLEEVE_END = 0.415    # the tee is short-sleeved: bare below the elbow

    def classify(p, n=None):
        fz = (p.z - lo.z) / H
        ax = abs(p.x) / half_w

        if fz < 0.020:
            return "sole"
        if fz < Z_SHOE_TOP:
            return "shoe"

        if 0.170 < fz < Z_TEE_TOP and ax > ARM_AX:
            return "skin" if fz < ARM_SLEEVE_END else "tee"

        if fz < Z_PANTS_TOP:
            return "pants"
        if fz < Z_PLAID_TOP:
            return "plaid"
        if fz < Z_TEE_TOP:
            return "tee"
        if fz < Z_NECK_TOP:
            return "skin"                # neck

        # ---- head
        # A flat ellipse mask reads as a mask: its edge cuts across the hair
        # volume and leaves an obvious oval. Instead decide from the surface
        # normal plus an azimuth-dependent hairline, so skin is whatever faces
        # forward below the fringe and hair is everything else.
        if n is None or n.y < -0.42:
            az = min(abs(math.atan2(p.x, -p.y)) / (math.pi * 0.5), 1.0)
            hairline = lo.z + H * (HAIRLINE_FRONT
                                   - (HAIRLINE_FRONT - HAIRLINE_SIDE) * az * az)
            if p.z < hairline:
                return "skin"
        return "hair"

    for ob in objs:
        ob.data.materials.clear()
        for key in ORDER:
            if key in mats:          # "face" is baked later, it keeps its slot
                ob.data.materials.append(mats[key])

    for ob in objs:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.faces.ensure_lookup_table()

        # Classify on face centres, then a couple of majority passes. Face
        # centres give the tightest seam; per-vertex classification offsets it
        # by a full ring and produces alternating single-face spikes, and many
        # smoothing passes fracture the boundary into torn paper.
        for f in bm.faces:
            f.material_index = ORDER.index(classify(f.calc_center_median(), f.normal))

        for _ in range(2):
            cur = [f.material_index for f in bm.faces]
            nxt = []
            for i, f in enumerate(bm.faces):
                tally = {}
                for e in f.edges:
                    for nf in e.link_faces:
                        tally[cur[nf.index]] = tally.get(cur[nf.index], 0) + 1
                tally[cur[i]] = tally.get(cur[i], 0) + 2
                nxt.append(max(tally, key=tally.get))
            for i, f in enumerate(bm.faces):
                f.material_index = nxt[i]

        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()

        counts = {k: 0 for k in ORDER}
        for p in ob.data.polygons:
            counts[ORDER[p.material_index]] += 1
            p.use_smooth = True
        print("[assign] " + "  ".join(f"{k}={v}" for k, v in counts.items()))
    return objs


def face_hit(objs, x, z):
    """Front-most surface point and outward normal at (x, z), via ray cast."""
    origin = Vector((x, -3.0, z))
    direction = Vector((0.0, 1.0, 0.0))
    dg = bpy.context.evaluated_depsgraph_get()
    best = None
    for ob in objs:
        ok, loc, nor, _i = ob.ray_cast(origin, direction, distance=6.0,
                                       depsgraph=dg)
        if ok and (best is None or loc.y < best[0].y):
            best = (loc, nor)
    return best


def face_metrics(objs, lo, hi):
    """Head frame plus feature placement, measured off the painted skin patch.

    Only front-facing skin counts. The earlier version measured the whole patch,
    which also covers the ears and the under-jaw, so the half width came out a
    third too wide and every feature drifted out toward the sides of the head.
    """
    z_neck = lo.z + Z_NECK_FRAC * (hi.z - lo.z)
    idx = ORDER.index("skin")
    xs, zs, probe = [], [], []
    for ob in objs:
        for p in ob.data.polygons:
            if p.material_index != idx or p.center.z <= z_neck:
                continue
            if p.normal.y > -0.35:
                continue
            xs.append(p.center.x)
            zs.append(p.center.z)
            probe.append((p.center.x, p.center.y, p.center.z))
    if not xs:
        raise RuntimeError("no front-facing skin above the neck")

    x_lo, x_hi = min(xs), max(xs)
    z_lo, z_hi = min(zs), max(zs)
    cx = (x_lo + x_hi) * 0.5
    fw = (x_hi - x_lo) * 0.5
    span = z_hi - z_lo

    # Head radius straight off the mesh. Two sample points from one cross
    # section pin the sphere down exactly: for a sphere at (cx, cy) the front
    # point sits at cy - R, and any other surface point is exactly R from the
    # axis, which gives dx^2 + dy^2 = 2 dy R. Ray casting for it was worse - the
    # ray at the face edge runs into the ear and reports a head a fifth too
    # round, which is what pushed the eyes out over the cheeks.
    z_mid = (z_lo + z_hi) * 0.5
    band = [q for q in probe if abs(q[2] - z_mid) < span * 0.12] or probe
    front = min(band, key=lambda q: q[1])
    outer = max(band, key=lambda q: abs(q[0] - cx))
    dx, dy = outer[0] - front[0], outer[1] - front[1]
    R = (dx * dx + dy * dy) / (2.0 * dy) if dy > 1e-4 else fw * 1.15
    R = min(max(R, fw * 0.95), fw * 1.6)
    cy = front[1] + R

    def az_at(x, z):
        h = face_hit(objs, x, z)
        if h is None:
            return math.atan2(x - cx, R)
        return math.atan2(h[0].x - cx, -(h[0].y - cy))

    eye_z = z_lo + span * 0.655
    az_e = abs(az_at(cx + fw * 0.500, eye_z))
    # the cheek is curved, so an arc on it renders narrower than it measures
    corr = 1.0 / max(math.cos(az_e), 0.55)

    m = {
        "cx": cx, "cy": cy, "radius": R,
        "z0": z_lo, "z1": z_hi,
        "eye_z": eye_z, "eye_az": az_e,
        "eye_hw": fw * 0.255 * corr,
        "eye_hh": span * 0.190,
        "mouth_z": z_lo + span * 0.310,
        "mouth_hw": fw * 0.150,
        "nose_z": z_lo + span * 0.42,
    }
    print(f"[face] fw={fw:.4f} R={R:.4f} span={span:.4f} "
          f"z={z_lo:.3f}..{z_hi:.3f} eye_z={eye_z:.3f} "
          f"eye_az={math.degrees(az_e):.1f}deg corr={corr:.2f}")
    return m


def flatten_hem_edges(objs, lo, hi, mats):
    """Snap each garment hem onto one flat plane.

    Material assignment is by height, so a hem that dips and rises turns the
    border into a sawtooth - and the white shirt's teeth hang down in front of
    the plaid sash, which is the most obvious artefact in the whole model.
    Rendering the same view with every polygon forced to a single material
    showed the teeth were real geometry, not a shading artefact, so they have to
    be pulled up rather than smoothed.

    Runs after assign_by_region so the material label says which garment each
    vertex belongs to; the plane is the height the band's own faces sit at, so
    nothing moves that was already flat.
    """
    import bmesh

    H = hi.z - lo.z
    # (material, plane as a fraction of height, how far below to pull from)
    bands = (("tee", 0.400, 0.300),
             ("plaid", 0.330, 0.245),
             ("pants", 0.120, 0.080))

    for ob in objs:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.faces.ensure_lookup_table()
        bm.verts.ensure_lookup_table()

        for key, plane_frac, floor_frac in bands:
            slot = ORDER.index(key)
            plane = lo.z + plane_frac * H
            floor = lo.z + floor_frac * H
            faces = [f for f in bm.faces if f.material_index == slot]
            if not faces:
                continue
            moved = 0
            for f in faces:
                for v in f.verts:
                    if floor <= v.co.z < plane:
                        v.co.z = plane
                        moved += 1
            if moved:
                print(f"[hem] {ob.name}: {key} pulled {moved} verts up to "
                      f"z={plane:.3f}")
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()


def paint_face(objs, mats, lo, hi):
    """Bake the face texture, then hand the skull its material and UVs."""
    m = face_metrics(objs, lo, hi)
    mats["face"] = face_texture.bake(m, mats["skin"], OUT, REF_FACE)
    z_neck = lo.z + Z_NECK_FRAC * (hi.z - lo.z)
    for ob in objs:
        ob.data.materials.append(mats["face"])
    face_texture.apply(objs, m, mats["face"], len(ORDER) - 1, z_neck,
                       ORDER.index("skin"))
    return m


def relax_head_labels(objs, lo, hi, iterations=6, bias=6,
                      frac_lo=0.545, frac_hi=0.80):
    """Smooth material labels over the skull.

    With the features moved into a texture there is nothing left here to erode,
    so this pass has one job: clean up the hairline. Meshy rebuilds the fringe
    as a row of big triangles, and a hard material border on a ragged edge reads
    as sawteeth at any distance. The body seams sit outside the band so their
    garment borders stay where they are.
    """
    import bmesh

    z_lo = lo.z + frac_lo * (hi.z - lo.z)
    z_hi = lo.z + frac_hi * (hi.z - lo.z)

    for ob in objs:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.faces.ensure_lookup_table()

        hot = {f.index for f in bm.faces if z_lo <= f.calc_center_median().z <= z_hi}
        if not hot:
            bm.free()
            continue

        for _ in range(iterations):
            cur = [f.material_index for f in bm.faces]
            nxt = list(cur)
            for f in bm.faces:
                if f.index not in hot:
                    continue
                tally = {}
                for e in f.edges:
                    for nf in e.link_faces:
                        k = cur[nf.index]
                        tally[k] = tally.get(k, 0) + 1
                tally[cur[f.index]] = tally.get(cur[f.index], 0) + bias
                nxt[f.index] = max(tally, key=tally.get)
            for f in bm.faces:
                f.material_index = nxt[f.index]

        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
    print(f"[relax] head labels smoothed in z {z_lo:.3f}..{z_hi:.3f}")


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
        scn.view_settings.exposure = -0.45
    except (TypeError, ValueError):
        pass

    bpy.ops.mesh.primitive_plane_add(size=16.0, location=(0, 0, 0))
    floor = bpy.context.object
    floor.name = "Floor"
    floor.data.materials.append(make_material("FloorMat", (0.80, 0.81, 0.84), 0.8))

    for name, loc, rot, size, energy in (
            ("Key", (-1.6, -2.1, 2.5), (math.radians(52), 0, math.radians(-36)), 2.6, 130),
            ("Fill", (2.3, -1.4, 1.4), (math.radians(76), 0, math.radians(58)), 3.2, 62),
            ("Rim", (0.9, 2.4, 2.1), (math.radians(128), 0, math.radians(196)), 2.3, 95),
            ("Top", (0.0, 0.0, 3.4), (0, 0, 0), 3.2, 34),
            ("Face", (0.0, -2.2, 1.35), (math.radians(90), 0, 0), 1.6, 12)):
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
    bg.inputs[1].default_value = 0.34
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

    # head close-up, the only way to actually judge the face detail
    cam.data.lens = 85
    head = Vector((0.0, -0.25, 1.15))
    cam.location = (0.0, -2.62, 1.15)
    cam.rotation_euler = (head - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.render.filepath = os.path.join(OUT, "restyle_head.png")
    bpy.ops.render.render(write_still=True)
    print("[render] restyle_head.png")


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

    resculpt_proportions(objs, lo, hi)
    refine_upper_head(objs, lo, hi)
    smooth_reconstruction_spikes(objs, lo, hi)
    soften_hairline(objs, lo, hi)
    soften_cloth_edges(objs, lo, hi)
    mats = materials()
    assign_by_region(objs, mats, lo, hi)
    flatten_hem_edges(objs, lo, hi, mats)
    # after assign_by_region so the hair material is actually on those shards
    clear_face_fringe(objs, lo, hi, mats)
    raise_fringe(objs, lo, hi, mats)
    relax_head_labels(objs, lo, hi)
    paint_face(objs, mats, lo, hi)

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
    for ob in bpy.data.objects:
        if ob.type == "MESH":
            ob.data.calc_loop_triangles()
            tris += len(ob.data.loop_triangles)
    print(f"[done] tris={tris} glb={glb} size={os.path.getsize(glb)}")

    render_views(setup_scene())


main()