"""Post-process the restyled chibi without touching chibi_restyle.py.

chibi_restyle.py is the build pipeline and another session is editing it, so
this file deliberately does NOT import it and does NOT re-run the pipeline.
It loads the exported GLB, fixes the artefacts that survive the pipeline, and
writes a new GLB. Iteration cost is seconds instead of minutes.

What it fixes (all three show up in the live page, not just in Blender):

1. Garment hems. Materials are assigned by height, so every hem is a ragged
   sawtooth - the white tee's teeth hang down over the plaid sash. The fix is
   a clean cut: re-label the faces in the seam band by height, then pull the
   geometry that dips below the plane up onto it.

2. Shards beside the cheeks. Meshy rebuilds the reference's headphones as flat
   pale slabs floating at the sides of the head. They are tee/sole coloured
   (white-blue) against a skin coloured face, so they read as debris.

3. The fringe. It hangs down to the eyes as a row of teeth. Lifting it toward
   the hairline shortens the spikes instead of flattening them.

Run:
    blender --background --factory-startup --python chibi_polish.py
"""

import bpy
import bmesh
import math
import os
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")

# Work on the .blend, not the .glb. glTF has no object-space texture
# coordinates, so a GLB -> Blender -> GLB round trip silently flattens the
# plaid sash's checker shader into a single flat colour and the waist loses
# its tartan entirely. The .blend keeps the node graph intact.
_SRC_BLEND = os.path.join(OUT, "chibi_restyle_snapshot.blend")
_SRC_GLB = os.path.join(OUT, "chibi_restyle.glb")
SRC = os.environ.get(
    "CHIBI_POLISH_SRC",
    _SRC_BLEND if os.path.exists(_SRC_BLEND) else _SRC_GLB)
DST = os.environ.get("CHIBI_POLISH_DST", os.path.join(OUT, "chibi_polish.glb"))

# Seam planes, as a fraction of total height. These match the garment bands
# the pipeline assigns by height (tee / plaid / pants / shoe / neck).
#
# "above" is the garment that sits ON TOP of the seam and "below" the one that
# hangs under it. Only the above garment's own hem is flattened - the below
# garment is a body of cloth with real height, so flattening it would erase it.
SEAMS = (
    ("tee", "plaid", 0.400, 0.050),
    ("plaid", "pants", 0.330, 0.045),
    ("pants", "shoe", 0.120, 0.035),
)

# The fringe. Lifting its vertices was tried and backfired: pulling the tips
# toward the hairline packs the spikes closer together, so the fringe turns
# into a dense metal-comb curtain. Cutting the tips off instead removes the
# teeth that were covering the eyes.
FRINGE_Y = -0.32       # only hair this far forward is fringe
FRINGE_CUT = 0.695     # keep the fringe above this fraction of the height
                        # (the brows sit ~1.20, the eyes ~1.15, of a 1.8 model)

CHEEK_LO = 0.555       # cheek/ear height band
CHEEK_HI = 0.720
CHEEK_X = 0.150        # beyond this half-width at cheek height is debris
CHEEK_Y = 0.040        # only debris in front of / beside the head counts

HAIR_FROM = 0.600      # hair above this height is part of the helmet
HAIR_R0 = 0.205        # radius of the skull the hair sits on
HAIR_K = 0.93          # extra 7% pull-in on top of the pipeline's 20%


def purge():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)


def slot_map(ob):
    """Material name (lower-cased) -> slot index, first name wins."""
    out = {}
    for i, s in enumerate(ob.material_slots):
        if s.material:
            out.setdefault(s.material.name.lower(), i)
    return out


def find_slot(slots, key):
    for name, idx in slots.items():
        if name.startswith(key):
            return idx
    return None


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


def probe(objs, lo, hi):
    """Print where the leftovers actually are, before anything is changed."""
    H = hi.z - lo.z
    for ob in objs:
        slots = slot_map(ob)
        print("[slots] " + "  ".join(
            f"{s.material.name}={i}" for i, s in enumerate(ob.material_slots)
            if s.material))

        # --- hair in the forehead band: where does the fringe live?
        hi_hair = find_slot(slots, "hair")
        bands = {}
        for p in ob.data.polygons:
            if p.material_index != hi_hair:
                continue
            fz = (p.center.z - lo.z) / H
            if not (0.50 <= fz <= 0.74):
                continue
            key = f"y{round(p.center.y, 2):+.2f}"
            b = bands.setdefault(key, [0, 9.9, -9.9])
            b[0] += 1
            b[1] = min(b[1], p.center.z)
            b[2] = max(b[2], p.center.z)
        # only the front of the head matters for the fringe
        front = {k: v for k, v in bands.items() if float(k[1:]) <= -0.28}
        print(f"[fringe] {len(bands)} y-buckets, {len(front)} of them in front")
        for k in sorted(front):
            c, a, b = front[k]
            print(f"[fringe] {k}: {c} faces z {a:.3f}..{b:.3f}")

        # --- pale debris beside the cheeks: every material, so the probe says
        #     which slot the shards actually carry instead of guessing
        for key in ("tee", "sole", "skin", "pants", "plaid", "face", "hair"):
            idx = find_slot(slots, key)
            if idx is None:
                continue
            sel = [p for p in ob.data.polygons
                   if p.material_index == idx
                   and abs(p.center.x) > CHEEK_X
                   and lo.z + CHEEK_LO * H <= p.center.z <= lo.z + CHEEK_HI * H
                   and p.center.y < CHEEK_Y]
            if sel:
                xs = [p.center.x for p in sel]
                ys = [p.center.y for p in sel]
                zs = [p.center.z for p in sel]
                buckets = {}
                for p in sel:
                    b = buckets.setdefault(f"{abs(p.center.x):.2f}", 0)
                    buckets[f"{abs(p.center.x):.2f}"] = b + 1
                print(f"[cheek] {key}: {len(sel)} faces "
                      f"x {min(xs):.3f}..{max(xs):.3f} "
                      f"y {min(ys):.3f}..{max(ys):.3f} "
                      f"z {min(zs):.3f}..{max(zs):.3f} "
                      f"|x| hist {sorted(buckets.items())}")
    # --- material profile down the body: which garment owns which height
        prof = {}
        for p in ob.data.polygons:
            b = int((p.center.z - lo.z) / H / 0.02)
            prof.setdefault(b, {})
            key = (ob.data.materials[p.material_index].name
                   if p.material_index < len(ob.data.materials)
                   and ob.data.materials[p.material_index] else "?")
            prof[b][key] = prof[b].get(key, 0) + 1
        for b in sorted(prof):
            z0 = lo.z + b * 0.02 * H
            print(f"[profile] z {z0:.3f}: " +
                  "  ".join(f"{k}={v}" for k, v in sorted(prof[b].items())))
    print(f"[probe] bounds lo={tuple(round(v,3) for v in lo)} "
          f"hi={tuple(round(v,3) for v in hi)}")


def clean_seams(objs, lo, hi):
    """Make every garment hem a clean horizontal line.

    Two passes per seam, and the order matters:
      1. flatten the ABOVE garment's own hem - only the faces that carry that
         material get their vertices pulled up onto the plane. Flattening the
         below garment as well would squash the whole plaid sash into a sheet;
      2. re-label the faces inside the band by their height, so the material
         border lands exactly on the plane instead of sawtoothing through it.
    """
    H = hi.z - lo.z
    for ob in objs:
        slots = slot_map(ob)
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.faces.ensure_lookup_table()
        for above, below, pf, bf in SEAMS:
            ia, ib = find_slot(slots, above), find_slot(slots, below)
            if ia is None or ib is None:
                continue
            plane = lo.z + pf * H
            band = bf * H

            pulled = 0
            for f in bm.faces:
                if f.material_index != ia:
                    continue
                for v in f.verts:
                    if plane - band <= v.co.z < plane:
                        v.co.z = plane
                        pulled += 1

            relabelled = 0
            for f in bm.faces:
                c = f.calc_center_median()
                if abs(c.x) > 0.225:
                    continue        # the arms hang through this band
                if plane - band <= c.z <= plane + band:
                    want = ia if c.z >= plane else ib
                    if f.material_index != want:
                        f.material_index = want
                        relabelled += 1
            print(f"[seam] {above}/{below} @ z={plane:.3f}: "
                  f"{pulled} verts pulled up, {relabelled} faces relabelled")
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()


def drop_cheek_debris(objs, lo, hi, x_edge=0.160):
    """Take the painted face off the sides of the head.

    The face texture is projected onto the whole front of the skull, so it
    runs out past the cheeks onto the flat slabs Meshy rebuilt the reference's
    headphones as. Those slabs are pale blue-white against a skin coloured
    face, and they read as debris rather than as an accessory.

    Deleting them tears a ragged edge into the cheek, so the faces are
    re-labelled as plain skin instead - the cheek stays whole and the slabs
    stop standing out.
    """
    H = hi.z - lo.z
    changed = 0
    for ob in objs:
        slots = slot_map(ob)
        face = find_slot(slots, "face")
        skin = find_slot(slots, "skin")
        if face is None or skin is None:
            continue
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.faces.ensure_lookup_table()
        for f in bm.faces:
            if f.material_index != face:
                continue
            c = f.calc_center_median()
            if abs(c.x) <= x_edge:
                continue
            if not (lo.z + CHEEK_LO * H <= c.z <= lo.z + CHEEK_HI * H):
                continue
            f.material_index = skin
            changed += 1
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
    print(f"[cheek] re-labelled {changed} side faces from face to skin")


