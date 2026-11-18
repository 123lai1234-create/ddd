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

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import face_texture
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

_DEFAULT_SRC = r"C:\Users\User\minimax-glb-tmp\chibi-tinted-full.glb"
# Override with CHIBI_SRC to point at a different base mesh.
#
# Use the FULL resolution export. chibi-tinted-low.glb is the same character
# decimated to 24k triangles, and that reduction is what wrecked the hair:
# Meshy's locks are rounded tubes, and collapsing them that hard leaves flat
# angular shards - nothing like the reference. The full mesh has the
# reference's rounded locks and real eye sockets.
#
# Worth knowing before you re-export: the base has NO texture at all
# (0 images, no UVs, only POSITION/NORMAL and one flat baseColorFactor),
# which is the only reason this script paints the face from the reference
# photo rather than reusing a baseColorTexture.
SRC = os.environ.get("CHIBI_SRC", _DEFAULT_SRC)
SRC_LOW = _DEFAULT_SRC

# When set, the head texture is the reference photo projected onto the skull
# instead of hand-painted features - the reference already contains the artwork,
# so its pixels beat anything drawn from scratch. Set CHIBI_FACE="" to go back
# to the painted version.
REF_FACE = os.environ.get(
    "CHIBI_FACE", os.path.join(HERE, "ref", "chibi-ref-meshy.png"))

TARGET_H = 1.8
TARGET_TRIS = 180000
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
                  coat=0.0, emission=0.0, specular=0.5):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    b = mat.node_tree.nodes["Principled BSDF"]
    set_input(b, "Base Color", (*color, 1.0))
    set_input(b, "Roughness", roughness)
    set_input(b, "Metallic", metallic)
    set_input(b, "Specular IOR Level", specular)
    if subsurface:
        set_input(b, "Subsurface Weight", subsurface)
        set_input(b, "Subsurface Radius", (0.34, 0.11, 0.07))
    if coat:
        set_input(b, "Coat Weight", coat)
    if emission:
        set_input(b, "Emission Color", (*color, 1.0))
        set_input(b, "Emission Strength", emission)
    return mat


def _box_blur(a, r):
    """Box blur with a radius of r cells, separable and edge-padded."""
    k = 2 * r + 1
    p = np.pad(a, ((r, r), (r, r)), mode="edge")
    c = np.cumsum(p, axis=0)
    c = np.vstack([np.zeros((1, c.shape[1])), c])
    a1 = (c[k:, :] - c[:-k, :]) / k
    c = np.cumsum(a1, axis=1)
    c = np.hstack([np.zeros((c.shape[0], 1)), c])
    return (c[:, k:] - c[:, :-k]) / k


