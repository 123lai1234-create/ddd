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
    pointing at each other, and between them they read as a torn edge. Both
    sides of that row are clamped onto the seam plane, so the tee's hem ends
    in a straight line and the sash starts from it.

    Only the middle of the body is touched - the arms hang in the same height
    band and must keep their sleeve.
    """
    H = hi.z - lo.z
    plane = lo.z + plane_f * H
    lo_z = plane - band * H
    hi_z = plane + band * H
    moved = 0
    for ob in objs:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        for v in bm.verts:
            if abs(v.co.x) > 0.225:
                continue
            if lo_z <= v.co.z <= hi_z:
                v.co.z = plane
                moved += 1
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
    print(f"[waist] clamped {moved} verts to z={plane:.3f}")


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
                b.inputs["Coat Weight"].default_value = 0.12
            if "Roughness" in b.inputs:
                b.inputs["Roughness"].default_value = 0.42
            print(f"[mat] {mat.name}: coat 0.12 roughness 0.42")


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
    clean_head_slab(objs, lo, hi)
    # cut_fringe is NOT called: the pipeline already lifts the fringe clear of
    # the eyes (the hairline now sits at z 1.31 of a 1.8 tall model), and
    # cutting on top of that only leaves a ragged edge behind.
    slim_hair(objs, lo, hi)
    tune_materials(objs)

    for ob in objs:
        for p in ob.data.polygons:
            p.use_smooth = True

    bpy.ops.export_scene.gltf(filepath=DST, export_format="GLB",
                              use_selection=False, export_apply=True,
                              export_yup=True)
    tris = 0
    for ob in bpy.data.objects:
        if ob.type == "MESH":
            ob.data.calc_loop_triangles()
            tris += len(ob.data.loop_triangles)
    print(f"[done] tris={tris} out={DST} size={os.path.getsize(DST)}")

    render_views(setup_scene())


main()