def clean_head_slab(objs, lo, hi, x_edge=0.165, x_face=0.200):
    """Sort out the mess on both sides of the head.

    Meshy rebuilt the reference's headphones as flat slabs floating beside the
    cheeks, and left a trail of shards around them. Deleting them was tried
    and it tears the cheek apart - the slab and the cheek share their faces,
    so any cut that removes the slab takes the cheek with it.

    So nothing is deleted. The slabs and shards are re-labelled as hair, which
    makes them read as the side locks of the fringe instead of as debris, and
    the painted face that ran out past the cheek is re-labelled as plain skin
    so its blank texture margin stops showing as white flecks.
    """
    H = hi.z - lo.z
    z_lo = lo.z + 0.556 * H
    z_hi = lo.z + 0.716 * H
    z_chin = lo.z + 0.583 * H
    z_nose = lo.z + 0.606 * H
    z_nose_top = lo.z + 0.635 * H
    as_hair = 0
    as_skin = 0
    for ob in objs:
        slots = slot_map(ob)
        face = find_slot(slots, "face")
        skin = find_slot(slots, "skin")
        hair = find_slot(slots, "hair")
        if face is None or skin is None or hair is None:
            continue

        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.faces.ensure_lookup_table()
        for f in bm.faces:
            c = f.calc_center_median()
            if z_lo <= c.z <= z_hi and abs(c.x) > x_edge:
                # slab and shards -> side locks of the fringe
                if f.material_index != hair:
                    f.material_index = hair
                    as_hair += 1
                continue
            if f.material_index != face:
                continue
            # the texture runs out below the chin
            if c.z < z_chin:
                f.material_index = skin
                as_skin += 1
        # round the shards off so they read as locks of hair rather than as
        # torn cloth
        for _ in range(3):
            hot = [v for v in bm.verts
                   if z_lo <= v.co.z <= z_hi and abs(v.co.x) > x_edge]
            if hot:
                bmesh.ops.smooth_vert(bm, verts=hot, factor=0.35,
                                      use_axis_x=True, use_axis_y=True,
                                      use_axis_z=True)
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
    print(f"[head] {as_hair} faces became hair, {as_skin} became skin")


def flatten_waist_edge(objs, lo, hi, plane_f=0.400, band=0.020):
    """Pull the waist to one clean line.

    The tee's hem and the top of the plaid sash are the same row of teeth,
    pointing at each other, and between them they read as a torn edge. Only
    the tee's own vertices are clamped onto the seam plane - clamping every
    vertex in the band would flatten the whole sash into a sheet.

    Only the middle of the body is touched - the arms hang in the same height
    band and must keep their sleeve.
    """
    H = hi.z - lo.z
    plane = lo.z + plane_f * H
    lo_z = plane - band * H
    hi_z = plane + band * H
    moved = 0
    for ob in objs:
        slots = slot_map(ob)
        tee = find_slot(slots, "tee")
        if tee is None:
            continue
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.faces.ensure_lookup_table()
        for f in bm.faces:
            if f.material_index != tee:
                continue
            for v in f.verts:
                if abs(v.co.x) > 0.225:
                    continue        # the arms hang through this band
                if lo_z <= v.co.z <= hi_z:
                    v.co.z = plane
                    moved += 1
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
    print(f"[waist] clamped {moved} tee verts to z={plane:.3f}")


def trim_tee_hem(objs, lo, hi, plane_f=0.400, keep=0.010):
    """Cut the tee's hem off flat.

    The hem is a row of big triangles that Meshy rebuilt as teeth, and the
    teeth hang down over the plaid sash. Flattening them was tried and only
    moved the teeth around. Cutting them off leaves a straight edge, and the
    plaid underneath fills the gap.
    """
    H = hi.z - lo.z
    plane = lo.z + plane_f * H
    removed = 0
    for ob in objs:
        tee = find_slot(slot_map(ob), "tee")
        if tee is None:
            continue
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.faces.ensure_lookup_table()
        doomed = [f for f in bm.faces
                  if f.material_index == tee
                  and f.calc_center_median().z < plane - keep]
        if doomed:
            bmesh.ops.delete(bm, geom=doomed, context="FACES")
            removed += len(doomed)
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
    print(f"[hem] cut {removed} tee faces below z={plane:.3f}")


def cut_fringe(objs, lo, hi):
    """Cut the teeth of the fringe off at the brow line.

    Lifting the fringe vertices was tried and backfired: pulling the tips
    toward the hairline packs the spikes closer together, so the fringe turns
    into a dense metal-comb curtain that hides the brows. Cutting the tips off
    removes the teeth that were sitting on the eyes, and the hair behind them
    still reads as a full fringe.
    """
    H = hi.z - lo.z
    z_cut = lo.z + FRINGE_CUT * H
    removed = 0
    for ob in objs:
        slots = slot_map(ob)
        hair = find_slot(slots, "hair")
        if hair is None:
            continue
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.faces.ensure_lookup_table()
        doomed = []
        for f in bm.faces:
            if f.material_index != hair:
                continue
            c = f.calc_center_median()
            if c.y < FRINGE_Y and c.z < z_cut:
                doomed.append(f)
        if doomed:
            bmesh.ops.delete(bm, geom=doomed, context="FACES")
            removed += len(doomed)
        # pull the cut edge back so the opening closes up
        for e in bm.edges:
            if not e.is_boundary:
                continue
            for v in e.verts:
                if v.co.z < z_cut + 0.06:
                    v.co.y += 0.024
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
    print(f"[fringe] cut {removed} fringe faces below z={z_cut:.3f}")


def slim_hair(objs, lo, hi):
    """Pull the helmet in a little more.

    The pipeline already takes 20% off the protruding radius; the hair still
    reads as an explosion on top of the head, so take a little more. Only the
    part that sticks out past the skull is touched, so the face keeps its size.
    """
    H = hi.z - lo.z
    z_from = lo.z + HAIR_FROM * H
    cx, cy = 0.0, -0.05
    moved = 0
    for ob in objs:
        slots = slot_map(ob)
        hair = find_slot(slots, "hair")
        if hair is None:
            continue
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        for v in bm.verts:
            if v.co.z < z_from:
                continue
            faces = v.link_faces
            if not faces or any(f.material_index != hair for f in faces):
                continue
            dx, dy = v.co.x - cx, v.co.y - cy
            r = math.hypot(dx, dy)
            if r <= HAIR_R0:
                continue
            r2 = HAIR_R0 + (r - HAIR_R0) * HAIR_K
            s = r2 / r
            v.co.x = cx + dx * s
            v.co.y = cy + dy * s
            moved += 1
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
    print(f"[hair] slimmed {moved} verts (k={HAIR_K})")


def build_plaid_texture(size=512, cells=8):
    """Draw the buffalo check into an image.

    The pipeline drives the sash with a Checker + Wave node pair fed by
    Object texture coordinates. glTF has no object space, so the exporter
    drops the whole chain and the sash exports as flat white - the tartan only
    ever existed in the Blender render. An image texture survives the export,
    so the pattern is drawn here instead.
    """
    img = bpy.data.images.new("PlaidTex", width=size, height=size, alpha=False)
    px = [0.0] * (size * size * 4)
    c = size // cells
    red = (0.560, 0.062, 0.055)
    black = (0.030, 0.026, 0.026)
    seam = (0.012, 0.010, 0.010)
    for y in range(size):
        for x in range(size):
            cx, cy = x // c, y // c
            col = black if (cx % 2 == 0 or cy % 2 == 0) else red
            if (x % c) < 2 or (y % c) < 2:
                col = seam
            i = (y * size + x) * 4
            px[i] = col[0]
            px[i + 1] = col[1]
            px[i + 2] = col[2]
            px[i + 3] = 1.0
    img.pixels = px
    img.pack()
    print(f"[plaid] drew {size}x{size} check, {cells} cells")
    return img


def separate_by_material():
    """Split the fused mesh so the sash can carry its own UV map.

    UVs live on the mesh, not on the material, and the painted face already
    owns the UV layout of the front of the head. The sash is a separate
    object so a planar projection can be laid over it without touching the
    face texture.
    """
    bpy.ops.object.select_all(action="DESELECT")
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for ob in meshes:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="MATERIAL")
    bpy.ops.object.mode_set(mode="OBJECT")
    print(f"[plaid] split into {len([o for o in bpy.context.scene.objects if o.type=='MESH'])} meshes")