def _median_filter(a, k):
    pad = np.pad(a, k // 2, mode="edge")
    win = np.lib.stride_tricks.sliding_window_view(pad, (k, k))
    return np.median(win, axis=(-2, -1))


def _max_filter(a, k):
    pad = np.pad(a, k // 2, mode="edge")
    win = np.lib.stride_tricks.sliding_window_view(pad, (k, k))
    return win.max(axis=(-2, -1))


def _min_filter(a, k):
    pad = np.pad(a, k // 2, mode="edge")
    win = np.lib.stride_tricks.sliding_window_view(pad, (k, k))
    return win.min(axis=(-2, -1))


def face_dome(objs, m, x_half=0.26, step=0.005, z_lo=1.085, z_hi=1.285,
              tol=0.004):
    """The smooth dome the face would have if its features were not there.

    The face is sampled by casting rays at it onto a grid. A first median
    filter finds the eye sockets - they are the only deep depressions, and a
    median ignores them - and then the dome is built from everything that is
    *not* a socket, by a normalised box blur. That is a local estimate, which
    matters: a single polynomial fitted over the whole face is hopeless,
    because the head is much wider than it is deep and the two ends of the
    band pull the fit somewhere no part of the face ever was.
    """
    nx = int(2 * x_half / step) + 1
    nz = int((z_hi - z_lo) / step) + 1
    Y = np.full((nz, nx), np.nan, dtype=np.float64)
    for j in range(nz):
        z = z_lo + j * step
        for i in range(nx):
            x = -x_half + i * step
            h = face_hit(objs, x, z)
            if h is None:
                continue
            # A ray that comes back from behind the head has fallen through
            # a hole in the skin.
            if h[0].y > -0.30:
                continue
            Y[j, i] = h[0].y

    good = ~np.isnan(Y)
    if good.sum() < 50:
        return None
    # fill the holes in the grid so the filters have something to work with
    idx = np.arange(nx)
    for j in range(nz):
        row = good[j]
        if not row.any():
            continue
        Y[j] = np.interp(idx, idx[row], Y[j][row])
    for i in range(nx):
        col = good[:, i]
        if not col.any():
            continue
        zidx = np.arange(nz)
        Y[:, i] = np.interp(zidx, zidx[col], Y[:, i][col])

    # The eye sockets are pits, and the face is convex. A morphological
    # closing - the maximum over a window, then the minimum of that - fills
    # the pits that are smaller than its window and leaves the bumps alone,
    # so the difference between the face and its closing is negative exactly
    # where the sockets are. Plain depth will not do it: on a convex surface
    # every point reads as "recessed" relative to the far side of the window,
    # and the middle of the face comes out as one enormous socket.
    k = 25
    closed = _min_filter(_max_filter(Y, k), k)
    pits = (closed - Y) > 0.010
    j_lo = max(0, int((1.09 - z_lo) / step) - 2)
    j_hi = min(pits.shape[0], int((1.29 - z_lo) / step) + 3)
    pits[:j_lo] = False
    pits[j_hi:] = False
    cols = int(0.05 / step)
    pits[:, :cols] = False
    pits[:, -cols:] = False

    # The rim of the socket stands proud of the dome, so it is not a pit -
    # but it sits right against one, and growing the pit by a couple of
    # millimetres picks it up.
    feature = _max_filter(pits.astype(np.float64), 9) > 0.5

    # The dome is the face with the sockets taken out, by a normalised
    # blur: only the cells that are not socket contribute, so the dome
    # follows the face around the eye and not across it.
    solid = ~feature
    num = _box_blur(np.where(solid, Y, 0.0), 8)
    den = _box_blur(solid.astype(np.float64), 8)
    dome = num / np.maximum(den, 1e-9)

    seen = np.zeros_like(pits)
    clusters = []
    for j0 in range(pits.shape[0]):
        for i0 in range(pits.shape[1]):
            if not pits[j0, i0] or seen[j0, i0]:
                continue
            stack = [(j0, i0)]
            seen[j0, i0] = True
            cells = []
            while stack:
                j, i = stack.pop()
                cells.append((j, i))
                for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    jj, ii = j + dj, i + di
                    if (0 <= jj < pits.shape[0] and 0 <= ii < pits.shape[1]
                            and pits[jj, ii] and not seen[jj, ii]):
                        seen[jj, ii] = True
                        stack.append((jj, ii))
            if len(cells) >= 15:
                clusters.append(cells)

    sockets = []
    for cells in clusters:
        jj = np.array([c[0] for c in cells])
        ii = np.array([c[1] for c in cells])
        sockets.append((float(-x_half + ii.mean() * step),
                        float(z_lo + jj.mean() * step),
                        float((closed - Y)[jj, ii].sum()), len(cells)))
    sockets.sort(key=lambda s: -s[2])
    print("[face] sockets:", [(round(s[0], 3), round(s[1], 3), s[3])
                              for s in sockets[:4]])

    return {"Y": Y, "dome": dome, "mask": feature, "sockets": sockets[:4],
            "x_half": x_half, "z_lo": z_lo, "step": step,
            "nx": nx, "nz": nz}


def dome_y(dome, x, z):
    """Sample the dome's depth at (x, z)."""
    fx = (x + dome["x_half"]) / dome["step"]
    fz = (z - dome["z_lo"]) / dome["step"]
    i = int(np.clip(fx, 0, dome["nx"] - 1))
    j = int(np.clip(fz, 0, dome["nz"] - 1))
    return float(dome["dome"][j, i])


def dome_mask_at(dome, x, z):
    """Is (x, z) inside one of the detected eye sockets?"""
    fx = (x + dome["x_half"]) / dome["step"]
    fz = (z - dome["z_lo"]) / dome["step"]
    i = int(np.clip(fx, 0, dome["nx"] - 1))
    j = int(np.clip(fz, 0, dome["nz"] - 1))
    return bool(dome["mask"][j, i])


def flatten_face_features(objs, m, half_width=0.205, nose=None, tol=0.004,
                          fill_only=False, max_loop=500):
    """Take the face back to the smooth dome the reference has.

    The reference's face is a painted dome: the eyes, the brows, the nose and
    the mouth are all artwork on one smooth surface. Meshy rebuilt the eyes
    as a flat plate sitting in a raised rim, and left the rim and the mouth
    as real geometry, so the projected photo lands on top of a second set of
    features - the socket rim arcs around the painted eye and the mouth slit
    cuts across the painted smile.

    Smoothing the face was tried first and does not work here. This mesh is a
    soup - 45k separate shells with 240k open edges - and a Laplacian pass
    over it tears the head apart long before it flattens anything. Pulling
    the outliers onto a fitted dome does not iterate and cannot tear.

    The cracks the sockets left in the skin are closed first: Meshy failed to
    weld them and the unfilled gaps show the inside of the head as black
    specks.
    """
    import bmesh

    z0, z1 = m["z0"], m["z1"]
    slots = (ORDER.index("skin"), ORDER.index("face"))
    nz = nose[1] if nose else None
    nr = nose[2] if nose else 0.0

    def is_nose(c):
        return (nz is not None and abs(c.x) < nr * 0.80
                and abs(c.z - nz) < nr * 0.70)

    dome = None
    if not fill_only:
        dome = face_dome(objs, m)
        if dome is None:
            print("[face] no depth grid, face untouched")
            return

    for ob in objs:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.verts.ensure_lookup_table()
        bm.faces.ensure_lookup_table()

        def in_face(c):
            return (z0 - 0.012 <= c.z <= z1 + 0.012
                    and abs(c.x) <= half_width)

        # ---- 1. close the cracks the eye sockets left in the skin
        boundary = [e for e in bm.edges
                    if len(e.link_faces) == 1
                    and in_face((e.verts[0].co + e.verts[1].co) * 0.5)]
        by_vert = {}
        for e in boundary:
            for v in e.verts:
                by_vert.setdefault(v, []).append(e)
        seen = set()
        loops = []
        for e in boundary:
            if e in seen:
                continue
            chain, stack = [], [e]
            seen.add(e)
            verts = set()
            while stack:
                cur = stack.pop()
                chain.append(cur)
                verts.update(cur.verts)
                for v in cur.verts:
                    for nb in by_vert[v]:
                        if nb is cur or nb in seen:
                            continue
                        seen.add(nb)
                        stack.append(nb)
            # The socket rims come out as long open chains rather than tidy
            # loops - a crack where the mesh was never welded. A chain that
            # is closed everywhere but at a handful of vertices is still a
            # crack that can be filled.
            tight = sum(1 for v in verts if len(by_vert[v]) == 2)
            closed = tight >= 0.9 * len(verts)
            if not closed or len(chain) < 3 or len(chain) > max_loop:
                continue
            xs = [v.co.x for v in verts]
            ys = [v.co.y for v in verts]
            zs = [v.co.z for v in verts]
            # A chain that runs along the edge of the face is not a crack in
            # the skin - it is the gap between the face and the hair, and
            # filling that welds the head shut.
            if (max(xs) - min(xs) > 0.135 or max(zs) - min(zs) > 0.135
                    or max(ys) - min(ys) > 0.135):
                continue
            loops.extend(chain)
        if loops:
            before = set(bm.faces)
            bmesh.ops.holes_fill(bm, edges=loops, sides=0)
            # The n-gons that come back can face into the head, and a face
            # whose normal points the wrong way renders black. That is what
            # the black cracks around the eyes turned out to be.
            fresh = [f for f in bm.faces if f not in before]
            if fresh:
                bmesh.ops.recalc_face_normals(bm, faces=fresh)

        # ---- 1b. stitch the slit around the eye sockets
        #
        # The sockets are not closed rings of holes but long open chains of
        # boundary edges, and a chain cannot be filled - it has to be
        # stitched to the edge on the other side of the gap. Blender's
        # bridge_loops pairs the chains up and lays a strip of quads across.
        stitch = []
        for e in bm.edges:
            if len(e.link_faces) != 1:
                continue
            c = (e.verts[0].co + e.verts[1].co) * 0.5
            if not (1.105 <= c.z <= 1.285 and 0.045 <= abs(c.x) <= 0.225
                    and c.y < -0.515):
                continue
            stitch.append(e)
        if len(stitch) >= 6:
            try:
                bmesh.ops.bridge_loops(bm, edges=stitch, use_pairs=True,
                                       use_cyclic=False)
                print(f"[face] stitched {len(stitch)} edges across the sockets")
            except (RuntimeError, TypeError) as exc:
                print(f"[face] stitch failed: {exc}")

        # ---- 2. the face patch
        pf = set()
        for f in bm.faces:
            if f.material_index not in slots:
                continue
            if not in_face(f.calc_center_median()):
                continue
            pf.add(f)
        if len(pf) < 50:
            bm.free()
            continue
        patch = set()
        for f in pf:
            patch.update(f.verts)

        if fill_only:
            bm.to_mesh(ob.data)
            bm.free()
            ob.data.update()
            print(f"[face] filled {len(loops)} hole edges, "
                  f"{len(patch)} patch verts, no flattening")
            continue

        # ---- 3. pull the socket outliers onto the dome
        moved = 0
        for v in patch:
            c = v.co
            if is_nose(c):
                continue
            if not dome_mask_at(dome, c.x, c.z):
                continue
            d = c.y - dome_y(dome, c.x, c.z)
            if abs(d) <= tol:
                continue
            # ease the last millimetre so the rim does not leave a crease
            t = min(1.0, (abs(d) - tol) / (2.0 * tol))
            v.co.y -= d * t
            moved += 1

        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
        print(f"[face] flattened {moved} of {len(patch)} verts onto the dome, "
              f"{len(loops)} hole edges closed")


def smooth_socket_surface(objs, m, x_lo=0.055, x_hi=0.260, z_lo=1.100,
                          z_hi=1.285, iterations=6, factor=0.35):
    """Take the sawtooth out of the surface around the eye sockets.

    Meshy rebuilt the sockets as a corrugated sheet: the surface ripples, and
    the ripple is fine enough that the azimuth - and with it the texture's
    horizontal coordinate - swings back and forth from one row to the next.
    The texture then lands on it smeared into horizontal bands, which is the
    venetian blind across the right eye.

    A few gentle passes of smoothing are enough to take the teeth out. It has
    to stay gentle: the whole head is a soup of 45k separate shells, and a
    Laplacian pass over all of it tears the head apart. This touches a few
    hundred vertices near the eyes and nothing else.
    """
    import bmesh

    slots = (ORDER.index("skin"), ORDER.index("face"))

    for ob in objs:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.verts.ensure_lookup_table()
        bm.faces.ensure_lookup_table()

        target = set()
        for f in bm.faces:
            if f.material_index not in slots:
                continue
            c = f.calc_center_median()
            if not (z_lo <= c.z <= z_hi):
                continue
            if not (x_lo <= abs(c.x) <= x_hi):
                continue
            target.update(f.verts)
        if len(target) < 20:
            bm.free()
            continue

        for _ in range(iterations):
            bmesh.ops.smooth_vert(bm, verts=list(target), factor=factor,
                                  use_axis_x=True, use_axis_y=True,
                                  use_axis_z=True)

        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
        print(f"[face] smoothed {len(target)} verts around the sockets")


def remove_degenerate_faces(objs, slots=None, area_frac=0.02):
    """Delete the sliver faces Meshy left on the face.

    The reconstruction is full of them - thousands of triangles that are a
    few thousandths of the size of their neighbours, and a few of them
    collapsed all the way to a point. On their own they are invisible, but
    where they pile up on the eye sockets they lie across the surface and
    fight it for the depth buffer, and the fight draws as fine horizontal
    bands across the right eye. Flat-shaded they are invisible, which is
    what made them so confusing to track down.
    """
    import bmesh

    for ob in objs:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.faces.ensure_lookup_table()

        pool = [f for f in bm.faces
                if slots is None or f.material_index in slots]
        if not pool:
            bm.free()
            continue
        areas = sorted(f.calc_area() for f in pool)
        median = areas[len(areas) // 2]
        if median <= 0:
            bm.free()
            continue
        limit = median * area_frac

        doomed = set()
        for f in pool:
            if f.calc_area() < limit:
                doomed.add(f)
        if not doomed:
            bm.free()
            continue
        bmesh.ops.delete(bm, geom=list(doomed), context="FACES")
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
        print(f"[face] removed {len(doomed)} sliver faces")


def bury_brows(objs, m, z_lo=1.150, z_hi=1.320, x_lo=0.075, x_hi=0.205,
               margin=0.014, max_push=0.10):
    """Sink Meshy's reconstructed eyebrows into the skull.

    The reference's eyebrows are painted - they are part of the photo, not
    geometry - and they land on the face once the photo is projected. Meshy
    read that dark paint as hair and rebuilt it as a separate shell of strands
    that sits in front of the face. Left alone, the two copies overlap and
    the brow reads as a grey smudge instead of the crisp black shape in the
    reference.

    The strands have to go *behind* the skin, so where they end up is
    measured rather than guessed: the front of the face is found per height
    band, and a strand is pushed back until it is just inside it.  Pushing
    them a fixed distance is not enough - the forehead is not flat, and a
    strand that clears the face at one height pokes through it at another.
    """
    import bmesh

    hair_slot = ORDER.index("hair")
    skin_slot = ORDER.index("skin")
    face_slot = ORDER.index("face")
    step = 0.01

    for ob in objs:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.verts.ensure_lookup_table()
        bm.faces.ensure_lookup_table()

        # The front of the face, per height band.  The median, not the
        # extreme: the fringe hangs a hundred millimetres further forward
        # than the forehead does, and taking the extreme would put the target
        # so far forward that nothing counts as being in front of it.
        front = {}
        for f in bm.faces:
            if f.material_index not in (skin_slot, face_slot):
                continue
            c = f.calc_center_median()
            if not (z_lo - 0.08 <= c.z <= z_hi + 0.08):
                continue
            if not (x_lo - 0.04 <= abs(c.x) <= x_hi + 0.04):
                continue
            front.setdefault(int(round(c.z / step)), []).append(c.y)
        if not front:
            bm.free()
            continue

        def skin_front(z):
            lo = int(round((z - 0.03) / step))
            hi = int(round((z + 0.03) / step))
            vals = [y for k in range(lo, hi + 1) for y in front.get(k, ())]
            if not vals:
                return None
            vals.sort()
            return vals[len(vals) // 2]

        doomed = set()
        for f in bm.faces:
            if f.material_index != hair_slot:
                continue
            c = f.calc_center_median()
            if not (z_lo <= c.z <= z_hi):
                continue
            if not (x_lo <= abs(c.x) <= x_hi):
                continue
            doomed.update(f.verts)
        if not doomed:
            bm.free()
            continue

        moved = 0
        for v in doomed:
            fy = skin_front(v.co.z)
            if fy is None:
                continue
            target = fy + margin
            if v.co.y < target:
                v.co.y = min(target, v.co.y + max_push)
                moved += 1
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
        print(f"[face] buried {moved} of {len(doomed)} brow verts")


def plug_head_bottom(objs, mats, m, lift=0.040, drop=0.030, min_pts=48):
    """Close the open bottom of the skull.

    Meshy hands the head back as a shell that simply stops at the chin: the
    surface runs up the face, over the top and down the inside of the back of
    the skull, and its lowest edge is the chin.  Everything under the chin and
    in front of the neck is therefore a hole, and from the front you look
    straight through the head and out the back of it - the background, with a
    few black hair spikes in front of it.

    The fix is a skin-coloured cone across the opening.  Its rim is the head's
    own outline a little above the chin, so it cannot poke out of the
    silhouette, and it falls away to a point below, which reads as the
    underside of the jaw rather than as a flat lid.
    """
    import bmesh

    skin_slot = ORDER.index("skin")
    face_slot = ORDER.index("face")
    z0 = m["z0"]
    cx, cy = m["cx"], m["cy"]
    z_rim = z0 + lift

    # The head's outline just above the chin.
    pts = []
    for ob in objs:
        for p in ob.data.polygons:
            if p.material_index not in (skin_slot, face_slot):
                continue
            if abs(p.center.z - z_rim) > 0.012:
                continue
            for vi in p.vertices:
                c = ob.data.vertices[vi].co
                if abs(c.z - z_rim) <= 0.016:
                    pts.append((c.x, c.y))
    if len(pts) < min_pts:
        print(f"[plug] only {len(pts)} outline points, skipping")
        return None

    # Keep the outermost point per direction so the rim is the silhouette.
    step = 2.0 * math.pi / 180.0
    buckets = {}
    for px, py in pts:
        dx, dy = px - cx, py - cy
        r = math.hypot(dx, dy)
        if r < 1e-6:
            continue
        a = (math.atan2(dy, dx) + math.pi) % (2.0 * math.pi)
        k = int(a / step)
        if k not in buckets or r > buckets[k][0]:
            buckets[k] = (r, a)
    if len(buckets) < min_pts:
        print(f"[plug] only {len(buckets)} rim buckets, skipping")
        return None
    rim = sorted(buckets.values(), key=lambda t: t[1])

    bm = bmesh.new()
    apex = bm.verts.new((cx, cy, z0 - drop))
    ring = []
    for r, a in rim:
        ring.append(bm.verts.new((cx + r * math.cos(a), cy + r * math.sin(a), z_rim)))
    n = len(ring)
    for i in range(n):
        # Wound so the normal points down and out, away from the inside of
        # the jaw. The other way round the cap is backfacing, and it renders
        # as a grey plate hanging under the chin.
        bm.faces.new((apex, ring[(i + 1) % n], ring[i]))
    bm.normal_update()
    me = bpy.data.meshes.new("JawPlug")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new("JawPlug", me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mats["skin"])
    for p in ob.data.polygons:
        p.material_index = 0
    ob.data.update()
    print(f"[plug] jaw closed: {n} rim points, max radius "
          f"{max(r for r, _ in rim):.3f} at z={z_rim:.3f}")
    return ob


# photo measurements, in the reference's own pixels
REF_EYE_OFFSET = 125.75      # iris centre from the face centre
REF_FACE_HALF = 337.5        # face incl. ears, at the eye row
REF_EYE_FRAC = 0.650         # eye height above the chin, chin to hairline
# The reference's chin and the top of its forehead. Measured off the photo:
# the smile's widest row is 786, the iris sits at 668, and the chin ends at
# about 895 - row 943 is the *neck*, and row 493 is the scalp between the
# locks, not the hairline. Anchoring on those two wrong rows stretched the
# face over the neck and the white shirt, which is where the grey band under
# the jaw came from, and put the painted eye 27 px above the socket it was
# meant to land on.
REF_CHIN_Y = 893.0           # the reference's chin row
REF_HAIR_Y = 550.0           # the reference's hairline row
REF_IRIS_R = 48.0            # painted iris radius


def photo_scale(objs, m):
    """Solve the photo-to-model horizontal scale K.

    The photo's irises sit 125.75 px either side of the face centre and the
    face there is 337.5 px wide, so the painted iris has to land at 0.3725 of
    the model's own face half width. That fixes the azimuth it sits at, and
    the azimuth fixes K, because the texture maps azimuth to photo pixels as
    x = cx + K*sin(az) with sin(az) = (x - cx)/R on the head's circle.

    Getting this wrong is what squeezed the painted eyes into the middle of
    the face while the socket rims stayed where the reconstruction had put
    them - two sets of eyes, far apart.
    """
    z_eye = m["z0"] + REF_EYE_FRAC * (m["z1"] - m["z0"])
    half = 0.0
    slots = (ORDER.index("skin"), ORDER.index("face"))
    for ob in objs:
        for p in ob.data.polygons:
            if p.material_index not in slots:
                continue
            if abs(p.center.z - z_eye) > 0.03:
                continue
            half = max(half, abs(p.center.x))
    if half <= 1e-4:
        return 340.0
    target_x = REF_EYE_OFFSET / REF_FACE_HALF * half
    K = REF_EYE_OFFSET * m["radius"] / max(target_x - m["cx"], 1e-4)
    print(f"[scale] face half={half:.4f} target iris x={target_x:.4f} "
          f"R={m['radius']:.4f} K={K:.1f}")
    return K


def eye_regions(m, K):
    """The two painted eyes, as ellipses in the model's own coordinates.

    The reference's eyes are artwork, not geometry, so the only place the eye
    *is* in the model is where the photo will put it. The photo's iris centre
    is REF_EYE_OFFSET pixels either side of the face centre, and the texture
    maps azimuth to photo pixels as x = cx + K*sin(az) - so the azimuth of the
    painted iris is asin(offset / K), and the model's x follows from that.

    Taking the region from the photo rather than from the geometry is the
    whole point: Meshy rebuilt the sockets wherever it felt like, and chasing
    those with a depth filter is what made the old dome fit land on the nose.
    """
    z0, z1, R, cx = m["z0"], m["z1"], m["radius"], m["cx"]
    s = max(-0.95, min(0.95, REF_EYE_OFFSET / max(K, 1.0)))
    az = math.asin(s)
    # The painted eye is bigger than the iris: there is the white of the eye
    # on the outer side and the lash above it, and the socket rim stands
    # outside all of that.
    edge = REF_IRIS_R * 1.28
    daz = edge / max(K * math.cos(az), 1.0)
    rx = R * math.sin(daz)
    rz = (edge / (REF_CHIN_Y - REF_HAIR_Y)) * (z1 - z0)
    ez = z0 + REF_EYE_FRAC * (z1 - z0)
    out = []
    for sgn in (-1.0, 1.0):
        ex = cx + sgn * R * math.sin(az)
        out.append({"x": ex, "z": ez, "rx": rx, "rz": rz})
    print(f"[dome] painted eyes at x {out[0]['x']:+.3f}/{out[1]['x']:+.3f} "
          f"z {ez:.3f}  rx {rx:.3f} rz {rz:.3f}")
    return out


def _dome_basis(u, v):
    """A small polynomial basis in the eye's own normalised coordinates."""
    import numpy as np
    return np.stack([np.ones_like(u), u, v, u * u, u * v, v * v,
                     u * u * u, u * u * v, v * v * v], axis=1)


def _fit_dome(pts, ex, ez, rx, rz, iters=8):
    """Robust polynomial fit of the face surface around one eye.

    Cauchy weights, so the brow ridge, the nose bridge and the stray shards
    Meshy left in the socket cannot drag the fit off the face.
    """
    import numpy as np
    u = (pts[:, 0] - ex) / rx
    v = (pts[:, 1] - ez) / rz
    basis = _dome_basis(u, v)
    y = pts[:, 2]
    w = np.ones_like(y)
    coef = None
    for _ in range(iters):
        A = basis * w[:, None]
        coef, *_ = np.linalg.lstsq(A, y * w, rcond=None)
        r = y - basis @ coef
        s = 1.4826 * np.median(np.abs(r - np.median(r))) + 1e-6
        w = 1.0 / (1.0 + (r / (2.5 * s)) ** 2)
    return coef


def flatten_eye_dome(objs, m, K, regions=None, move=1.0, gap=1.18, blend=0.86,
                     prune=0.012, drop_inward=True, drop_scale=1.0,
                     drop_skin=False):
    """Pull the eye sockets back onto the smooth dome the reference paints on.

    The reference's face is a painted dome: the eye is a lash shape, an iris
    gradient and two speculars, all drawn on one smooth surface. Meshy rebuilt
    the eyes as a ball in a socket with a raised rim, and when the photo is
    projected onto that, the rim arcs across the painted eye and the socket's
    inner wall - which faces inwards, so it is excluded from the photo and
    comes out as plain skin - pokes through the black of the iris as a pale
    shard.

    So the whole socket is taken out and put back on the dome. The dome itself
    is fitted to the face *around* the eye, robustly, so the paint lands on a
    smooth continuous surface with nothing sticking through it.

    `move` scales the painted eye into the region that gets flattened - it has
    to be larger than the iris, because the rim stands outside it - and `gap`
    is how much wider the ring the dome is fitted on is than the hole it has
    to reach across.
    """
    import bmesh
    import numpy as np

    if regions is None:
        regions = eye_regions(m, K)

    hair_slot = ORDER.index("hair")
    moved = 0
    pruned = 0

    for reg in regions:
        ex, ez = reg["x"], reg["z"]
        mrx, mrz = reg["rx"] * move, reg["rz"] * move
        fx, fz = mrx * gap, mrz * gap
        bx, bz = fx * 2.0, fz * 2.4

        pts = []
        for ob in objs:
            for v in ob.data.vertices:
                c = v.co
                if abs(c.x - ex) > bx or abs(c.z - ez) > bz:
                    continue
                if c.y > -0.35:
                    continue
                u = (c.x - ex) / fx
                v = (c.z - ez) / fz
                if u * u + v * v <= 1.0:
                    continue
                pts.append((c.x, c.z, c.y))
        if len(pts) < 60:
            print(f"[dome] eye at {ex:+.3f}: only {len(pts)} sample points, skipped")
            continue
        pts = np.array(pts, dtype=np.float64)
        coef = _fit_dome(pts, ex, ez, fx, fz)

        def dome_y(x, z, _ex=ex, _ez=ez, _fx=fx, _fz=fz, _c=coef):
            u = np.atleast_1d((x - _ex) / _fx)
            v = np.atleast_1d((z - _ez) / _fz)
            return (_dome_basis(u, v) @ _c)

        for ob in objs:
            me = ob.data
            bm = bmesh.new()
            bm.from_mesh(me)
            bm.verts.ensure_lookup_table()
            hit = 0
            for v in bm.verts:
                c = v.co
                if abs(c.x - ex) > mrx or abs(c.z - ez) > mrz:
                    continue
                u = (c.x - ex) / mrx
                w = (c.z - ez) / mrz
                t = u * u + w * w
                if t > 1.0:
                    continue
                total = hit
                hit += 1
                ty = float(dome_y(np.array([c.x]), np.array([c.z]))[0])
                # ease the last stretch so the rim does not leave a crease
                k = 1.0 if (blend >= 1.0 or t < blend) \
                    else (1.0 - t) / (1.0 - blend)
                v.co.y = c.y + (ty - c.y) * max(0.0, min(1.0, k))
            if hit:
                bm.to_mesh(me)
                bm.free()
                me.update()
                moved += hit
            else:
                bm.free()

        # ---- take the rest of the socket away ---------------------------
        #
        # Flattening leaves the socket's rim standing proud of the dome and
        # its inner wall hanging behind it, and both of them cross the
        # painted eye: the rim as a dark arc, the wall as pale shards. What
        # is left on the dome is the eyeball itself, which is the only layer
        # that should be there - the reference's eye is artwork on one smooth
        # surface, with no socket in it at all.
        for ob in objs:
            me = ob.data
            bm = bmesh.new()
            bm.from_mesh(me)
            bm.faces.ensure_lookup_table()
            bm.normal_update()
            doomed = []
            for f in bm.faces:
                c = f.calc_center_median()
                u = (c.x - ex) / (mrx * drop_scale)
                w = (c.z - ez) / (mrz * drop_scale)
                if u * u + w * w > 1.0:
                    continue
                ty = float(dome_y(np.array([c.x]), np.array([c.z]))[0])
                if prune > 0.0 and abs(c.y - ty) > prune:
                    doomed.append(f)
                    continue
                if drop_inward:
                    # The socket's inner wall points inwards, so once the
                    # socket has been flattened it lies on the dome as a
                    # second surface - and two surfaces at the same depth
                    # fight for the depth buffer, which is what draws the
                    # eye as torn paper. The reference has no socket: the eye
                    # is paint on one surface.
                    radial = (c.x - m["cx"], c.y - m["cy"],
                              c.z - 0.5 * (m["z0"] + m["z1"]))
                    nrm = f.normal
                    if (radial[0] * nrm.x + radial[1] * nrm.y
                            + radial[2] * nrm.z) < -0.02:
                        doomed.append(f)
                        continue
                if drop_skin and f.material_index == ORDER.index("skin") \
                        and abs(c.y - ty) > 0.005:
                    # The socket's rim flares out past the eye, and it is the
                    # one piece of the face the photo has no paint for: it
                    # comes out as a ring of pale torn paper around the eye.
                    # The eye is artwork on a smooth dome, so the rim goes.
                    doomed.append(f)
            if doomed:
                bmesh.ops.delete(bm, geom=doomed, context="FACES")
                bm.to_mesh(me)
                bm.free()
                me.update()
                pruned += len(doomed)

    print(f"[dome] flattened {moved} eye-socket verts onto the face dome, "
          f"pruned {pruned} leftover socket faces")
    return moved

def eye_ridge_report(objs, m, K, regions=None, move=1.5, tol=0.002):
    """What is still standing in front of the dome around the eyes.

    Anything more than a couple of millimetres proud of the fitted dome will
    poke through the painted eye, so this is the number that says whether the
    socket has been taken out far enough.
    """
    import numpy as np

    if regions is None:
        regions = eye_regions(m, K)
    worst = []
    for reg in regions:
        ex, ez = reg["x"], reg["z"]
        mrx, mrz = reg["rx"] * move, reg["rz"] * move
        fx, fz = mrx * 1.18, mrz * 1.18
        bx, bz = fx * 2.0, fz * 2.4
        pts = []
        for ob in objs:
            for v in ob.data.vertices:
                c = v.co
                if abs(c.x - ex) > bx or abs(c.z - ez) > bz or c.y > -0.35:
                    continue
                u = (c.x - ex) / fx
                w = (c.z - ez) / fz
                if u * u + w * w <= 1.0:
                    continue
                pts.append((c.x, c.z, c.y))
        if len(pts) < 60:
            continue
        pts = np.array(pts, dtype=np.float64)
        coef = _fit_dome(pts, ex, ez, fx, fz)
        inside = []
        for ob in objs:
            for v in ob.data.vertices:
                c = v.co
                if abs(c.x - ex) > mrx or abs(c.z - ez) > mrz or c.y > -0.35:
                    continue
                inside.append((c.x, c.z, c.y))
        if not inside:
            continue
        arr = np.array(inside, dtype=np.float64)
        u = (arr[:, 0] - ex) / fx
        w = (arr[:, 1] - ez) / fz
        dome = _dome_basis(u, w) @ coef
        d = arr[:, 2] - dome          # negative = in front of the dome
        for i in np.nonzero(d < -tol)[0]:
            worst.append((float(d[i]), float(arr[i, 0]), float(arr[i, 1])))
    worst.sort()
    print(f"[dome] {len(worst)} verts still proud of the dome by more than "
          f"{tol * 1000:.0f} mm")
    for d, x, z in worst[:6]:
        print(f"[dome]   {d * 1000:+.1f} mm at x {x:+.3f} z {z:.3f}")
    return worst


def make_plaid_image(name="PlaidTex", size=512, cells=8,
                     ca=(0.560, 0.062, 0.055), cb=(0.030, 0.026, 0.026)):
    """Buffalo-check tartan as an ordinary image texture.

    The plaid used to be a procedural node graph (checker + wave masks). glTF
    has no procedural textures: the exporter drops the whole node tree, and
    a material with no base colour and no baseColorTexture falls back to
    white - so the waist band rendered as a plain white belt on the website
    while every Blender render showed red-and-black tartan. A plain image
    travels through glTF untouched.
    """
    import numpy as np

    px = size // cells
    ys, xs = np.mgrid[0:size, 0:size]
    checker = (((xs // px) + (ys // px)) % 2).astype(np.float32)
    rgb = np.empty((size, size, 3), np.float32)
    for i in range(3):
        rgb[:, :, i] = checker * cb[i] + (1.0 - checker) * ca[i]
    seam = ((xs % px) < 3) | ((ys % px) < 3)
    rgb[seam] = 0.018

    img = bpy.data.images.new(name, size, size, alpha=False)
    img.colorspace_settings.name = "sRGB"
    rgba = np.ones((size, size, 4), np.float32)
    rgba[:, :, :3] = rgb
    img.pixels.foreach_set(np.ascontiguousarray(rgba).ravel())
    img.update()
    img.pack()
    return img


def make_plaid(name, ca, cb, size=512, cells=8):
    """Buffalo check driven by a coarse checker plus thin dark seams."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    b = nt.nodes["Principled BSDF"]
    set_input(b, "Roughness", 0.66)
    set_input(b, "Specular IOR Level", 0.28)

    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = make_plaid_image(name + "Image", size, cells, ca, cb)
    tex.location = (-400, 200)
    nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    return mat


def uv_plaid(objs, lo, hi, slot, tiles=4.0, cx=0.0, cy=-0.05, radius=0.35):
    """Wrap the tartan around the waist.

    The plaid is a band, so it wants a cylindrical unwrap rather than the
    flat UVs the rest of the mesh carries. The whole waist is a whole
    number of tiles so the pattern wraps seamlessly, and the tile size puts
    about eight squares across the front - which is what the reference
    shows.
    """
    H = hi.z - lo.z
    z0 = lo.z + 0.330 * H
    tile = (2.0 * math.pi * radius) / tiles
    u_span = tiles

    for ob in objs:
        uvl = ob.data.uv_layers.get("HeadUV") or ob.data.uv_layers.new(name="HeadUV")
        ob.data.uv_layers.active = uvl
        data = uvl.data
        for p in ob.data.polygons:
            if p.material_index != slot:
                continue
            for li in p.loop_indices:
                v = ob.data.vertices[ob.data.loops[li].vertex_index].co
                az = math.atan2(v.x - cx, -(v.y - cy))
                data[li].uv = ((az / (2.0 * math.pi)) * u_span,
                               (v.z - z0) / tile)
        ob.data.update()
    print(f"[plaid] tartan unwrapped, u span {u_span:.2f} tiles")


def materials():
    return {
        "skin": make_material("Skin", (0.975, 0.660, 0.575), 0.50, subsurface=0.34),
        # The hair is a shell of thin sheets, and at a grazing angle a glossy
        # black surface turns into brushed metal. Matte, or the side locks
        # read as steel plating.
        "hair": make_material("Hair", (0.028, 0.026, 0.034), 0.58, coat=0.0,
                              specular=0.04),
        "tee": make_material("Tee", (0.935, 0.935, 0.948), 0.68),
        "plaid": make_plaid("Plaid", (0.560, 0.062, 0.055), (0.030, 0.026, 0.026)),
        "pants": make_material("Pants", (0.430, 0.064, 0.057), 0.58),
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
    """Thin the source mesh down to the web budget.

    The source is Meshy's full-resolution export (719k faces) and it is what
    carries the reference's rounded hair locks. Collapse decimation keeps
    them well down to ~150k faces, so that is where the budget sits - the
    24k-triangle copy that was used before has the locks as flat angular
    shards, which is the single biggest reason the model did not look like
    the reference.

    There is no subdivision pass any more. SIMPLE subdiv followed by collapse
    was the original recipe for the low-poly base, and running it over an
    already dense mesh only burns time and rounds off the locks.
    """
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

    print(f"[decimate] {n} -> {len(fused.data.polygons)} faces")
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


def clear_face_fringe(objs, lo, hi, mats, m=None, margin=0.0, y_front=-0.16,
                      skip_faces=()):
    """Delete hair that actually covers the eyes or the mouth.

    The old version shaved a horizontal band off the whole head, which cut the
    bangs flat across the forehead - a ruler line where the reference has a
    row of separate locks. The bangs were never the problem: the material
    classifier was painting them into the face, and this band was the clumsy
    attempt to hide the result. With the shells classified as hair they hang
    where Meshy put them, which is already correct.

    So this now only removes hair that intrudes into the eye sockets or the
    mouth, using the measured face frame. The lock that hangs between the eyes
    down to the nose bridge stays - the reference has exactly that - and so do
    the detached bang shells, which Meshy already placed by hand.
    """
    import bmesh

    if m is None:
        print("[fringe] no face frame, skipping")
        return 0

    hm = mats.get("hair")
    hair_names = {hm.name} if hm is not None else {
        mm.name for mm in mats.values() if mm and mm.name.lower().startswith("hair")
    }

    cx, R = m["cx"], m["radius"]
    eye_x = R * math.sin(m["eye_az"])
    zones = []
    for sgn in (-1.0, 1.0):
        zones.append((cx + sgn * eye_x, m["eye_z"],
                      m["eye_hw"] * 0.78 + margin, m["eye_hh"] * 0.78 + margin))
    zones.append((cx, m["mouth_z"], m["mouth_hw"] + margin, 0.045 + margin))

    skip = set(skip_faces)
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
            if f.index in skip:
                continue
            c = f.calc_center_median()
            if c.y > y_front:
                continue
            for zx, zz, rx, rz in zones:
                if ((c.x - zx) / rx) ** 2 + ((c.z - zz) / rz) ** 2 <= 1.0:
                    doomed.append(f)
                    break
        if doomed:
            bmesh.ops.delete(bm, geom=doomed, context="FACES")
            removed += len(doomed)
        bm.to_mesh(me)
        bm.free()
        me.update()

    print(f"[fringe] removed {removed} hair polygons over the eyes / mouth")
    return removed


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

    if levels <= 0:
        # The full-resolution base is dense enough everywhere already; the
        # subdivision only existed to sharpen the face on the low-poly copy.
        return

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

    if shrink >= 0.999:
        # Scaling one axis cannot shorten a fringe: it compresses the spikes'
        # length and thickness by the same factor, so at shrink=0.30 the whole
        # band collapses into a thin slab and the hair reads as a flat-bottomed
        # helmet. Disabled by default - do not turn it back up without changing
        # the maths to a rigid move of the bang shell.
        print("[fringe] skipped: single-axis squeeze flattens the spikes")
        return

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


def shell_map(objs):
    """Connected-component id for every face, plus each shell's bounding box.

    Meshy ships the character as one fused mesh, but the bangs and the side
    locks are *detached sheets* floating in front of the skull. Nothing about
    them says "hair": they face forward and they hang below the hairline, so
    the normal-based classifier files them under skin and the face texture
    then paints the whole hairstyle into the forehead. Their identity as
    separate shells is the only reliable signal.
    """
    import bmesh

    out = []
    for ob in objs:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.faces.ensure_lookup_table()
        n = len(bm.faces)
        parent = list(range(n))

        def find(a):
            while parent[a] != a:
                parent[a] = parent[parent[a]]
                a = parent[a]
            return a

        for f in bm.faces:
            for e in f.edges:
                for nf in e.link_faces:
                    ra, rb = find(f.index), find(nf.index)
                    if ra != rb:
                        parent[rb] = ra

        cid = [find(f.index) for f in bm.faces]
        boxes = {}
        centres = {}
        for f in bm.faces:
            c = f.calc_center_median()
            centres.setdefault(cid[f.index], []).append(c)
            b = boxes.get(cid[f.index])
            if b is None:
                b = boxes[cid[f.index]] = [1e18, -1e18, 1e18, -1e18, 1e18,
                                           -1e18, 0, 0]
            b[0] = min(b[0], c.x)
            b[1] = max(b[1], c.x)
            b[2] = min(b[2], c.y)
            b[3] = max(b[3], c.y)
            b[4] = min(b[4], c.z)
            b[5] = max(b[5], c.z)
            b[6] += 1
        # A frame has a hole in the middle. Meshy rebuilt the eye sockets as
        # rings, and a ring's bounding box is as big as the eye it circles -
        # so it passes any size test and ends up filed under hair, which is
        # what drew the black ring around every painted eye. A lock is solid:
        # its own faces are near the middle of its own bounding box.
        for key, b in boxes.items():
            dims = (b[1] - b[0], b[3] - b[2], b[5] - b[4])
            smallest = min(dims)
            if smallest <= 1e-6:
                b[7] = 1
                continue
            mx = (b[0] + b[1]) * 0.5
            my = (b[2] + b[3]) * 0.5
            mz = (b[4] + b[5]) * 0.5
            reach = 0.30 * smallest
            solid = any(abs(c.x - mx) <= reach and abs(c.y - my) <= reach
                        and abs(c.z - mz) <= reach for c in centres[key])
            b[7] = 0 if solid else 1
        bm.free()
        out.append((cid, boxes))
    return out


def hair_shell_faces(objs, z_neck, front_y=-0.10):
    """Face indices belonging to detached hair shells.

    A shell counts as hair when it hangs in front of the head (the bangs) and
    sits entirely above the neck. Shells at the back or at the sides of the
    skull are the ears and the neck, which stay skin.
    """
    out = []
    for ob, (cid, boxes) in zip(objs, shell_map(objs)):
        if not boxes:
            out.append(set())
            continue
        biggest = max(b[6] for b in boxes.values())
        hair_shells = set()
        for key, b in boxes.items():
            if b[6] > biggest * 0.5:
                continue                       # the fused body, not a sheet
            # A shell only counts as hair if it is a *lock*, not a shard.
            # Meshy's reconstruction is a soup of 45k components and most of
            # the little ones are single slivers of the face surface itself.
            # Filing them under hair painted the face with black specks, drew
            # a black ring around each eye and a black dashed line across the
            # mouth - the face count does not tell them apart (a shard can be
            # twenty degenerate triangles), but the shape does: a lock has
            # extent in at least two directions, a sliver in one.
            dims = (b[1] - b[0], b[3] - b[2], b[5] - b[4])
            if sum(1 for d in dims if d >= 0.010) < 2:
                continue
            if b[7]:
                continue                       # a frame around a hole, not a lock
            if b[2] < front_y and b[4] > z_neck:
                hair_shells.add(key)
            elif (b[2] < front_y and b[4] <= z_neck
                    and b[5] > z_neck - 0.02
                    and (b[0] > 0.02 or b[1] < -0.02)):
                # A side lock that hangs past the neck line. It does not
                # clear the height test, so it used to be filed under skin -
                # and a sheet of skin-coloured shards hanging beside the ear
                # is exactly the pale broken glass the render showed there.
                # The neck is excluded because it straddles the centre line,
                # and the legs because they end far below the neck.
                hair_shells.add(key)
        out.append({i for i, c in enumerate(cid) if c in hair_shells})
        for key in sorted(hair_shells):
            b = boxes[key]
            print(f"[shell] hair sheet faces={b[6]} x {b[0]:+.3f}..{b[1]:+.3f} "
                  f"y {b[2]:+.3f}..{b[3]:+.3f} z {b[4]:.3f}..{b[5]:.3f}")
    return out


def mark_hair_shells(objs, faces_by_obj):
    """Force the detached bang shells back to the hair material."""
    import bmesh

    total = 0
    for ob, faces in zip(objs, faces_by_obj):
        if not faces:
            continue
        slot = ORDER.index("hair")
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.faces.ensure_lookup_table()
        for f in bm.faces:
            if f.index in faces:
                f.material_index = slot
                total += 1
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
    print(f"[shells] {total} polygons forced back to hair")
    return total


def unmark_stray_hair(objs, z_neck, lo=None, hi=None):
    """Take the hair material off the shells that are not hair.

    A saved .blend carries the labels the pipeline gave it. When the shell
    test was too loose, every stray shard of the face was filed under hair,
    and that is what drew the black ring around the eyes and the black dashes
    across the mouth. The quick-iteration script works on a saved .blend, so
    it needs to be able to undo that on its own.

    Only the shards *below the hairline* are taken off it. The hair on the
    skull itself is part of the fused body, not a separate shell, so the shell
    test never claimed it - and taking it off would strip the whole hairstyle
    and leave pink horns where the side locks are.
    """
    import bmesh
    import math as _math

    hair_shells = hair_shell_faces(objs, z_neck)
    hair_slot = ORDER.index("hair")
    skin_slot = ORDER.index("skin")
    moved = 0
    kept_above = 0
    for oi, ob in enumerate(objs):
        keep = hair_shells[oi]
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.faces.ensure_lookup_table()
        for f in bm.faces:
            if f.material_index != hair_slot:
                continue
            if keep and f.index in keep:
                continue
            c = f.calc_center_median()
            if lo is not None and hi is not None:
                H = hi.z - lo.z
                az = min(abs(_math.atan2(c.x, -c.y)) / (_math.pi * 0.5), 1.0)
                hairline = lo.z + H * (0.712 - (0.712 - 0.655) * az * az)
                if c.z >= hairline:
                    kept_above += 1
                    continue
            f.material_index = skin_slot
            moved += 1
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
    print(f"[hair] {moved} stray polygons taken off the hair material, "
          f"{kept_above} kept because they are above the hairline")
    return moved


def trim_eye_hair(objs, m, regions=None, K=None, grow=1.06, y_front=-0.40):
    """Cut the hair back off the painted eyes.

    The reference's bangs stop above the eyes; only the lock between them runs
    down to the nose bridge. Meshy's left lock hangs across the whole eye, and
    a sheet of black hair lying over the painted iris is the one thing the
    photo can never fix.

    The zone comes from the photo, not from the geometry: the painted eye is
    where the eye is, and the hair has to get out of its way.
    """
    import bmesh

    if regions is None:
        regions = eye_regions(m, K or 340.0)
    # A box, not an ellipse: Meshy left shards of hair lying flat across the
    # eye, and they are wider than they are tall, so an ellipse around the
    # iris misses most of them. The box stops short of the centre line, so
    # the lock that hangs between the eyes - which the reference has - stays.
    zones = []
    for r in regions:
        zones.append((r["x"], r["z"], r["rx"] * 1.18, r["rz"] * 1.55, 0.055))
    zones.append((m["cx"], m["mouth_z"], m["mouth_hw"] * 1.25, 0.050, 0.0))

    hair_slot = ORDER.index("hair")
    removed = 0
    for ob in objs:
        slot_names = [s.material.name if s.material else ""
                      for s in ob.material_slots]
        hair_slots = {i for i, n in enumerate(slot_names)
                      if n.lower().startswith("hair")}
        if not hair_slots:
            continue
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.faces.ensure_lookup_table()
        doomed = []
        for f in bm.faces:
            if f.material_index not in hair_slots:
                continue
            c = f.calc_center_median()
            if c.y > y_front:
                continue
            hit = False
            for zx, zz, rx, rz, up in zones:
                x0, x1 = zx - rx, zx + rx
                z0, z1 = zz - rz, zz + up
                if abs(c.x - zx) <= rx and zz - rz <= c.z <= zz + up:
                    hit = True
                    break
                # The lock over the eye is a handful of very big triangles, so
                # the centre of a face can sit well outside the eye while the
                # face still covers it. The face's own bounding box is the
                # only honest test.
                fx0 = fx1 = c.x
                fz0 = fz1 = c.z
                for v in f.verts:
                    p = v.co
                    fx0 = min(fx0, p.x)
                    fx1 = max(fx1, p.x)
                    fz0 = min(fz0, p.z)
                    fz1 = max(fz1, p.z)
                if fx1 >= x0 and fx0 <= x1 and fz1 >= z0 and fz0 <= z1:
                    hit = True
                    break
            if hit:
                doomed.append(f)
        if doomed:
            bmesh.ops.delete(bm, geom=doomed, context="FACES")
            removed += len(doomed)
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
    print(f"[fringe] {removed} hair polygons cut back off the eyes")
    return removed


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
    # inside this azimuth (1.0 = 90 deg) the head is the face oval, whatever
    # its surface normal says - see the head branch of classify()
    FACE_AZ = 0.55

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
        # The face oval decides, not the surface normal. This mesh carries
        # real eye sockets, brow ridges, a nose and a mouth slit, and every
        # one of those features turns its face sideways - the normal test
        # files them under hair and they come out as black rings around the
        # painted eyes. Inside the oval it is all face; outside it the
        # normal still decides, so the ears (which face straight out) stay
        # skin.
        az = min(abs(math.atan2(p.x, -p.y)) / (math.pi * 0.5), 1.0)
        hairline = lo.z + H * (HAIRLINE_FRONT
                               - (HAIRLINE_FRONT - HAIRLINE_SIDE) * az * az)
        if p.z >= hairline:
            return "hair"
        if az <= FACE_AZ:
            return "skin"
        if n is None or n.y < -0.42:
            return "skin"
        return "hair"

    for ob in objs:
        ob.data.materials.clear()
        for key in ORDER:
            if key in mats:          # "face" is baked later, it keeps its slot
                ob.data.materials.append(mats[key])

    z_neck_abs = lo.z + Z_NECK_FRAC * H
    shell_faces = hair_shell_faces(objs, z_neck_abs)

    for oi, ob in enumerate(objs):
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

        # The bang sheets hang in front of the skull, so the majority pass
        # votes them straight into the face - and the face texture then paints
        # the whole hairstyle into the forehead. Shell identity outranks the
        # vote: put them back.
        slot = ORDER.index("hair")
        for f in bm.faces:
            if f.index in shell_faces[oi]:
                f.material_index = slot

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


def find_eye_sockets(objs, lo, hi, m, x_half=0.32, nx=65, nz=45, blur=0.055):
    """Locate the two eye sockets on the face, from the geometry alone.

    The painted eyes have to land ON the model's sockets. If they do not,
    every feature reads twice - the socket rim arcs over the painted eye -
    and the face looks like a misaligned double image rather than a face.

    The sockets are the only deep depressions on the face, so they can be
    found by casting rays over the face and looking for the two spots that
    sit far below the locally smoothed surface. The nose and the brow
    ridges are protrusions, so they score negative and are never picked.

    Returns {"x", "y", "z", "az"} for one socket (the left one) plus the
    average row of the pair, or None if nothing convincing turns up.
    """
    import numpy as np

    z_lo = m["z0"] + 0.02
    z_hi = m["z1"] - 0.01
    xs = np.linspace(-x_half, x_half, nx)
    zs = np.linspace(z_lo, z_hi, nz)

    depth = np.full((nz, nx), np.nan)
    for j, z in enumerate(zs):
        for i, x in enumerate(xs):
            h = face_hit(objs, float(x), float(z))
            if h is not None:
                depth[j, i] = h[0].y

    if np.all(np.isnan(depth)):
        return None
    # fill the holes so the blur does not bleed across them
    grid_z, grid_x = np.mgrid[0:nz, 0:nx]
    good = ~np.isnan(depth)
    if good.sum() < 50:
        return None
    filled = depth.copy()
    idx = np.where(good, grid_x, np.nan)
    for j in range(nz):
        row = good[j]
        if not row.any():
            continue
        xs_row = np.arange(nx)
        filled[j] = np.interp(xs_row, xs_row[row], depth[j][row])
    for i in range(nx):
        col = good[:, i]
        if not col.any():
            continue
        zs_col = np.arange(nz)
        filled[:, i] = np.interp(zs_col, zs_col[col], depth[:, i][col])

    # box blur (separable, three passes) -> the "expected" face surface
    k = max(3, int(blur / (xs[1] - xs[0])) | 1)
    kz = max(3, int(blur / (zs[1] - zs[0])) | 1)
    sm = filled
    for _ in range(3):
        sm = (np.apply_along_axis(
            lambda r: np.convolve(r, np.ones(k) / k, mode="same"), 1, sm))
        sm = (np.apply_along_axis(
            lambda r: np.convolve(r, np.ones(kz) / kz, mode="same"), 0, sm))
    resid = filled - sm          # > 0 where the surface dips in

    # only the outer halves: the middle is the nose bridge
    left = np.where((xs < -0.06))[0]
    right = np.where((xs > 0.06))[0]
    if not len(left) or not len(right):
        return None

    out = {}
    for tag, cols in (("L", left), ("R", right)):
        sub = resid[:, cols]
        j, i = np.unravel_index(np.argmax(sub), sub.shape)
        out[tag] = (float(xs[cols[i]]), float(zs[j]), float(resid[j, cols[i]]))
        if out[tag][2] <= 0.0:
            return None

    x_l, z_l, _ = out["L"]
    x_r, z_r, _ = out["R"]
    # the socket floor's y, for the azimuth
    hit = face_hit(objs, x_l, z_l)
    y_l = hit[0].y if hit else 0.0
    az = math.atan2(x_l - m["cx"], -(y_l - m["cy"]))

    print(f"[sockets] left x={x_l:+.3f} z={z_l:.3f} depth={out['L'][2]:+.4f}  "
          f"right x={x_r:+.3f} z={z_r:.3f} depth={out['R'][2]:+.4f}  "
          f"az={math.degrees(az):.1f}deg")
    return {"x": x_l, "y": y_l, "z": (z_l + z_r) * 0.5, "az": abs(az),
            "z_left": z_l, "z_right": z_r}


def face_metrics(objs, lo, hi):
    """Head frame plus feature placement, measured off the painted skin patch.

    Only front-facing skin counts. The earlier version measured the whole patch,
    which also covers the ears and the under-jaw, so the half width came out a
    third too wide and every feature drifted out toward the sides of the head.
    """
    z_neck = lo.z + Z_NECK_FRAC * (hi.z - lo.z)
    # Both slots count. The pipeline measures before paint_face moves the head
    # front into "face", but a re-opened .blend already has it there.
    idx = ORDER.index("skin")
    idx_face = ORDER.index("face")
    xs, zs, probe = [], [], []
    for ob in objs:
        for p in ob.data.polygons:
            if p.material_index not in (idx, idx_face):
                continue
            if p.center.z <= z_neck:
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
    # The head's axis, not the skin patch's: the patch runs into the ears, and
    # the reconstruction is a shade asymmetric there, which would tilt the
    # whole unwrap.
    cx = (lo.x + hi.x) * 0.5
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
    # The painted eyes must land on the model's own sockets, so find them.
    sock = find_eye_sockets(objs, lo, hi, m)
    if sock:
        m["socket_x"] = sock["x"]
        m["socket_y"] = sock["y"]
        m["socket_z"] = sock["z"]
        m["socket_az"] = sock["az"]
    print(f"[face] fw={fw:.4f} R={R:.4f} span={span:.4f} "
          f"z={z_lo:.3f}..{z_hi:.3f} eye_z={eye_z:.3f} "
          f"eye_az={math.degrees(az_e):.1f}deg corr={corr:.2f}"
          + (f" socket_z={m['socket_z']:.3f} socket_az="
             f"{math.degrees(m['socket_az']):.1f}deg" if sock else ""))
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
    # (material, plane as a fraction of height, how far below to pull from,
    #  how far to tuck the ring inside the garment above it)
    #
    # The tee hem goes all the way up to the plaid's top edge: in the
    # reference the white tee ends in one clean horizontal line right where
    # the plaid starts. Meshy cut the shirt off at a ragged radius, and that
    # ragged edge pokes through the plaid as a row of white teeth.
    bands = (("tee", 0.4183, 0.0, 0.006),
             ("plaid", 0.330, 0.245, 0.004),
             ("pants", 0.120, 0.080, 0.0))

    AX = (0.0, -0.05)          # body axis
    BINS = 24                  # angular bins for the ring radius

    for ob in objs:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.faces.ensure_lookup_table()
        bm.verts.ensure_lookup_table()

        for key, plane_frac, floor_frac, margin in bands:
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

            # The hem ring is ragged: Meshy cut the garment off at an uneven
            # radius, and the spikes poke straight through the garment above
            # it - which reads as a row of white teeth over the red plaid.
            # Smooth the radius per angle and tuck the ring just inside.
            #
            # The ring is every vertex sitting on the plane, not just the ones
            # that were pulled up: most of the hem was already flat and the
            # jag is in the radius, not the height.
            if margin > 0.0:
                ring_verts = []
                seen = set()
                for f in faces:
                    for v in f.verts:
                        if v.index in seen:
                            continue
                        if abs(v.co.z - plane) > 0.002:
                            continue
                        seen.add(v.index)
                        ring_verts.append(v)
                bins = {}
                for v in ring_verts:
                    dx = v.co.x - AX[0]
                    dy = v.co.y - AX[1]
                    a = int((math.atan2(dy, dx) + math.pi) / (2 * math.pi)
                            * BINS) % BINS
                    bins.setdefault(a, []).append(math.hypot(dx, dy))
                if bins:
                    med = {k: sorted(v)[len(v) // 2] for k, v in bins.items()}
                    flat = sorted(r for v in bins.values() for r in v)
                    flat = flat[len(flat) // 2]
                    for v in ring_verts:
                        dx = v.co.x - AX[0]
                        dy = v.co.y - AX[1]
                        a = int((math.atan2(dy, dx) + math.pi) / (2 * math.pi)
                                * BINS) % BINS
                        r = math.hypot(dx, dy)
                        if r <= 1e-6:
                            continue
                        target = med.get(a, flat) - margin
                        if r > target:
                            s = target / r
                            v.co.x = AX[0] + dx * s
                            v.co.y = AX[1] + dy * s

            if moved:
                print(f"[hem] {ob.name}: {key} pulled {moved} verts up to "
                      f"z={plane:.3f}")
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()


def paint_face(objs, mats, lo, hi, m=None, regions=None):
    """Bake the face texture, then hand the skull its material and UVs."""
    if m is None:
        m = face_metrics(objs, lo, hi)
    mats["face"] = face_texture.bake(m, mats["skin"], OUT, REF_FACE)
    z_neck = lo.z + Z_NECK_FRAC * (hi.z - lo.z)
    for ob in objs:
        ob.data.materials.append(mats["face"])
    keep = []
    for r in (regions or []):
        keep.append((r["x"], r["z"], r["rx"], r["rz"]))
    face_texture.apply(objs, m, mats["face"], len(ORDER) - 1, z_neck,
                       (ORDER.index("skin"), len(ORDER) - 1),
                       keep_regions=keep)
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


# --------------------------------------------------------------------------
# Face-zone clean-up
#
# The reference's face is one painted dome: the eyes, the brows, the nose and
# the mouth are artwork on a single smooth surface.  Meshy's reconstruction is
# not.  It rebuilt the eyes as a ball in a socket, left the socket's rim
# standing proud of the face as a flat card, read the painted brows as hair
# and rebuilt them as strands floating in front of the forehead, and left
# holes all over the face where the shells did not meet.
#
# Projecting the photo onto that does not produce a face.  It produces the
# photo with shards of geometry standing in front of it - which is what the
# black blocks in the viewport turned out to be.  The texture is perfect; the
# geometry is the problem.  So the face zone is taken back to the one shell
# that is actually the head: the hair Meshy grew out of the painted brows
# goes, the socket rim card goes, and the holes that is left behind close.
# --------------------------------------------------------------------------


def _raster_front(objs, slots, x_half=0.27, z_lo=1.00, z_hi=1.31, step=0.005):
    """Front-most surface depth per (x, z) cell, for the given material slots.

    The head is a soup of separate shells, so the mesh cannot answer "what is
    the surface at (x, z)" on its own.  Rasterising the triangles onto an
    (x, z) grid answers it the way a camera would: a ray along +Y hits the
    triangle with the smallest y first.
    """
    import numpy as np

    nx = int(round(2 * x_half / step)) + 1
    nz = int(round((z_hi - z_lo) / step)) + 1
    gx = -x_half + np.arange(nx) * step
    gz = z_lo + np.arange(nz) * step
    best = np.full((nz, nx), np.inf)
    for ob in objs:
        me = ob.data
        for poly in me.polygons:
            if poly.material_index not in slots:
                continue
            vs = [me.vertices[i].co for i in poly.vertices]
            for i in range(1, len(vs) - 1):
                p0, p1, p2 = vs[0], vs[i], vs[i + 1]
                xs = (p0.x, p1.x, p2.x)
                zs = (p0.z, p1.z, p2.z)
                i0 = max(0, int(np.ceil((min(xs) + x_half) / step)))
                i1 = min(nx - 1, int(np.floor((max(xs) + x_half) / step)))
                j0 = max(0, int(np.ceil((min(zs) - z_lo) / step)))
                j1 = min(nz - 1, int(np.floor((max(zs) - z_lo) / step)))
                if i1 < i0 or j1 < j0:
                    continue
                X, Z = np.meshgrid(gx[i0:i1 + 1], gz[j0:j1 + 1])
                det = ((zs[1] - zs[2]) * (xs[0] - xs[2])
                       + (xs[2] - xs[1]) * (zs[0] - zs[2]))
                if abs(det) < 1e-12:
                    continue
                a = ((zs[1] - zs[2]) * (X - xs[2])
                     + (xs[2] - xs[1]) * (Z - zs[2])) / det
                b = ((zs[2] - zs[0]) * (X - xs[2])
                     + (xs[0] - xs[2]) * (Z - zs[2])) / det
                c = 1.0 - a - b
                inside = (a >= 0.0) & (b >= 0.0) & (c >= 0.0)
                if not inside.any():
                    continue
                Y = a * p0.y + b * p1.y + c * p2.y
                sub = best[j0:j1 + 1, i0:i1 + 1]
                np.minimum(sub, np.where(inside, Y, np.inf), out=sub)
    return {"Y": best, "gx": gx, "gz": gz, "step": step,
            "x_half": x_half, "z_lo": z_lo, "nx": nx, "nz": nz}


def _grid_fill(Y):
    """Interpolate across the cells a depth grid never hit."""
    import numpy as np

    Z = np.array(Y, dtype=np.float64)
    Z[~np.isfinite(Z)] = np.nan
    nz, nx = Z.shape
    for j in range(nz):
        row = ~np.isnan(Z[j])
        if row.any() and not row.all():
            Z[j] = np.interp(np.arange(nx), np.arange(nx)[row], Z[j][row])
    for i in range(nx):
        col = ~np.isnan(Z[:, i])
        if col.any() and not col.all():
            Z[:, i] = np.interp(np.arange(nz), np.arange(nz)[col], Z[:, i][col])
    return Z


def _fbox(f):
    """The face's bounding box in the (x, z) plane."""
    xs = [v.co.x for v in f.verts]
    zs = [v.co.z for v in f.verts]
    return min(xs), max(xs), min(zs), max(zs)


def _head_shells(objs, face_slots):
    """Label every skin/face polygon with the shell it belongs to.

    Meshy's head is not one surface, it is thousands of separate shells, and
    the only way to tell the head from the junk lying on top of it is to see
    which shell each polygon is welded to.
    """
    import bmesh

    comp = {}
    for ob in objs:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.faces.ensure_lookup_table()
        bm.faces.index_update()
        num = len(bm.faces)
        par = list(range(num))

        def find(a):
            while par[a] != a:
                par[a] = par[par[a]]
                a = par[a]
            return a

        for f in bm.faces:
            if f.material_index not in face_slots:
                continue
            for e in f.edges:
                for nf in e.link_faces:
                    if nf is f or nf.material_index not in face_slots:
                        continue
                    ra, rb = find(f.index), find(nf.index)
                    if ra != rb:
                        par[ra] = rb
        for f in bm.faces:
            comp[(ob.name, f.index)] = find(f.index)
        bm.free()
    return comp


def _face_dome_grid(objs, slots, x_half=0.27, z_lo=1.00, z_hi=1.31, step=0.005):
    """The smooth surface the face would have if it had no features in it.

    The eye sockets are pits and the face is convex, so the front depth is
    sampled, the pits are found by a morphological closing, and the dome is
    built from everything that is *not* a pit.  The result is the surface the
    reference's paint was drawn on.
    """
    import numpy as np

    g = _raster_front(objs, slots, x_half, z_lo, z_hi, step)
    Y = _grid_fill(g["Y"])
    k = 25
    closed = _min_filter(_max_filter(Y, k), k)
    pits = (closed - Y) > 0.008
    solid = ~pits
    num = _box_blur(np.where(solid, Y, 0.0), 9)
    den = _box_blur(solid.astype(np.float64), 9)
    g["dome"] = num / np.maximum(den, 1e-9)
    g["Yf"] = Y
    return g


def _grid_sample(g, x, z):
    """Sample the dome's depth at (x, z)."""
    import numpy as np

    i = int(np.clip(int(round((x + g["x_half"]) / g["step"])),
                    0, g["nx"] - 1))
    j = int(np.clip(int(round((z - g["z_lo"]) / g["step"])),
                    0, g["nz"] - 1))
    return float(g["dome"][j, i])


def _loop_order(chain):
    """The vertex indices of a boundary chain, in order along it.

    A closed loop comes back to where it started, so the last index repeats
    the first; an open chain does not.
    """
    order = [chain[0].verts[0].index, chain[0].verts[1].index]
    rest = list(chain[1:])
    while rest:
        last = order[-1]
        pick = None
        for k, e in enumerate(rest):
            if e.verts[0].index == last or e.verts[1].index == last:
                pick = k
                break
        if pick is None:
            break
        e = rest.pop(pick)
        other = (e.verts[1].index if e.verts[0].index == last
                 else e.verts[0].index)
        order.append(other)
    return order


def _poly_area(poly):
    a = 0.0
    n = len(poly)
    for i in range(n):
        x1, z1 = poly[i]
        x2, z2 = poly[(i + 1) % n]
        a += x1 * z2 - x2 * z1
    return abs(a) * 0.5


def _poly_inside(poly, px, pz):
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, zi = poly[i]
        xj, zj = poly[j]
        if (zi > pz) != (zj > pz):
            if px < (xj - xi) * (pz - zi) / (zj - zi) + xi:
                inside = not inside
        j = i
    return inside


def _close_zone_holes(objs, in_zone, mat_slot, snap=None, y_front=None,
                      max_ring=160, max_span=0.110):
    """Close the holes the clean-up opened.

    A hole in the face is not a small thing: the camera looks straight through
    it and sees the inside of the head, and it reads as a black speck punched
    into the face.

    Two things make this harder than it sounds.  The first is that a hole has
    to be followed *out* of the face zone to be found at all - a chain cut off
    at the edge of the zone is not a loop, and a loop that is not closed
    cannot be filled.  The second is the eye socket: what is left of it is a
    ragged ring around the painted eye, and the reference paints that eye on
    one smooth surface, so the ring has to come back as a smooth patch of
    face rather than as a flat lid.

    So the hole is filled with a fan of triangles whose centre sits on the
    dome - the surface the reference's paint was drawn on - and every vertex
    of the patch is pulled onto it.  The socket stops being a socket.
    """
    import bmesh

    total = 0
    for ob in objs:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.faces.ensure_lookup_table()
        bm.faces.index_update()
        bm.verts.index_update()
        bm.edges.index_update()
        # The vertex index is the key everything else is looked up by, and
        # the sequence's own lookup table goes stale the moment anything is
        # created, so the map is built once and used from then on.
        vmap = {v.index: v for v in bm.verts}

        # Every boundary edge, not only the ones inside the zone: a hole
        # that runs out of the zone has to be followed out of it, or the
        # loop is cut in half and cannot be filled.
        bedges = [e for e in bm.edges if len(e.link_faces) == 1]
        if not bedges:
            bm.free()
            continue
        by_vert = {}
        for e in bedges:
            for v in e.verts:
                by_vert.setdefault(v.index, []).append(e)
        seen = set()
        chains = []
        for e in bedges:
            if e.index in seen:
                continue
            stack = [e]
            seen.add(e.index)
            chain = []
            while stack:
                cur = stack.pop()
                chain.append(cur)
                for v in cur.verts:
                    for nb in by_vert.get(v.index, ()):
                        if nb.index in seen:
                            continue
                        seen.add(nb.index)
                        stack.append(nb)
            chains.append(chain)

        keep = []
        for chain in chains:
            verts = {v.index for e in chain for v in e.verts}
            if not any(in_zone(vmap[i].co) for i in verts):
                continue
            if y_front is not None:
                ys = [vmap[i].co.y for i in verts]
                if sum(ys) / len(ys) > y_front:
                    # the inside of the skull - not a hole a camera can see
                    continue
            keep.append(chain)
        if not keep:
            bm.free()
            continue

        fresh = []
        for chain in keep:
            order = _loop_order(chain)
            if not order or len(order) < 3:
                continue
            closed = order[0] == order[-1]
            ring = [vmap[i] for i in (order[:-1] if closed else order)]
            # A chain that runs halfway round the head is not a hole in the
            # face, it is the open bottom of the skull, and filling it with a
            # fan would lay a sheet of triangles across the inside of the
            # mouth.  Only the small ones are real holes.
            xs = [v.co.x for v in ring]
            zs = [v.co.z for v in ring]
            if (len(ring) > max_ring
                    or max(xs) - min(xs) > max_span
                    or max(zs) - min(zs) > max_span):
                continue
            cx = sum(v.co.x for v in ring) / len(ring)
            cz = sum(v.co.z for v in ring) / len(ring)
            ys = [v.co.y for v in ring]
            # The boundary of the hole is already sitting on the face, so
            # the patch is grown inward from it: an outer ring welded to the
            # rim, an inner ring halfway to the middle, and a fan in the
            # centre.  The middle of a hole in a convex face is a little
            # further forward than the rim - that is what the face does.
            half = max(max(v.co.x for v in ring) - min(v.co.x for v in ring),
                        max(v.co.z for v in ring) - min(v.co.z for v in ring)) * 0.5
            cy = sum(ys) / len(ys) - (half * half) / (2.0 * 0.344)
            centre = bm.verts.new((cx, cy, cz))
            inner = []
            for v in ring:
                inner.append(bm.verts.new((
                    v.co.x + (cx - v.co.x) * 0.45,
                    v.co.y + (cy - v.co.y) * 0.45,
                    v.co.z + (cz - v.co.z) * 0.45)))
            n = len(ring)
            for i in range(n):
                j = (i + 1) % n
                for quad in ((ring[i], ring[j], inner[j], inner[i]),
                             (centre, inner[i], inner[j])):
                    try:
                        fresh.append(bm.faces.new(quad))
                    except ValueError:
                        pass
        if fresh:
            # A patch whose normal points the wrong way renders black, and
            # recalc_face_normals cannot tell which way is out on an open
            # shell, so the outward direction is decided here.
            bmesh.ops.recalc_face_normals(bm, faces=fresh)
            bm.normal_update()
            for f in fresh:
                c = f.calc_center_median()
                radial = (c.x - 0.0, c.y + 0.314, c.z - 1.14)
                if (radial[0] * f.normal.x + radial[1] * f.normal.y
                        + radial[2] * f.normal.z) < 0.0:
                    bmesh.ops.reverse_faces(bm, faces=[f])
            for f in fresh:
                f.material_index = mat_slot
        print(f"[zone] {len(keep)} holes, {len(fresh)} new faces")
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
        total += len(fresh)
    print(f"[zone] closed {total} hole faces")
    return total



def clean_face_zone(objs, m, regions=None, K=None, zone_x=0.225,
                    zone_z_lo=None, zone_z_hi=None, eye_grow=1.55,
                    keep_shell_frac=0.20, do_fill=True, drop_socket=False,
                    socket_tol=0.006):
    """Take everything off the face that is not the face.

    Three things are living on the face that have no business being there:

    * **Hair.**  Meshy read the painted brows in the photo as real hair and
      rebuilt them as a sheet of strands floating in front of the forehead,
      and the lock over the eye is a handful of very large triangles.  A black
      strand lying across the painted iris is the one thing a photo can never
      fix, so the hair in the face zone goes - the photo has its own brows
      and its own fringe, and they are already in the texture.
    * **The socket rim.**  Meshy rebuilt the eyes as a ball in a socket with a
      raised rim, and that rim is a flat card of skin standing proud of the
      cheek.  It is the one piece of the face the photo has no paint for, so
      it comes back as a pale sheet on the side of the face.
    * **Holes.**  The shells never met, and every gap is a window straight
      through the head.

    The hair goes by height: the fringe above the brow line is the hairstyle
    and it stays, because it is what gives the head its shape.  The rim card
    and the rest go by shell: of everything welded to the face, only the one
    shell that *is* the head is kept.
    """
    import bmesh

    hair_slot = ORDER.index("hair")
    skin_slot = ORDER.index("skin")
    face_slot = ORDER.index("face")
    face_slots = (skin_slot, face_slot)

    if regions is None:
        regions = eye_regions(m, K or 340.0)
    ez = regions[0]["z"]
    rz = max(r["rz"] for r in regions)
    if zone_z_hi is None:
        zone_z_hi = ez + rz * 1.70
    if zone_z_lo is None:
        zone_z_lo = m["z0"] + 0.004

    def in_zone(c, pad=0.0):
        return (zone_z_lo - pad <= c.z <= zone_z_hi + pad
                and abs(c.x) <= zone_x + pad)

    eye_boxes = [(r["x"], r["z"], r["rx"] * eye_grow, r["rz"] * eye_grow * 1.1)
                 for r in regions]

    # ---- 1. which shell is the head? -----------------------------------
    comp = _head_shells(objs, face_slots)
    counts = {}
    for ob in objs:
        for poly in ob.data.polygons:
            if poly.material_index not in face_slots:
                continue
            if not in_zone(poly.center):
                continue
            k = comp[(ob.name, poly.index)]
            counts[k] = counts.get(k, 0) + 1
    if not counts:
        print("[zone] no face shells found, face zone left alone")
        return 0
    head = max(counts, key=counts.get)
    keep_min = counts[head] * keep_shell_frac
    print(f"[zone] face zone x<={zone_x:.3f} z {zone_z_lo:.3f}..{zone_z_hi:.3f}; "
          f"{len(counts)} shells, head has {counts[head]} faces")

    # ---- 2. take it off -----------------------------------------------
    dropped = 0
    flipped = 0
    for ob in objs:
        names = [s.material.name if s.material else ""
                 for s in ob.material_slots]
        hair_slots = {i for i, n in enumerate(names)
                      if n.lower().startswith("hair")}
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.faces.ensure_lookup_table()
        bm.faces.index_update()
        doomed = []
        flip = []
        for f in bm.faces:
            c = f.calc_center_median()
            if f.material_index in hair_slots:
                if in_zone(c):
                    doomed.append(f)
                    continue
                # a single bang triangle can reach across the eye while its
                # own centre sits well above it, so the centre is not the
                # only test - the face's own box is the honest one.
                x0, x1, z0, z1 = _fbox(f)
                for ex, ez2, rx, rz2 in eye_boxes:
                    if (x0 <= ex + rx and x1 >= ex - rx
                            and z0 <= ez2 + rz2 and z1 >= ez2 - rz2):
                        doomed.append(f)
                        break
                continue
            if f.material_index in face_slots:
                if not in_zone(c):
                    continue
                k = comp[(ob.name, f.index)]
                if k == head or counts.get(k, 0) >= keep_min:
                    # A face that looks at the inside of the head cannot wear
                    # the photo - face_texture.apply throws those back to
                    # plain skin, and a patch of plain skin sitting on a
                    # painted face reads as a grey card.  It is turned the
                    # right way round rather than deleted: it is part of the
                    # face, and once it points outwards it wears the photo
                    # like its neighbours and disappears into the paint.
                    if c.y < m["cy"] - 0.04:
                        radial = (c.x - m["cx"], c.y - m["cy"],
                                  c.z - 0.5 * (m["z0"] + m["z1"]))
                        if (radial[0] * f.normal.x + radial[1] * f.normal.y
                                + radial[2] * f.normal.z) < 0.0:
                            flip.append(f)
                    continue
                doomed.append(f)
        if flip:
            bmesh.ops.reverse_faces(bm, faces=flip)
            flipped += len(flip)
        if doomed:
            bmesh.ops.delete(bm, geom=doomed, context="FACES")
            dropped += len(doomed)
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
    print(f"[zone] took {dropped} faces off the face, turned {flipped} round")

    # ---- 2b. the socket's rim and its wall ------------------------------
    #
    # What is still standing in the eye region is the socket Meshy built: a
    # rim of skin standing proud of the cheek, and a wall behind it sinking
    # into the head.  Neither of them is in the reference - the eye is
    # artwork on one smooth surface - so they are measured against the dome
    # and taken away.  The face itself sits barely two millimetres in front
    # of the dome, because the dome is the face with its bumps rounded off,
    # so anything further out than that is not the face.
    if drop_socket:
        dome = _face_dome_grid(objs, face_slots)
        socket = [(r["x"], r["z"], r["rx"] * 1.90, r["rz"] * 1.90 * 1.05)
                  for r in regions]
        socket.append((m["cx"], m.get("nose_z", 1.12), 0.075, 0.075))
        off = 0
        for ob in objs:
            bm = bmesh.new()
            bm.from_mesh(ob.data)
            bm.faces.ensure_lookup_table()
            doomed = []
            for f in bm.faces:
                if f.material_index not in face_slots:
                    continue
                c = f.calc_center_median()
                if not in_zone(c):
                    continue
                hit = False
                for sx, sz, srx, srz in socket:
                    if ((c.x - sx) / srx) ** 2 + ((c.z - sz) / srz) ** 2 <= 1.0:
                        hit = True
                        break
                if not hit:
                    continue
                d = c.y - _grid_sample(dome, c.x, c.z)
                # Only what stands *in front* of the dome goes.  The socket's
                # inner wall sits behind it and is harmless; the rim card
                # standing proud of the cheek is what catches the light.
                if d < -socket_tol:
                    doomed.append(f)
            if doomed:
                bmesh.ops.delete(bm, geom=doomed, context="FACES")
                off += len(doomed)
            bm.to_mesh(ob.data)
            bm.free()
            ob.data.update()
        print(f"[zone] took {off} socket faces off the dome")

    # ---- 3. close what that opened -------------------------------------
    if do_fill:
        # A patch that closes a hole has to land on the surface the paint was
        # drawn on, or it catches the light like a card lying on the cheek.
        dome = _face_dome_grid(objs, face_slots)
        _close_zone_holes(objs, in_zone, skin_slot,
                          snap=lambda x, z: _grid_sample(dome, x, z),
                          y_front=m["cy"] - 0.06)
    return dropped


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

    resculpt_proportions(objs, lo, hi, hair_k=1.0, leg_k=1.0, shoe_k=1.0)
    refine_upper_head(objs, lo, hi, levels=0)
    smooth_reconstruction_spikes(objs, lo, hi)
    soften_hairline(objs, lo, hi)
    soften_cloth_edges(objs, lo, hi)
    mats = materials()
    assign_by_region(objs, mats, lo, hi)
    # The face frame has to exist before anything can ask where the eyes are.
    m = face_metrics(objs, lo, hi)
    shell_faces = hair_shell_faces(objs, lo.z + Z_NECK_FRAC * (hi.z - lo.z))
    flatten_hem_edges(objs, lo, hi, mats)
    # after assign_by_region so the hair material is actually on those shards
    clear_face_fringe(objs, lo, hi, mats, m, skip_faces=shell_faces[0])
    raise_fringe(objs, lo, hi, mats, shrink=1.0)
    relax_head_labels(objs, lo, hi)
    # relax_head_labels smooths the hairline, and the detached bang shells have
    # to outrank that vote or the hairstyle slides back into the forehead.
    # Recompute: clear_face_fringe deleted polygons, so the old face indices
    # no longer point at the same faces.
    mark_hair_shells(objs, hair_shell_faces(
        objs, lo.z + Z_NECK_FRAC * (hi.z - lo.z)))
    # The hair has to come off the painted eyes, and it can only be found by
    # its place - the locks Meshy left over the eye are small shells that the
    # region test files under hair.
    m["K"] = photo_scale(objs, m)
    eyes = eye_regions(m, m["K"])
    trim_eye_hair(objs, m, regions=eyes)
    # The reference's face is painted, not modelled. Clean up what Meshy
    # left there - the sliver triangles, the sawtooth around the sockets,
    # the cracks in the skin, the rebuilt eyebrows - so that the projected
    # photo is the only set of features on the face.
    remove_degenerate_faces(
        objs, slots=(ORDER.index("skin"), ORDER.index("face")))
    smooth_socket_surface(objs, m)
    flatten_face_features(objs, m, fill_only=True,
                          nose=(0.0, m.get("nose_z", 1.12), 0.055))
    # The painted eye has to land on a smooth surface, and Meshy rebuilt the
    # socket as a ball in a raised rim. Put the whole socket back on the dome
    # the reference paints on, and the rim and the shards stop crossing the
    # painted eye.
    m["K"] = photo_scale(objs, m)
    eyes = eye_regions(m, m["K"])
    flatten_eye_dome(objs, m, m["K"], regions=eyes,
                     move=1.35, gap=1.18, blend=1.0, prune=0.020,
                     drop_scale=1.30)
    bury_brows(objs, m)
    # The face itself has to be there before anything is painted on it: the
    # hair Meshy grew out of the painted brows, the card of skin the eye
    # socket left standing proud of the cheek, and the holes between the
    # shells all have to go first.
    clean_face_zone(objs, m, regions=eyes)
    m["K"] = photo_scale(objs, m)
    paint_face(objs, mats, lo, hi, m, regions=eyes)
    # after paint_face: the face pass flattens every non-face UV to (0,0)
    uv_plaid(objs, lo, hi, ORDER.index("plaid"))

    # The skull is an open shell; without a floor you can see straight through
    # the head under the chin and out the back of it.
    plug_head_bottom(objs, mats, m)

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
    # Draco: the model is 180k triangles of smooth-shaded geometry, which is
    # 9.6 MB as raw float attributes and 1.6 MB compressed. model-viewer
    # decodes Draco natively, and this page already loads model-viewer from a
    # Google CDN, so it adds no new external dependency.
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB",
                              use_selection=False, export_apply=True,
                              export_yup=True,
                              export_draco_mesh_compression_enable=True,
                              export_draco_mesh_compression_level=6)
    tris = 0
    for ob in bpy.data.objects:
        if ob.type == "MESH":
            ob.data.calc_loop_triangles()
            tris += len(ob.data.loop_triangles)
    print(f"[done] tris={tris} glb={glb} size={os.path.getsize(glb)}")

    render_views(setup_scene())


if os.environ.get("CHIBI_RUN", "1") == "1":
    main()