def apply_plaid_texture(uv_scale=0.30):
    """Give the sash a polar UV map and hang the check on it.

    The sash is a band tied round the waist, so it is unwrapped in polar
    coordinates: u runs along the circumference, v up the height. That keeps
    the checks continuous all the way round the waist instead of smearing
    them at the sides.
    """
    plaid_mat = None
    for ob in bpy.context.scene.objects:
        if ob.type != "MESH":
            continue
        for s in ob.material_slots:
            if s.material and s.material.name.lower().startswith("plaid"):
                plaid_mat = s.material
                target = ob
                break
        if plaid_mat:
            break
    if plaid_mat is None:
        print("[plaid] no sash found")
        return

    img = build_plaid_texture()
    nt = plaid_mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (300, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (0, 0)
    bsdf.inputs["Roughness"].default_value = 0.66
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.location = (-300, 0)
    tex.image = img
    tex.interpolation = "Linear"
    tex.extension = "REPEAT"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    mesh = target.data
    while mesh.uv_layers:
        mesh.uv_layers.remove(mesh.uv_layers[0])
    uv = mesh.uv_layers.new(name="UVMap")
    # centre of the waist, used as the polar origin
    zs = [v.co.z for v in mesh.vertices]
    z_mid = (min(zs) + max(zs)) * 0.5
    rs = [math.hypot(v.co.x, v.co.y) for v in mesh.vertices]
    r_mid = sum(rs) / max(len(rs), 1)
    for loop in mesh.loops:
        co = mesh.vertices[loop.vertex_index].co
        dx, dy = co.x, co.y
        r = math.hypot(dx, dy)
        theta = math.atan2(dy, dx)
        u = (theta + math.pi) * max(r, 1e-6) / uv_scale
        v = (co.z - z_mid) / uv_scale
        uv.data[loop.index].uv = (u, v)
    print(f"[plaid] {target.name}: {len(mesh.polygons)} faces unwrapped "
          f"(scale {uv_scale})")


def trim_face_edges():
    """Re-label the faces that fall off the painted face texture.

    The face is a cylindrical unwrap that spans +/-58 degrees around the head
    (face_texture.AZ_HALF), and the texture is the reference photo cut out on
    a transparent background. Everything outside that span - the sides of the
    head, the patch under the chin - has its UVs clamped onto the blank
    margin of the texture, and shows up on the page as white flecks beside
    the cheeks and under the jaw.

    Those faces are re-labelled as plain skin, which is what they actually
    are. Clamped faces are easy to spot: every one of their loops sits
    exactly on 0.0 or 1.0 of the texture.
    """
    skin_mat = None
    for ob in bpy.context.scene.objects:
        if ob.type != "MESH":
            continue
        for s in ob.material_slots:
            if s.material and s.material.name.lower().startswith("skin"):
                skin_mat = s.material
                break
        if skin_mat is not None:
            break
    if skin_mat is None:
        print("[face] no skin material in the scene")
        return

    for ob in bpy.context.scene.objects:
        if ob.type != "MESH":
            continue
        slots = slot_map(ob)
        face = find_slot(slots, "face")
        uvl = ob.data.uv_layers.active
        if uvl is None and len(ob.data.uv_layers):
            uvl = ob.data.uv_layers[0]
        if face is None or uvl is None:
            continue
        # the split left this mesh with its own material only, so borrow the
        # skin one from the rest of the scene
        skin = slots.get("skin")
        if skin is None:
            ob.data.materials.append(skin_mat)
            skin = len(ob.data.materials) - 1
        names = [s.material.name for s in ob.material_slots if s.material]
        print(f"[face] {ob.name}: mats={names} uvs={[l.name for l in ob.data.uv_layers]}")
        changed = 0
        for p in ob.data.polygons:
            if p.material_index != face:
                continue
            us = [uvl.data[li].uv[0] for li in p.loop_indices]
            vs = [uvl.data[li].uv[1] for li in p.loop_indices]
            if not us:
                continue
            side = all(u <= 0.0 for u in us) or all(u >= 1.0 for u in us)
            vert = all(v <= 0.0 for v in vs) or all(v >= 1.0 for v in vs)
            if side or vert:
                p.material_index = skin
                changed += 1
        ob.data.update()
        print(f"[face] {ob.name}: {changed} faces off the texture -> skin")


def plaid_has_texture():
    """Does the sash already carry a real image texture?

    The pipeline can bake the tartan into an image, and when it does, that is
    better than anything this file can do: splitting the mesh apart to give
    the sash its own UV map copies the whole vertex set and multiplies the
    GLB by six.
    """
    for ob in bpy.context.scene.objects:
        if ob.type != "MESH":
            continue
        for s in ob.material_slots:
            m = s.material
            if not m or not m.name.lower().startswith("plaid"):
                continue
            if not m.use_nodes:
                return False
            for n in m.node_tree.nodes:
                if n.bl_idname == "ShaderNodeTexImage" and n.image:
                    return True
    return False


def drop_floating_shards(objs, lo, hi, max_faces=600):
    """Delete the small islands floating off the body.

    Meshy rebuilds stray slabs and shards as separate pieces that hover in
    front of the face and along the hems. They are not connected to the
    body, so they can be found as their own connected components - and
    because they are separate, cutting them out does not tear the body open
    the way cutting faces does.

    Only islands that float in front of the body are removed; the hair shell
    and the body itself are big islands and are never touched.
    """
    H = hi.z - lo.z
    z_lo = lo.z + 0.02 * H
    z_hi = lo.z + 0.98 * H
    total = 0
    for ob in objs:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.faces.ensure_lookup_table()
        bm.verts.ensure_lookup_table()

        label = {}
        cur = 0
        for f in bm.faces:
            if f.index in label:
                continue
            stack = [f]
            label[f.index] = cur
            while stack:
                fa = stack.pop()
                for e in fa.edges:
                    for nf in e.link_faces:
                        if nf.index not in label:
                            label[nf.index] = cur
                            stack.append(nf)
            cur += 1

        groups = {}
        for f in bm.faces:
            groups.setdefault(label[f.index], []).append(f)
        main = max(groups, key=lambda k: len(groups[k]))

        doomed = []
        for key, faces in groups.items():
            if key == main or len(faces) > max_faces:
                continue
            cs = [f.calc_center_median() for f in faces]
            zmin = min(c.z for c in cs)
            zmax = max(c.z for c in cs)
            if zmin < z_lo or zmax > z_hi:
                continue
            if max(c.y for c in cs) > 0.05:
                continue            # has to float in front of the body
            doomed.extend(faces)
        if doomed:
            print(f"[shards] removing {len(doomed)} faces in "
                  f"{len({label[f.index] for f in doomed})} islands")
            bmesh.ops.delete(bm, geom=doomed, context="FACES")
            total += len(doomed)
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
    print(f"[shards] total {total} faces removed")


def clear_eye_fringe(objs, lo, hi, z_lo=0.605, z_hi=0.700, y_front=-0.045):
    """Repaint the ragged hair edge that crosses the eyes.

    The hair shell is a separate volume sitting on the skull, and its lower
    boundary falls right across the eyes. The boundary is a row of triangles,
    so it reads as a torn black frame around both eyes - the single ugliest
    thing on the model.

    Moving the fringe does not work: pulling it up packs the spikes together
    and turns it into a metal comb. The edge is repainted as plain skin
    instead, so the boundary disappears into the face and the eyes come out
    clean.
    """
    H = hi.z - lo.z
    za = lo.z + z_lo * H
    zb = lo.z + z_hi * H
    changed = 0
    for ob in objs:
        slots = slot_map(ob)
        hair = find_slot(slots, "hair")
        skin = find_slot(slots, "skin")
        if hair is None or skin is None:
            continue
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.faces.ensure_lookup_table()
        for f in bm.faces:
            if f.material_index != hair:
                continue
            c = f.calc_center_median()
            if not (za <= c.z <= zb):
                continue
            if c.y >= y_front:
                continue            # has to be in front of the face
            f.material_index = skin
            changed += 1
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
    print(f"[eyes] {changed} fringe faces repainted as skin "
          f"(z {za:.3f}..{zb:.3f}, y < {y_front})")


def tuck_front_edges(objs, lo, hi, push=0.022):
    """Slide the ragged front edges back onto the surface behind them.

    Two things stand a little in front of the body and are built as sheets
    with a row of triangles along their boundary: the hair shell around the
    eyes, and the teeth of the tee hem. The boundary is what reads as a torn
    edge - the hair becomes a black frame around the eyes, the tee grows
    white teeth over the plaid sash.

    Moving the geometry is not enough on its own - the edge just moves with
    it. But pushing the sheet back until it sits against the surface behind
    it hides the boundary: the body in front now covers it.
    """
    from mathutils.bvhtree import BVHTree

    H = hi.z - lo.z
    # (what to push, what it should sit against, height band)
    jobs = (
        ("hair", ("face", "skin"), 0.600, 0.715),
        ("tee", ("plaid", "pants", "skin"), 0.600, 0.720),
    )

    for ob in objs:
        slots = slot_map(ob)
        if not slots:
            continue
        for mover_key, back_keys, z_lo_f, z_hi_f in jobs:
            mover = find_slot(slots, mover_key)
            if mover is None:
                continue
            back_idx = {find_slot(slots, k) for k in back_keys}
            back_idx.discard(None)
            if not back_idx:
                continue

            bm = bmesh.new()
            bm.from_mesh(ob.data)
            bm.faces.ensure_lookup_table()
            bm.verts.ensure_lookup_table()

            # BVH of the surface the sheet should sit against
            vmap = {}
            bverts = []
            bpolys = []
            for f in bm.faces:
                if f.material_index not in back_idx:
                    continue
                vs = []
                for v in f.verts:
                    if v.index not in vmap:
                        vmap[v.index] = len(bverts)
                        bverts.append(v.co.copy())
                    vs.append(vmap[v.index])
                if len(vs) >= 3:
                    bpolys.append(tuple(vs))
            if not bpolys:
                bm.free()
                continue
            bvh = BVHTree.FromPolygons(bverts, bpolys)

            z_lo = lo.z + z_lo_f * H
            z_hi = lo.z + z_hi_f * H
            moved = 0
            for v in bm.verts:
                if not (z_lo <= v.co.z <= z_hi):
                    continue
                faces = v.link_faces
                if not faces:
                    continue
                if not any(f.material_index == mover for f in faces):
                    continue
                # the vertex has to actually be in front of the surface
                if v.co.y > 0.0:
                    continue
                origin = Vector((v.co.x, -3.0, v.co.z))
                hit = bvh.ray_cast(origin, Vector((0.0, 1.0, 0.0)), 6.0)
                if hit[0] is None:
                    continue
                surface_y = hit[0].y
                if v.co.y < surface_y - push:
                    v.co.y = surface_y - push
                    moved += 1
            if moved:
                print(f"[tuck] {mover_key}: {moved} verts pushed back")
            bm.to_mesh(ob.data)
            bm.free()
            ob.data.update()


def tuck_fringe_behind_brow(objs, lo, hi, z_lo_f=0.715, push=0.012):
    """Hide the fringe tips inside the brow instead of over the eyes.

    The fringe is a shell of hair sitting in front of the forehead, and its
    lower edge is a row of triangles that crosses the eyes. The pipeline
    paints those tips with the face texture, so they pick up the painted
    lashes and the face ends up wearing a torn black frame.

    Re-labelling the tips does not help: the material border lands on the
    same ragged edge. The tips have to move. Every face-textured vertex above
    the brow line is slid back until it sits just behind the surface of the
    face, so the forehead covers the edge and the tips disappear into it.
    """
    from mathutils.bvhtree import BVHTree

    H = hi.z - lo.z
    z_lo = lo.z + z_lo_f * H
    for ob in objs:
        slots = slot_map(ob)
        face = find_slot(slots, "face")
        if face is None:
            continue
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.faces.ensure_lookup_table()
        bm.verts.ensure_lookup_table()

        vmap = {}
        bverts = []
        bpolys = []
        for f in bm.faces:
            vs = []
            for v in f.verts:
                if v.index not in vmap:
                    vmap[v.index] = len(bverts)
                    bverts.append(v.co.copy())
                vs.append(vmap[v.index])
            if len(vs) >= 3:
                bpolys.append(tuple(vs))
        if not bpolys:
            bm.free()
            continue
        bvh = BVHTree.FromPolygons(bverts, bpolys)

        moved = 0
        for v in bm.verts:
            if v.co.z < z_lo:
                continue
            faces = v.link_faces
            if not faces or not any(f.material_index == face for f in faces):
                continue
            hit = bvh.ray_cast(Vector((v.co.x, -3.0, v.co.z)),
                               Vector((0.0, 1.0, 0.0)), 6.0)
            if hit[0] is None:
                continue
            surface_y = hit[0].y
            if v.co.y < surface_y - 0.006:
                v.co.y = surface_y - push
                moved += 1
        if moved:
            print(f"[fringe] {moved} verts tucked behind the brow")
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()


def flatten_face_overhang(objs, lo, hi):
    """Fold the face material that hangs off the head back onto the head.

    The painted face is wrapped onto the front of the skull, but the
    reconstruction also left broken flaps around the cheeks, the jaw and the
    neck carrying the same material. They pick up the blank edge of the
    texture and read as black shards lying over the face.

    A flap is recognisable by its normal. The front of the face points
    forward; a flap points sideways or backwards. Those faces are re-labelled
    as plain skin and folded down onto the surface of the head, so the cheek
    and the jaw are flat again.

    Re-labelling on its own is not enough - a flap is still a flap, and it
    still stands proud of the face and catches a shadow. It has to be folded
    back onto the surface as well.
    """
    from mathutils.bvhtree import BVHTree

    for ob in objs:
        slots = slot_map(ob)
        face = find_slot(slots, "face")
        skin = find_slot(slots, "skin")
        if face is None or skin is None:
            continue
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.faces.ensure_lookup_table()
        bm.verts.ensure_lookup_table()

        # the skin shell is the surface the flaps have to lie on
        vmap = {}
        bverts = []
        bpolys = []
        for f in bm.faces:
            if f.material_index != skin:
                continue
            vs = []
            for v in f.verts:
                if v.index not in vmap:
                    vmap[v.index] = len(bverts)
                    bverts.append(v.co.copy())
                vs.append(vmap[v.index])
            if len(vs) >= 3:
                bpolys.append(tuple(vs))
        if not bpolys:
            bm.free()
            continue
        bvh = BVHTree.FromPolygons(bverts, bpolys)

        front = [f for f in bm.faces if f.material_index == face]
        if not front:
            bm.free()
            continue
        cx = sum(f.calc_center_median().x for f in front) / len(front)
        cy = sum(f.calc_center_median().y for f in front) / len(front)

        flaps = [f for f in front if f.normal.y > -0.30]
        if not flaps:
            bm.free()
            continue
        for f in flaps:
            f.material_index = skin

        folded = 0
        for f in flaps:
            c = f.calc_center_median()
            d = Vector((c.x - cx, c.y - cy, 0.0))
            if d.length < 1e-5:
                continue
            d.normalize()
            for v in f.verts:
                origin = Vector((cx, cy, v.co.z))
                hit = bvh.ray_cast(origin, d, 2.0)
                if hit[0] is not None:
                    v.co = hit[0] + d * 0.002
                    folded += 1
        print(f"[flaps] {len(flaps)} face flaps folded onto the head "
              f"({folded} verts)")
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()


def _flood_from_border(mask):
    """Every pixel of `mask` that is reachable from the border of the image."""
    reach = np.zeros_like(mask)
    reach[0, :] |= mask[0, :]
    reach[-1, :] |= mask[-1, :]
    reach[:, 0] |= mask[:, 0]
    reach[:, -1] |= mask[:, -1]
    while True:
        nxt = reach.copy()
        nxt[1:, :] |= reach[:-1, :]
        nxt[:-1, :] |= reach[1:, :]
        nxt[:, 1:] |= reach[:, :-1]
        nxt[:, :-1] |= reach[:, 1:]
        nxt &= mask
        if nxt.sum() == reach.sum():
            return reach
        reach = nxt


def _erode(mask, r):
    out = mask
    for _ in range(r):
        nxt = out.copy()
        nxt[1:, :] &= out[:-1, :]
        nxt[:-1, :] &= out[1:, :]
        nxt[:, 1:] &= out[:, :-1]
        nxt[:, :-1] &= out[:, 1:]
        out = nxt
    return out


def _dilate(mask, r):
    out = mask
    for _ in range(r):
        nxt = out.copy()
        nxt[1:, :] |= out[:-1, :]
        nxt[:-1, :] |= out[1:, :]
        nxt[:, 1:] |= out[:, :-1]
        nxt[:, :-1] |= out[:, 1:]
        out = nxt
    return out


def _box_blur(a, r):
    """Separable box blur over the first two axes of an (h, w, c) array."""
    k = 2 * r + 1
    out = a
    for axis in (0, 1):
        pad = np.pad(out, ((r, r), (0, 0), (0, 0)) if axis == 0
                     else ((0, 0), (r, r), (0, 0)), mode="edge")
        cs = np.cumsum(pad, axis=axis)
        shape = list(cs.shape)
        shape[axis] = 1
        zero = np.zeros(shape, cs.dtype)
        cs = np.concatenate([zero, cs], axis=axis)
        hi = [slice(None)] * 3
        lo = [slice(None)] * 3
        hi[axis] = slice(k, None)
        lo[axis] = slice(0, -k)
        out = (cs[tuple(hi)] - cs[tuple(lo)]) / k
    return out


def clean_face_texture(objs, threshold=0.32, erode=3):
    """Take the reference photo's hair out of the projected face texture.

    The head texture is the reference photo wrapped onto the skull, so the
    photo's own hair rides along with it: the fringe lands on the forehead and
    the side locks land on the cheeks and the jaw. The face shell is torn
    along its silhouette, and a torn edge samples the border of the texture -
    which is exactly where the hair is - so the result is a ring of black
    shards around the eyes, the cheeks and the chin.

    The hair is the only dark thing that touches the border of the texture.
    The brows, the lashes and the iris all float in the middle, surrounded by
    skin, so flooding the dark pixels inward from the border separates the
    hair from the features without needing to know where the eyes are.

    A plain flood is not enough: in the photo the lash of the left eye runs
    into the hair beside it, and the flood walks straight down the lash and
    eats the eye. Eroding the dark mask first cuts those thin bridges while
    the thick hair mass survives; the brows and the lashes are thin enough to
    be eroded away, so they stay out of the flood and survive untouched. The
    hair mask is dilated back afterwards so the fringe keeps its edge.

    The hair is then filled with the nearest skin pixel in its own column,
    which for the fringe is the forehead right below it.

    Returns the number of pixels that were replaced.
    """
    import numpy as np

    face_mat = None
    for ob in objs:
        for s in ob.material_slots:
            if s.material and s.material.name.lower().startswith("face"):
                face_mat = s.material
                break
        if face_mat:
            break
    if face_mat is None:
        print("[texture] no face material - skipping")
        return 0

    tex = None
    for n in face_mat.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image:
            tex = n
            break
    if tex is None:
        print("[texture] face material has no image - skipping")
        return 0

    img = tex.image
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    px = buf.reshape(h, w, 4)[::-1]          # top-down rows
    rgb = px[:, :, :3].copy()

    luma = (rgb[:, :, 0] * 0.2126 + rgb[:, :, 1] * 0.7152
            + rgb[:, :, 2] * 0.0722)
    dark = luma < threshold
    core = _erode(dark, erode)
    hair = _dilate(_flood_from_border(core), erode) & dark
    n_hair = int(hair.sum())
    if n_hair == 0:
        print("[texture] no hair found at the border - leaving it alone")
        return 0

    # Fill the hair with a smooth skin field. Copying the nearest skin pixel
    # down each column would work too, but the photo's columns each carry a
    # different shade and the result is a curtain of vertical streaks across
    # the forehead. A heavily downsampled copy of the skin is smooth enough
    # to pass for a forehead and keeps the photo's broad shading.
    out = rgb.copy()
    hx, hy = max(1, w // 32), max(1, h // 32)
    skin_src = (luma > 0.62) & (~hair)
    acc = np.zeros((hy, hx, 3), np.float32)
    cnt = np.zeros((hy, hx), np.float32)
    hh, ww = hy * 32, hx * 32
    pad_l = np.where(skin_src[:hh, :ww][:, :, None], rgb[:hh, :ww], 0.0)
    pad_c = skin_src[:hh, :ww].astype(np.float32)
    for by in range(hy):
        for bx in range(hx):
            blk = pad_l[by * 32:(by + 1) * 32, bx * 32:(bx + 1) * 32]
            bc = pad_c[by * 32:(by + 1) * 32, bx * 32:(bx + 1) * 32]
            n = bc.sum()
            if n > 0:
                acc[by, bx] = blk.reshape(-1, 3).sum(axis=0) / n
                cnt[by, bx] = 1.0
    acc = acc / np.maximum(cnt, 1.0)[:, :, None]
    field = np.repeat(np.repeat(acc, 32, axis=0), 32, axis=1)[:h, :w]
    out[hair] = field[hair]

    # The reference's eye is much bigger than the socket the reconstruction
    # left in the skull, so the painted white runs out past the eye and lands
    # on the cheek. Wherever the face shell is torn there, that stray white
    # shows up as a pale patch over the face. Keep the white only where it
    # belongs - close around the iris - and give the rest back to the skin.
    luma3 = (out[:, :, 0] * 0.2126 + out[:, :, 1] * 0.7152
             + out[:, :, 2] * 0.0722)
    near_eye = _dilate(luma3 < 0.30, 22)
    stray = (luma3 > 0.82) & (~near_eye)
    if stray.any():
        out[stray] = field[stray]
        print(f"[texture] pulled {int(stray.sum())} stray eye-white pixels "
              f"back to skin")

    # A light blur over the whole texture. The photo is a poster-sharp JPEG,
    # and the edge of every painted feature lands on a jagged triangle edge
    # in the mesh. A couple of pixels of blur takes the shine off those
    # edges and the face reads as painted rather than as a decal.
    out = _box_blur(out, 2)
    print("[texture] softened the painted edges")

    # The face shell is torn along its silhouette, and a torn edge samples the
    # border of the texture. Flatten the border band to plain skin so those
    # edges come out as skin instead of shards.
    luma2 = (out[:, :, 0] * 0.2126 + out[:, :, 1] * 0.7152
             + out[:, :, 2] * 0.0722)
    skin = luma2 > 0.62
    if skin.any():
        skin_col = np.median(out[skin], axis=0)
        bx = max(4, int(w * 0.045))
        by = max(4, int(h * 0.045))
        out[:, :bx] = skin_col
        out[:, w - bx:] = skin_col
        out[h - by:, :] = skin_col
        out[:by, :] = skin_col
        print(f"[texture] flattened the border to skin {skin_col.round(3)}")

    px[:, :, :3] = out
    img.update()
    img.pack()
    try:
        img.file_format = "PNG"
        img.filepath_raw = os.path.join(OUT, "face_clean.png")
        img.save()
        img.filepath_raw = ""
    except (OSError, RuntimeError) as exc:
        print(f"[texture] could not write the preview: {exc}")
    print(f"[texture] stripped {n_hair} hair pixels out of {w}x{h} "
          f"({100.0 * n_hair / (w * h):.1f}%)")
    return n_hair


def trim_hair_over_face(objs, lo, hi, z_cut=1.30, nx=320, nz=320, near_eps=0.012):
    """Cut away the hair that hangs in front of the face.

    Meshy rebuilds the hair as a handful of separate shells. On the skull they
    look right, but the shells that fall across the forehead and the eyes come
    out torn - thin flakes with a sawtooth edge - and a sawtooth of black hair
    across the eyes is what makes the face read as broken.

    The test is a front projection: for every column of the head, shoot a ray
    forward through the model and see whether it passes through the face
    shell. Anything made of hair that lands inside that outline is hair that
    is covering the face, and it goes.

    z_cut is the hairline. Hair above it is the cap and stays.
    """
    from mathutils.bvhtree import BVHTree

    for ob in objs:
        slots = slot_map(ob)
        hair = find_slot(slots, "hair")
        face = find_slot(slots, "face")
        if hair is None or face is None:
            continue

        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.faces.ensure_lookup_table()
        bm.verts.ensure_lookup_table()

        verts = [v.co.copy() for v in bm.verts]
        polys = [tuple(v.index for v in f.verts) for f in bm.faces]
        bvh = BVHTree.FromPolygons(verts, polys, all_triangles=False)

        # a second tree over the face shell alone, for the distance test
        fverts, fpolys, fmap = [], [], []
        for f in bm.faces:
            if f.material_index != face:
                continue
            idx = []
            for v in f.verts:
                idx.append(len(fverts))
                fverts.append(v.co.copy())
            fpolys.append(tuple(idx))
            fmap.append(f)
        bvh_face = BVHTree.FromPolygons(fverts, fpolys, all_triangles=False)

        # inside[x][z] = a ray forward through this column meets the face
        x0, x1 = lo.x, hi.x
        z0, z1 = lo.z, hi.z
        inside = np.zeros((nz, nx), dtype=bool)
        for iz in range(nz):
            z = z0 + (iz / (nz - 1.0)) * (z1 - z0)
            for ix in range(nx):
                x = x0 + (ix / (nx - 1.0)) * (x1 - x0)
                # shoot from the front and step through every surface, so a
                # strand of hair lying over the face does not hide it
                origin = Vector((x, lo.y - 1.0, z))
                direction = Vector((0.0, 1.0, 0.0))
                for _ in range(12):
                    hit = bvh.ray_cast(origin, direction, 20.0)
                    if hit[0] is None:
                        break
                    fi = hit[2]
                    if fi is not None and fi < len(bm.faces) \
                            and bm.faces[fi].material_index == face:
                        inside[iz, ix] = True
                        break
                    origin = hit[0] + direction * 0.002

        kill = []
        near = []
        for f in bm.faces:
            if f.material_index != hair:
                continue
            c = f.calc_center_median()
            hit = bvh_face.find_nearest(c)
            if hit[0] is not None and hit[3] < near_eps:
                near.append(f)
                continue
            if c.z > z_cut:
                continue
            ix = int((c.x - x0) / (x1 - x0) * (nx - 1))
            iz = int((c.z - z0) / (z1 - z0) * (nz - 1))
            if not (0 <= ix < nx and 0 <= iz < nz):
                continue
            if inside[iz, ix]:
                kill.append(f)
        print(f"[hair] cut {len(near)} hair faces touching the face and "
              f"{len(kill)} more covering it")
        if near or kill:
            bmesh.ops.delete(bm, geom=near + kill, context="FACES")
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()


def drop_untextured_face(objs):
    """Re-label the face faces that never got real UVs.

    The head texture is unwrapped cylindrically, and everything that is not
    part of the face gets a flat (0, 0). A handful of faces are re-labelled as
    face material after that, so they keep the flat UV and sample the corner
    of the texture instead of the face. They show up as a ring of grey shards
    around the eyes and along the jaw. Sending them back to plain skin gets
    rid of them.
    """
    for ob in objs:
        slots = slot_map(ob)
        face = find_slot(slots, "face")
        skin = find_slot(slots, "skin")
        if face is None or skin is None:
            continue
        uvl = ob.data.uv_layers.active
        if uvl is None:
            continue
        n = 0
        for p in ob.data.polygons:
            if p.material_index != face:
                continue
            us = [uvl.data[li].uv[0] for li in p.loop_indices]
            vs = [uvl.data[li].uv[1] for li in p.loop_indices]
            if not us:
                continue
            if max(abs(u) for u in us) < 1e-4 and max(abs(v) for v in vs) < 1e-4:
                p.material_index = skin
                n += 1
        print(f"[face] sent {n} untextured faces back to skin")
        ob.data.update()


def repaint_face(objs, lo, hi):
    """Re-bake the face texture and the head UVs against the current geometry.

    The head texture is the reference photo projected onto the skull, and the
    unwrap is cylindrical: azimuth to u, height to v. Both were solved when
    the pipeline ran. Since then the skull was resculpted - the fringe was
    cut back, the hair was slimmed - so the projection no longer matches the
    head it is sitting on. The photo's eyes land in the wrong place and the
    parts of the texture that fall on the temples are the photo's side hair,
    which is what the black shards around the eyes are.

    The fix is to solve the projection again from the geometry as it is now
    and bake the photo back on. The helpers live in chibi_restyle.py; this
    imports them with CHIBI_RUN=0 so the pipeline does not re-run.
    """
    import sys

    os.environ["CHIBI_RUN"] = "0"
    here = os.path.dirname(os.path.abspath(__file__))
    if here not in sys.path:
        sys.path.insert(0, here)
    import chibi_restyle

    face_slot = None
    skin_slot = None
    plaid_slot = None
    skin_mat = None
    for ob in objs:
        slots = slot_map(ob)
        if face_slot is None:
            face_slot = find_slot(slots, "face")
            skin_slot = find_slot(slots, "skin")
            plaid_slot = find_slot(slots, "plaid")
            skin_mat = ob.material_slots[skin_slot].material
    if face_slot is None or skin_mat is None:
        print("[face] no face material - skipping the repaint")
        return None

    m = chibi_restyle.face_metrics(objs, lo, hi)
    m["K"] = chibi_restyle.photo_scale(objs, m)
    print(f"[face] K={m['K']:.1f} eye_az={math.degrees(m['eye_az']):.1f}deg "
          f"z={m['z0']:.3f}..{m['z1']:.3f}")

    new_mat = chibi_restyle.face_texture.bake(m, skin_mat, OUT,
                                               chibi_restyle.REF_FACE)
    for ob in objs:
        ob.material_slots[face_slot].material = new_mat
    z_neck = lo.z + chibi_restyle.Z_NECK_FRAC * (hi.z - lo.z)
    chibi_restyle.face_texture.apply(objs, m, new_mat, face_slot, z_neck,
                                     (skin_slot, face_slot))
    # apply() flattens every UV that is not the face, so the tartan has to be
    # unwrapped again
    chibi_restyle.uv_plaid(objs, lo, hi, plaid_slot)
    return m


def repaint_face_painted(objs, lo, hi):
    """Re-bake the face texture as painted artwork instead of a photo.

    The head texture is a photo of the reference projected onto the skull, and
    the reference's own fringe comes along with it: the strands hang between
    the eyes and over the brows, and the cylindrical unwrap smears them into
    black shards.  They are in the texture, not in the mesh - hiding the hair
    does not remove them - and no amount of geometry work will.

    The painted path draws the same features on plain skin: blush, sclera,
    iris, lashes, speculars, brow, nose and smile.  Nothing but skin goes
    into it, so there is nothing to smear.

    The painted canvas is built from the same frame and comes out the same
    size as the photo version, so the UVs that are already on the face shell
    still land on the same features - only the pixels change.
    """
    import sys

    os.environ["CHIBI_RUN"] = "0"
    here = os.path.dirname(os.path.abspath(__file__))
    if here not in sys.path:
        sys.path.insert(0, here)
    import chibi_restyle

    face_slot = None
    skin_mat = None
    for ob in objs:
        slots = slot_map(ob)
        if face_slot is None:
            face_slot = find_slot(slots, "face")
            skin_slot = find_slot(slots, "skin")
            if skin_slot is None:
                continue
            skin_mat = ob.material_slots[skin_slot].material
    if face_slot is None or skin_mat is None:
        print("[face] no face material - keeping the old texture")
        return None

    m = chibi_restyle.face_metrics(objs, lo, hi)
    print(f"[face] painted texture, eye_az={math.degrees(m['eye_az']):.1f}deg "
          f"z={m['z0']:.3f}..{m['z1']:.3f}")

    out_dir = os.path.join(OUT, "polish")
    os.makedirs(out_dir, exist_ok=True)
    new_mat = chibi_restyle.face_texture.bake(m, skin_mat, out_dir, None)
    # bake() asks for a material called "Face", which Blender renames to
    # "Face.001" because one is already loaded - and the shell steps look the
    # slot up by that exact name, so it would quietly skip the whole face.
    # Free the name first: Blender never swaps two names, it only appends a
    # number to the one that is being set.
    for ob in objs:
        slot = ob.material_slots[face_slot]
        if slot.material:
            slot.material.name = "FaceOld"
    new_mat.name = "Face"
    for ob in objs:
        ob.material_slots[face_slot].material = new_mat
    print(f"[face] face material is now {new_mat.name!r}")
    return m


def _fit_uv_frame(objs, face_slot):
    """Recover the cylindrical frame the head texture was unwrapped with.

    u = 0.5 + atan2(x - cx, -(y - cy)) / (2 * 58 deg)
    v = (z - z0) / (z1 - z0)

    The v part is a straight line through the samples. The u part needs the
    head's axis, which is solved by searching: the axis that makes the
    measured u and the measured azimuth agree is the axis the texture was
    baked with.
    """
    samples = []
    for ob in objs:
        uvl = ob.data.uv_layers.active
        if uvl is None:
            continue
        for p in ob.data.polygons:
            if p.material_index != face_slot:
                continue
            for li in p.loop_indices:
                v = ob.data.vertices[ob.data.loops[li].vertex_index].co
                uv = uvl.data[li].uv
                samples.append((uv[0], uv[1], v.x, v.y, v.z))
    if len(samples) < 50:
        return None

    # v: z = z0 + (z1 - z0) * v
    n = len(samples)
    sv = sum(s[1] for s in samples)
    svv = sum(s[1] * s[1] for s in samples)
    sz = sum(s[4] for s in samples)
    svz = sum(s[1] * s[4] for s in samples)
    det = n * svv - sv * sv
    if abs(det) < 1e-9:
        return None
    slope = (n * svz - sv * sz) / det
    z0 = (sz - slope * sv) / n
    z1 = z0 + slope

    # u: search the head's axis
    du = 1.0 / (2.0 * math.radians(58.0))
    best = None
    for cx in [i * 0.004 for i in range(-20, 21)]:
        for cy in [i * 0.01 for i in range(-48, -8)]:
            err = 0.0
            n2 = 0
            for u, v, x, y, z in samples:
                if u < 0.03 or u > 0.97:
                    continue
                az = math.atan2(x - cx, -(y - cy))
                err += (0.5 + az * du - u) ** 2
                n2 += 1
            if n2 < 20:
                continue
            err /= n2
            if best is None or err < best[0]:
                best = (err, cx, cy)
    if best is None:
        return None
    _, cx, cy = best
    print(f"[face] uv frame cx={cx:.3f} cy={cy:.3f} z0={z0:.3f} z1={z1:.3f} "
          f"(fit err {best[0]:.5f})")
    return cx, cy, z0, z1


def fill_face_holes(objs, z_lo=0.99, rounds=2, mats=("face",)):
    """Close the holes in the face shell.

    Meshy leaves the reconstruction open around the eye sockets, and the face
    shell inherits those holes. A hole is not a shading problem - the
    background shows straight through it, so the eye ends up ringed by grey
    shards that look exactly like debris stuck to the face.

    The holes are closed with more face, not with plain skin: the new faces
    take the UVs of the vertices they are stitched to, so the texture runs
    straight through the patch and the repair is invisible.
    """
    for ob in objs:
        slots = slot_map(ob)
        face = find_slot(slots, "face")
        skin = find_slot(slots, "skin")
        if face is None:
            continue
        targets = {face}
        for key in mats:
            idx = find_slot(slots, key)
            if idx is not None:
                targets.add(idx)
        uvl = ob.data.uv_layers.active
        if uvl is None:
            continue
        frame = _fit_uv_frame(objs, face)
        if frame is None:
            frame = (0.0, -0.30, 1.0, 1.28)
        cx, cy, z0, z1 = frame
        du = 1.0 / (2.0 * math.radians(58.0))
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.edges.ensure_lookup_table()
        bm.faces.ensure_lookup_table()

        # the UV of every vertex that already belongs to the face
        vmap = {}
        for f in bm.faces:
            if f.material_index != face:
                continue
            for loop in f.loops:
                v = loop.vert.index
                if v not in vmap:
                    vmap[v] = tuple(uvl.data[loop.index].uv)

        mark = bm.faces.layers.int.get("polish_mark")
        if mark is None:
            mark = bm.faces.layers.int.new("polish_mark")
        for f in bm.faces:
            f[mark] = 1

        for _ in range(rounds):
            edges = []
            owner = {}
            for e in bm.edges:
                if len(e.link_faces) != 1:
                    continue
                f = e.link_faces[0]
                if f.material_index not in targets:
                    continue
                if e.verts[0].co.z < z_lo and e.verts[1].co.z < z_lo:
                    continue
                edges.append(e)
                owner[e.index] = f.material_index
            if not edges:
                break
            before = len(bm.faces)
            bmesh.ops.holes_fill(bm, edges=edges, sides=0)
            made = len(bm.faces) - before
            if made == 0:
                bmesh.ops.triangle_fill(bm, edges=edges)
                made = len(bm.faces) - before
            if made == 0:
                break
            for f in bm.faces:
                if f[mark] == 1:
                    continue
                f[mark] = 1
                # the patch takes the material of the surface it closes
                mat = face
                for loop in f.loops:
                    for e in loop.edge.link_faces:
                        if e.material_index in targets:
                            mat = e.material_index
                            break
                f.material_index = mat
                if mat != face:
                    continue
                for loop in f.loops:
                    co = loop.vert.co
                    az = math.atan2(co.x - cx, -(co.y - cy))
                    u = 0.5 + az * du
                    u = min(1.0, max(0.0, u))
                    v = (co.z - z0) / max(1e-6, (z1 - z0))
                    v = min(1.0, max(0.0, v))
                    uvl.data[loop.index].uv = (u, v)
            print(f"[face] closed {made} faces")

        try:
            bm.faces.layers.int.remove(mark)
        except (RuntimeError, ReferenceError):
            pass
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()


def deborder_face(objs, layers=1):
    """Send the face shell's outermost ring to plain skin.

    The face shell ends in a torn edge, and that edge curls out of the skull
    like a paper rim - a bright band under the jaw and a row of spikes along
    the cheeks. Plain skin is what is there in the reference, so the rim goes
    back to plain skin.
    """
    for ob in objs:
        slots = slot_map(ob)
        face = find_slot(slots, "face")
        skin = find_slot(slots, "skin")
        if face is None or skin is None:
            continue
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.faces.ensure_lookup_table()
        ring = set()
        for f in bm.faces:
            if f.material_index != face:
                continue
            for e in f.edges:
                if len(e.link_faces) != 1 or e.link_faces[0].material_index != face:
                    ring.add(f)
                    break
        for _ in range(max(0, layers - 1)):
            nxt = set()
            for f in ring:
                for e in f.edges:
                    for g in e.link_faces:
                        if g.material_index == face and g not in ring:
                            nxt.add(g)
            ring |= nxt
        for f in ring:
            f.material_index = skin
        print(f"[face] sent {len(ring)} rim faces to skin")
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()


def even_face_texture(objs, v_lo=0.17, u_edge=0.06, lo=0.55, hi=0.92):
    """Flatten the neck shadow and the side hair out of the face texture.

    The face texture is the reference photo, so its bottom edge is the
    reference's neck in shadow and its left and right edges are the
    reference's side hair. On the model those land on the jaw and the
    temples, and they show up as a dark band under the chin and a row of
    bright spikes along the cheeks. Flatten both borders to plain skin.
    """
    import numpy as np

    face_mat = None
    for ob in objs:
        for s in ob.material_slots:
            if s.material and s.material.name.lower().startswith("face"):
                face_mat = s.material
                break
        if face_mat:
            break
    if face_mat is None:
        return 0
    tex = None
    for n in face_mat.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image:
            tex = n
            break
    if tex is None:
        return 0

    img = tex.image
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    px = buf.reshape(h, w, 4)[::-1]
    rgb = px[:, :, :3].copy()

    luma = (rgb[:, :, 0] * 0.2126 + rgb[:, :, 1] * 0.7152
            + rgb[:, :, 2] * 0.0722)
    skin = rgb[(luma > 0.60) & (luma < 0.92)]
    if skin.size == 0:
        return 0
    skin_col = np.median(skin, axis=0)

    rows = int(h * v_lo)
    cols = int(w * u_edge)
    bad = np.zeros((h, w), bool)
    bad[h - rows:, :] = luma[h - rows:, :] < lo
    bad[:, :cols] |= luma[:, :cols] < lo
    bad[:, w - cols:] |= luma[:, w - cols:] < lo
    bright = np.zeros((h, w), bool)
    bright[h - rows:, :] = luma[h - rows:, :] > hi
    bright[:, :cols] |= luma[:, :cols] > hi
    bright[:, w - cols:] |= luma[:, w - cols:] > hi
    bad |= bright
    if not bad.any():
        return 0
    rgb[bad] = skin_col

    px[:, :, :3] = rgb
    img.pixels.foreach_set(np.ascontiguousarray(px[::-1]).ravel())
    img.update()
    img.pack()
    print(f"[texture] flattened {int(bad.sum())} border pixels to skin "
          f"{skin_col.round(3)}")
    return int(bad.sum())


def fold_skin_into_face(objs, z_lo=1.0, nx=320, nz=320):
    """Send the skin faces that poke into the face back to the face.

    The face shell's silhouette is torn, and the reconstruction left slivers
    of skin standing inside it. They are lit like skin and stand out of the
    painted face as pale spikes along the cheeks and the temples. Re-labelling
    them as face puts them back under the same texture as the rest of the
    face.
    """
    from mathutils.bvhtree import BVHTree

    for ob in objs:
        slots = slot_map(ob)
        face = find_slot(slots, "face")
        skin = find_slot(slots, "skin")
        if face is None or skin is None:
            continue
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.faces.ensure_lookup_table()
        bm.verts.ensure_lookup_table()
        verts = [v.co.copy() for v in bm.verts]
        polys = [tuple(v.index for v in f.verts) for f in bm.faces]
        bvh = BVHTree.FromPolygons(verts, polys, all_triangles=False)

        lo, hi = world_bounds([ob])
        x0, x1 = lo.x, hi.x
        z0, z1 = lo.z, hi.z
        inside = np.zeros((nz, nx), dtype=bool)
        for iz in range(nz):
            z = z0 + (iz / (nz - 1.0)) * (z1 - z0)
            for ix in range(nx):
                x = x0 + (ix / (nx - 1.0)) * (x1 - x0)
                origin = Vector((x, lo.y - 1.0, z))
                direction = Vector((0.0, 1.0, 0.0))
                for _ in range(12):
                    hit = bvh.ray_cast(origin, direction, 20.0)
                    if hit[0] is None:
                        break
                    fi = hit[2]
                    if fi is not None and fi < len(bm.faces) \
                            and bm.faces[fi].material_index == face:
                        inside[iz, ix] = True
                        break
                    origin = hit[0] + direction * 0.002

        n = 0
        for f in bm.faces:
            if f.material_index != skin:
                continue
            c = f.calc_center_median()
            if c.z < z_lo:
                continue
            ix = int((c.x - x0) / (x1 - x0) * (nx - 1))
            iz = int((c.z - z0) / (z1 - z0) * (nz - 1))
            if not (0 <= ix < nx and 0 <= iz < nz):
                continue
            if inside[iz, ix]:
                f.material_index = face
                n += 1
        print(f"[face] folded {n} skin slivers back into the face")
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()


def drop_inward_faces(objs, center, z_lo=1.0):
    """Delete the face material that has curled back into the skull.

    The face shell is torn, and the torn edges fold inwards. A face that
    points at the head's axis is one of those folds: it samples the texture
    at a grazing angle, so the dark of the eye's lash is what shows. Around
    the eye sockets that reads as a ring of black sawteeth, and under the jaw
    the same folds make a flat plate with the photo's neck banding across it.

    A face that points away from the axis is the outside of the head and
    stays.
    """
    cx, cy, cz = center
    for ob in objs:
        slots = slot_map(ob)
        face = find_slot(slots, "face")
        if face is None:
            continue
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.faces.ensure_lookup_table()
        kill = []
        for f in bm.faces:
            if f.material_index != face:
                continue
            c = f.calc_center_median()
            if c.z < z_lo:
                continue
            d = Vector((c.x - cx, c.y - cy, (c.z - cz) * 0.4))
            if d.length < 1e-6:
                continue
            if f.normal.dot(d.normalized()) < 0.0:
                kill.append(f)
        print(f"[face] dropped {len(kill)} inward curling faces")
        if kill:
            bmesh.ops.delete(bm, geom=kill, context="FACES")
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()


def _face_slot(objs):
    """The (object, slot) that holds the face texture."""
    for ob in objs:
        for i, s in enumerate(ob.material_slots):
            if s.material and s.material.name.lower() == "face":
                return ob, i
    return None, None


def _shell_uv(co, cx, cy, z0, z1):
    """UV of a point in the shell's cylindrical frame."""
    du = 1.0 / (2.0 * math.radians(58.0))
    az = math.atan2(co.x - cx, -(co.y - cy))
    u = min(1.0, max(0.0, 0.5 + az * du))
    v = min(1.0, max(0.0, (co.z - z0) / max(1e-6, (z1 - z0))))
    return (u, v)


def close_face_shell(objs, grow=0, rounds=3, max_new=1200,
                     z_lo=1.02, z_hi=1.31, x_max=0.27, absorb_mats=("skin",)):
    """Close the face shell over the eye sockets and the mouth.

    The shell is a separate piece of skin laid over the head, and the head has
    deep sockets where the eyes and the mouth go.  The pipeline cut the shell
    along those sockets, and the cut follows the triangles, so every socket is
    ringed by sawteeth.  Through the teeth you see the eyeball underneath,
    which is why the eyes come out ringed with bright shards.

    Two steps fix it.  First the faces that touch the shell are pulled into
    the shell, so the eyeball and the lips become part of the painted face.
    Then whatever is still open is closed with more shell.  The fill is limited
    to the face area, otherwise it runs away into the open hair sheet.

    Only skin is absorbed: hair that touches the shell is a side lock of the
    fringe and has to stay hair.
    """
    ob, fs = _face_slot(objs)
    if ob is None:
        return
    frame = _fit_uv_frame(objs, fs)
    if frame is None:
        frame = (0.0, -0.310, 1.001, 1.281)
    cx, cy, z0, z1 = frame
    want_mats = {find_slot(slot_map(o), k) for o in objs for k in absorb_mats}
    want_mats.discard(None)

    # --- faces that touch the shell but are not it
    picked = {}
    for o in objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.faces.ensure_lookup_table()
        ring = set()
        for f in bm.faces:
            if f.material_index != fs:
                continue
            for e in f.edges:
                for g in e.link_faces:
                    if g.material_index != fs and g.material_index in want_mats:
                        ring.add(g)
        for _ in range(grow):
            nxt = set()
            for f in ring:
                for e in f.edges:
                    for g in e.link_faces:
                        if (g.material_index != fs
                                and g.material_index in want_mats
                                and g not in ring):
                            nxt.add(g)
            ring |= nxt
        picked[o.name] = {f.index for f in ring}
        bm.free()

    absorbed = 0
    for o in objs:
        want = picked.get(o.name, set())
        if not want:
            continue
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.faces.ensure_lookup_table()
        for f in bm.faces:
            if f.index in want:
                f.material_index = fs
        bm.to_mesh(o.data)
        bm.free()
        o.data.update()
        absorbed += len(want)
        uvl = o.data.uv_layers.active
        if uvl is None:
            continue
        for p in o.data.polygons:
            if p.index not in want:
                continue
            for li in p.loop_indices:
                co = o.data.vertices[o.data.loops[li].vertex_index].co
                uvl.data[li].uv = _shell_uv(co, cx, cy, z0, z1)
    print(f"[shell] absorbed {absorbed} faces into the face shell")

    # --- close what is still open, inside the face only
    for o in objs:
        if not any(s.material and s.material.name.lower() == "face"
                   for s in o.material_slots):
            continue
        if o.data.uv_layers.active is None:
            continue
        for _ in range(rounds):
            bm = bmesh.new()
            bm.from_mesh(o.data)
            bm.faces.ensure_lookup_table()
            edges = []
            for e in bm.edges:
                if len(e.link_faces) != 1:
                    continue
                f = e.link_faces[0]
                if f.material_index != fs:
                    continue
                zs = [v.co.z for v in e.verts]
                xs = [abs(v.co.x) for v in e.verts]
                if min(zs) < z_lo or max(zs) > z_hi:
                    continue
                if max(xs) > x_max:
                    continue
                edges.append(e)
            if not edges:
                bm.free()
                break
            before = len(bm.faces)
            bmesh.ops.holes_fill(bm, edges=edges, sides=0)
            made = len(bm.faces) - before
            if made == 0:
                bmesh.ops.triangle_fill(bm, edges=edges)
                made = len(bm.faces) - before
            if made == 0 or made > max_new:
                print(f"[shell] refused a fill of {made} faces")
                bm.free()
                break
            newfaces = [f for f in bm.faces if f.index >= before]
            outside = 0
            for f in newfaces:
                c = f.calc_center_median()
                if not (z_lo <= c.z <= z_hi and abs(c.x) <= x_max):
                    outside += 1
            if outside:
                print(f"[shell] {outside} new faces fell outside the face")
                bm.free()
                break
            for f in newfaces:
                f.material_index = fs
            bm.to_mesh(o.data)
            bm.free()
            o.data.update()
            uvl = o.data.uv_layers.active
            for p in o.data.polygons:
                if p.index < before:
                    continue
                for li in p.loop_indices:
                    co = o.data.vertices[o.data.loops[li].vertex_index].co
                    uvl.data[li].uv = _shell_uv(co, cx, cy, z0, z1)
            o.data.update()
            print(f"[shell] closed {made} faces")


def deborder_jaw(objs, z_cut=1.035, x_keep=0.0):
    """Cut the face shell's bottom rim off the jaw.

    The shell wraps around the sides of the head, and where it turns under the
    jaw its surface is nearly edge-on to the camera.  The texture is squeezed
    into horizontal bands there and the silhouette is ragged, so the jaw ends
    in a stack of white slats.  The middle of the rim is kept, because that is
    where the shell meets the neck.
    """
    ob, fs = _face_slot(objs)
    if ob is None:
        return
    doomed = []
    for f in ob.data.polygons:
        if f.material_index != fs:
            continue
        c = f.center
        if c.z < z_cut and abs(c.x) > x_keep:
            doomed.append(f)
    if doomed:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.faces.ensure_lookup_table()
        idx = {f.index for f in doomed}
        kill = [f for f in bm.faces if f.index in idx]
        bmesh.ops.delete(bm, geom=kill, context="FACES")
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
    print(f"[jaw] cut {len(doomed)} shell faces off the bottom rim")


def smooth_shell_border(objs, rounds=4, factor=0.35):
    """Round off the sawtooth along the face shell's outer edge.

    The shell is cut to the head's silhouette, and the cut follows the
    triangles, so its border is a row of sawteeth.  Where skin shows between
    the teeth the border reads as a torn edge.  Smoothing the border vertices
    along the surface turns the sawtooth back into a curve without moving the
    shell off the head or opening a hole in it.
    """
    ob, fs = _face_slot(objs)
    if ob is None:
        return
    for o in objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.faces.ensure_lookup_table()
        bm.edges.ensure_lookup_table()
        bm.verts.ensure_lookup_table()
        for _ in range(rounds):
            bverts = set()
            for e in bm.edges:
                if len(e.link_faces) == 1 and e.link_faces[0].material_index == fs:
                    bverts.update(e.verts)
            if not bverts:
                break
            bmesh.ops.smooth_vert(bm, verts=list(bverts), factor=factor,
                                  use_axis_x=True, use_axis_y=True,
                                  use_axis_z=True)
        bm.to_mesh(o.data)
        bm.free()
        o.data.update()
    print(f"[border] smoothed the shell's outer edge")


def drop_jaw_plug(objs, names=("jawplug",)):
    """Throw the jaw plug away.

    It is a separate blade of skin that sits in front of the neck.  Seen from
    the front it reads as a bright sliver under the chin, and from the side it
    juts out like a knife.  The neck closes on its own once the face shell
    covers the jaw, so the plug only ever gets in the way.
    """
    gone = 0
    for ob in list(objs):
        if ob.name.strip().lower() in names:
            name = ob.name
            bpy.data.objects.remove(ob, do_unlink=True)
            if ob in objs:
                objs.remove(ob)
            gone += 1
            print(f"[plug] removed {name}")
    return gone


def reskin_jaw(objs, z_cut=1.06):
    """Give the shell's bottom rim back to the skin.

    close_face_shell() pulls the skin that touches the shell into the shell,
    so the chin ends up wearing the face texture.  The texture is unwrapped
    cylindrically, so its bottom edge is squeezed into a row of near-vertical
    slivers, and the jaw reads as a bright row of teeth under the chin.  The
    jaw is not part of the face - put the skin back on it and it joins the
    neck again.
    """
    ob, fs = _face_slot(objs)
    if ob is None:
        return 0
    ss = find_slot(slot_map(ob), "skin")
    if ss is None:
        return 0
    n = 0
    for p in ob.data.polygons:
        if p.material_index == fs and p.center.z < z_cut:
            p.material_index = ss
            n += 1
    ob.data.update()
    print(f"[jaw] gave {n} shell faces on the chin back to the skin")
    return n


def polish_face_only(objs, lo, hi, z_cut=1.24, near_eps=0.012):
    """The face-only pass, for a build that already looks right everywhere else.

    Four things and nothing else:

    - close the holes in the face shell, so the background stops showing
      through the face
    - cut the hair that lies against the face and the strands that hang
      across the eyes, both of which shred into sawteeth
    - flatten the neck shadow and the side hair out of the borders of the
      face texture, so the jaw is not a dark band
    - drop the face material that has curled back into the skull

    The hair is cut twice, and the order matters.  The first pass runs while
    the shell still has its eye sockets open, so the front-projection test
    cannot tell that the sockets are still "face" and the strands hanging
    over the eyes survive.  The second pass runs after the shell is closed,
    when every column in front of the eyes really does land on face
    material, and that is the pass that takes the sawtooth off the forehead.
    """
    drop_jaw_plug(objs)
    repaint_face_painted(objs, lo, hi)
    fill_face_holes(objs, rounds=4)
    trim_hair_over_face(objs, lo, hi, z_cut=z_cut, near_eps=near_eps)
    close_face_shell(objs)
    trim_hair_over_face(objs, lo, hi, z_cut=z_cut, near_eps=near_eps)
    even_face_texture(objs)
    drop_inward_faces(objs, (0.0, -0.310, 1.14))
    smooth_shell_border(objs, rounds=8, factor=0.42)
    deborder_jaw(objs)
    reskin_jaw(objs)


def tune_materials(objs):
    """Make the hair read as black lacquer instead of grey felt.

    A near-black base colour under a bright studio environment plus a strong
    clearcoat comes back mid-grey on the page. Dropping the coat and roughening
    the surface keeps the specular highlight but kills the grey sheen.
    """
    for ob in objs:
        for s in ob.material_slots:
            mat = s.material
            if not mat or not mat.use_nodes:
                continue
            name = mat.name.lower()
            if not name.startswith("hair"):
                continue
            b = mat.node_tree.nodes.get("Principled BSDF")
            if not b:
                continue
            if "Coat Weight" in b.inputs:
                b.inputs["Coat Weight"].default_value = 0.06
            if "Roughness" in b.inputs:
                b.inputs["Roughness"].default_value = 0.48
            # The page renders under model-viewer's studio environment, and a
            # near-black base colour with a strong specular lobe just mirrors
            # that environment back as silver. Dropping the specular factor
            # keeps the highlight without turning the hair grey.
            if "Specular IOR Level" in b.inputs:
                b.inputs["Specular IOR Level"].default_value = 0.12
            print(f"[mat] {mat.name}: coat 0.06 roughness 0.48 specular 0.12")


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
    floor.data.materials.append(
        bpy.data.materials.new("FloorMat"))

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
    for name, loc in {
            "front": (0.0, -4.10, 1.12),
            "three_quarter": (2.70, -3.00, 1.45),
    }.items():
        cam.location = loc
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        bpy.context.scene.render.filepath = os.path.join(OUT, f"polish_{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"[render] polish_{name}.png")

    cam.data.lens = 85
    head = Vector((0.0, -0.25, 1.15))
    cam.location = (0.0, -2.62, 1.15)
    cam.rotation_euler = (head - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.render.filepath = os.path.join(OUT, "polish_head.png")
    bpy.ops.render.render(write_still=True)
    print("[render] polish_head.png")

    cam.data.lens = 100
    waist = Vector((0.0, -0.10, 0.72))
    cam.location = (0.0, -1.85, 0.80)
    cam.rotation_euler = (waist - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.render.filepath = os.path.join(OUT, "polish_waist.png")
    bpy.ops.render.render(write_still=True)
    print("[render] polish_waist.png")


def main():
    purge()
    if SRC.lower().endswith(".blend"):
        bpy.ops.wm.open_mainfile(filepath=SRC)
    else:
        bpy.ops.import_scene.gltf(filepath=SRC)
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    print(f"[load] {os.path.basename(SRC)}: {len(objs)} meshes, "
          f"{sum(len(o.data.polygons) for o in objs)} faces")

    bpy.ops.object.select_all(action="DESELECT")
    for ob in objs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    lo, hi = world_bounds(objs)
    probe(objs, lo, hi)

    trim_tee_hem(objs, lo, hi)
    clean_seams(objs, lo, hi)
    flatten_waist_edge(objs, lo, hi)
    drop_floating_shards(objs, lo, hi)
    tuck_fringe_behind_brow(objs, lo, hi)
    tuck_front_edges(objs, lo, hi)
    # clean_head_slab is NOT called on the full resolution base model. It was
    # written for the low resolution one, where Meshy left flat headphone
    # slabs beside the cheeks; on the new base those patches are already
    # hair, and re-labelling them only scatters black shards over the cheek.
    # trim_face_edges below does the useful half of the job instead.
    # cut_fringe is NOT called: the pipeline already lifts the fringe clear of
    # the eyes (the hairline now sits at z 1.31 of a 1.8 tall model), and
    # cutting on top of that only leaves a ragged edge behind.
    slim_hair(objs, lo, hi)
    # the face texture is the reference photo wrapped onto the skull, so the
    # photo's own hair rides along with it and lands on the forehead and the
    # cheeks; and the reconstruction is open around the eye sockets, so the
    # background shows straight through the face
    clean_face_texture(objs, threshold=0.50)
    fill_face_holes(objs, rounds=4)
    trim_hair_over_face(objs, lo, hi, z_cut=1.24, near_eps=0.012)
    tune_materials(objs)
    # the tartan only exists as a procedural node graph, and glTF cannot
    # carry that - bake it into a real image texture, unless the pipeline
    # already did it
    if plaid_has_texture():
        print("[plaid] sash already carries a baked texture - leaving it alone")
    else:
        separate_by_material()
        apply_plaid_texture()
    # trim_face_edges is NOT called on the full resolution base model. It was
    # written for the low resolution one, whose face texture was a cut-out
    # with a white margin, so the faces clamped onto that margin showed up
    # as white flecks. The new texture's margin is already skin coloured, so
    # re-labelling those faces only chops the cheek into loose patches.

    for ob in objs:
        for p in ob.data.polygons:
            p.use_smooth = True

    bpy.ops.export_scene.gltf(filepath=DST, export_format="GLB",
                              use_selection=False, export_apply=True,
                              export_yup=True,
                              # 180k triangles of smooth geometry is 9.6 MB as raw
                              # float attributes and ~1.6 MB with Draco. model-viewer
                              # decodes Draco natively.
                              export_draco_mesh_compression_enable=True,
                              export_draco_mesh_compression_level=6)
    tris = 0
    for ob in bpy.data.objects:
        if ob.type == "MESH":
            ob.data.calc_loop_triangles()
            tris += len(ob.data.loop_triangles)
    print(f"[done] tris={tris} out={DST} size={os.path.getsize(DST)}")

    render_views(setup_scene())


if __name__ == "__main__":
    main()
