"""Bake the facial features into a cylindrical head texture.

Why a texture: painting the eyes as *per-face materials* cannot work on this
grid. The border between two materials snaps to the nearest triangle edge, so
every eye comes out as a ring of sawteeth, and a squashed sphere laid on the
skull lifts off the surface and smears into a stain. Both were tried, both read
as a rash rather than a face.

The reference art is painted too, so paint here as well. Features go into a 2D
image which is then wrapped onto the skull with a cylindrical (azimuth, height)
unwrap. A planar projection would be simpler but shears apart at 3/4 view;
azimuth keeps the face wrapped around the round head that model-viewer's
auto-rotate shows.

The unwrap is isotropic on purpose: horizontal pixels are arc length at the head
radius, vertical pixels are height, both at PX_PER_UNIT, so a circle drawn here
lands on the skin as a circle. Only the per-feature X foreshortening at the
outer edges of the face is corrected for.
"""

import bpy
import math
import os

import numpy as np

AZ_HALF = math.radians(58.0)   # half-angle the texture spans, front is 0
PX_PER_UNIT = 3200.0           # painted resolution, pixels per world unit

# sRGB, matched to the Skin material so the face and the hands agree
SKIN = (0.988, 0.831, 0.784)
SCLERA = (0.980, 0.972, 0.965)
IRIS = (0.129, 0.082, 0.063)
LASH = (0.055, 0.042, 0.040)
BROW = (0.078, 0.060, 0.054)
MOUTH = (0.706, 0.216, 0.176)
BLUSH = (0.976, 0.600, 0.573)
WHITE = (1.0, 1.0, 1.0)


# --------------------------------------------------------------- primitives
def _soft(dist, feather):
    """Antialiased inside-test: 1 well inside the shape, 0 well outside."""
    return np.clip(0.5 - dist / feather, 0.0, 1.0)


def _ellipse(X, Y, cx, cy, rx, ry, feather=2.0):
    dx = (X - cx) / rx
    dy = (Y - cy) / ry
    return _soft((np.sqrt(dx * dx + dy * dy) - 1.0) * min(rx, ry), feather)


def _stroke(X, Y, pts, widths, feather=1.6):
    """Distance-to-polyline with a per-vertex width, so it can taper."""
    n = len(pts)
    best = None
    bestt = None
    for i in range(n - 1):
        ax, ay = pts[i]
        bx, by = pts[i + 1]
        dx, dy = bx - ax, by - ay
        L2 = max(dx * dx + dy * dy, 1e-9)
        t = np.clip(((X - ax) * dx + (Y - ay) * dy) / L2, 0.0, 1.0)
        d = np.hypot(X - (ax + t * dx), Y - (ay + t * dy))
        s = i + t
        if best is None:
            best = d
            bestt = s.copy()
        else:
            take = d < best
            best[take] = d[take]
            bestt[take] = s[take]

    u = np.clip(bestt / (n - 1.0), 0.0, 1.0)
    arr = np.asarray(widths, np.float32)
    i0 = np.clip((u * (len(arr) - 1)).astype(np.int32), 0, len(arr) - 2)
    fr = u * (len(arr) - 1) - i0
    wv = arr[i0] * (1.0 - fr) + arr[i0 + 1] * fr
    return _soft(best - wv, feather)


def _bez(p0, p1, p2, n=20):
    out = []
    for i in range(n):
        t = i / (n - 1.0)
        s = 1.0 - t
        out.append((s * s * p0[0] + 2 * s * t * p1[0] + t * t * p2[0],
                    s * s * p0[1] + 2 * s * t * p1[1] + t * t * p2[1]))
    return out


def _arc(cx, cy, rx, ry, a0, a1, n=26, mirror=1.0, lift=0.0):
    return [(cx + mirror * rx * math.cos(a0 + (a1 - a0) * i / (n - 1.0)),
             cy + ry * math.sin(a0 + (a1 - a0) * i / (n - 1.0)) + lift)
            for i in range(n)]


class Canvas:
    """Bottom-left origin pixel buffer, row 0 = chin so it matches image.v."""

    def __init__(self, w, h, base):
        self.w, self.h = w, h
        self.X = np.broadcast_to(
            np.arange(w, dtype=np.float32)[None, :], (h, w))
        self.Y = np.broadcast_to(
            np.arange(h, dtype=np.float32)[:, None], (h, w))
        self.rgb = np.empty((h, w, 3), np.float32)
        self.rgb[:] = np.asarray(base, np.float32)

    def paint(self, mask, color, alpha=1.0):
        a = (mask * alpha).astype(np.float32)[..., None]
        np.multiply(self.rgb, 1.0 - a, out=self.rgb)
        self.rgb += np.asarray(color, np.float32) * a


# ----------------------------------------------------------------- the face
def _paint_face(cv, m):
    X, Y = cv.X, cv.Y
    ez, az_e = m["eye_z"], m["eye_az"]
    ew = m["eye_hw"] * PX_PER_UNIT
    eh = m["eye_hh"] * PX_PER_UNIT

    def P(az, z):
        return ((az / (2.0 * AZ_HALF) + 0.5) * cv.w,
                (z - m["z0"]) / (m["z1"] - m["z0"]) * cv.h)

    mx0, my0 = P(0.0, ez)

    for s in (-1, 1):
        mx = float(s)                      # +1 = screen right eye
        ex, ey = P(s * az_e, ez)

        # blush first, everything else sits on top of it. P has to be fed world
        # z: eh is pixels, so mixing the two drops the blush off the chin.
        bx, by = P(s * (az_e + 0.24), ez - m["eye_hh"] * 1.05)
        d = np.hypot((X - bx) / (eh * 1.45), (Y - by) / (eh * 1.00))
        cv.paint(np.exp(-d * d * 1.7), BLUSH, 0.70)

        # sclera, then the iris. The reference keeps the white as a crescent on
        # the outer lower lid only - the iris is pushed inboard and up so the
        # inner corner and the top stay solid dark. An iris centred in the
        # white leaves a ring all the way round and reads as a stare.
        cv.paint(_ellipse(X, Y, ex, ey, ew, eh), SCLERA)
        cv.paint(_ellipse(X, Y, ex - mx * ew * 0.13, ey + eh * 0.07,
                          ew * 0.760, eh * 0.820), IRIS)

        # upper lash: thick through the middle, tapering to the inner corner,
        # and jutting a little past the outer one like the painted reference
        n = 26
        pts = _arc(ex, ey, ew * 1.03, eh * 1.05, -0.05, math.pi * 1.76,
                   n=n, mirror=mx, lift=eh * 0.04)
        wid = [eh * (0.135 + 0.160 * math.sin(math.pi * (t ** 0.8)) - 0.090 * t ** 2.5)
               for t in (i / (n - 1.0) for i in range(n))]
        cv.paint(_stroke(X, Y, pts, wid, 1.8), LASH)

        # lower lash, faint, only across the outer half
        cv.paint(_stroke(X, Y, _arc(ex, ey, ew * 1.02, eh * 1.02,
                                    0.0, 0.42 * math.pi, n=10,
                                    mirror=mx, lift=eh * 0.03),
                         [eh * 0.035] * 10, 1.6), LASH, alpha=0.80)

        # speculars - the one thing that has to sit on top of the iris
        cv.paint(_ellipse(X, Y, ex + mx * ew * 0.24, ey + eh * 0.28,
                          ew * 0.240, ew * 0.240), WHITE)
        cv.paint(_ellipse(X, Y, ex - mx * ew * 0.16, ey - eh * 0.28,
                          ew * 0.115, ew * 0.115), WHITE)

        # brow, arched, inner end low and outer end high. The fringe hangs lower than
        # the brow line and clips it the same way it clips the reference, so the
        # colour has to sit almost on the hair - any lighter and the surviving
        # fragments read as smudges along the hairline rather than as a brow.
        b0 = (ex - mx * ew * 0.86, ey + eh * 1.26)
        b1 = (ex + mx * ew * 0.10, ey + eh * 1.46)
        b2 = (ex + mx * ew * 1.12, ey + eh * 1.32)
        pts = _bez(b0, b1, b2, 20)
        wid = [eh * (0.130 + 0.100 * math.sin(math.pi * (t ** 0.7)) - 0.090 * t ** 3)
               for t in (i / 19.0 for i in range(20))]
        cv.paint(_stroke(X, Y, pts, wid, 1.6), BROW)

    # ---- nose: the mesh already has one, so only a whisper of a shadow
    nx, ny = P(0.0, m["nose_z"])
    d = np.hypot((X - nx) / (eh * 0.42), (Y - ny) / (eh * 0.26))
    cv.paint(np.exp(-d * d * 2.4), (0.930, 0.762, 0.720), 0.30)

    # ---- mouth: a closed smile - corners up, middle down
    mz = m["mouth_z"]
    mw = m["mouth_hw"] * PX_PER_UNIT
    corner = mz + mw * 0.24
    pts = _bez((mx0 - mw, corner), (mx0, mz - mw * 0.30), (mx0 + mw, corner), 22)
    wid = [eh * (0.028 + 0.058 * math.sin(math.pi * (i / 21.0)) ** 0.6)
           for i in range(22)]
    cv.paint(_stroke(X, Y, pts, wid, 1.5), MOUTH)


def _linear_to_srgb(x):
    """Blender hands back linear float pixels, but every threshold worth
    talking about - "is this backdrop grey or is it the white of an eye" -
    lives in sRGB. Compare in sRGB or the thresholds are off by a factor."""
    return np.where(x <= 0.0031308, x * 12.92,
                    1.055 * np.power(np.clip(x, 0.0, 1.0), 1.0 / 2.4) - 0.055)


def _srgb_to_linear(x):
    x = np.clip(x, 0.0, 1.0)
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


def _border_flood(mask):
    """True for the pixels of mask that are connected to the image border.

    The reference is a cut-out standing on a checkerboard, and the two tones
    of that checkerboard sit right next to the white of the eyes in value, so
    colour alone cannot tell them apart.  Reachability can: the whites are
    ringed by the lash and never touch the edge of the picture, while the
    checkerboard wraps all the way around the character.  Only the reachable
    part of the checkerboard is really background.

    Runs are unioned row by row, which keeps this to a few thousand pairs
    instead of a few million pixels.
    """
    h, w = mask.shape
    parent = [0]                                   # index 0 is a dummy root

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            if ra < rb:
                parent[rb] = ra
            else:
                parent[ra] = rb

    runs = []                                      # (y, start, end, id)
    prev = []
    for y in range(h):
        row = mask[y]
        d = np.diff(row.astype(np.int8))
        starts = np.flatnonzero(d == 1) + 1
        ends = np.flatnonzero(d == -1)
        if row[0]:
            starts = np.concatenate(([0], starts))
        if row[-1]:
            ends = np.concatenate((ends, [w - 1]))
        cur = []
        for s, e in zip(starts.tolist(), ends.tolist()):
            # The id has to be the index this run gets in parent, or find()
            # reads the wrong slot and the whole union-find is nonsense.
            rid = len(parent)
            runs.append((y, s, e, rid))
            parent.append(rid)
            cur.append((s, e, rid))
        i = j = 0
        while i < len(prev) and j < len(cur):
            ps, pe, pid = prev[i]
            cs, ce, cid = cur[j]
            if pe < cs:
                i += 1
            elif ce < ps:
                j += 1
            else:
                union(pid, cid)
                if pe < ce:
                    i += 1
                else:
                    j += 1
        prev = cur

    border = set()
    for y, s, e, rid in runs:
        if y == 0 or y == h - 1 or s == 0 or e == w - 1:
            border.add(find(rid))
    out = np.zeros_like(mask)
    for y, s, e, rid in runs:
        if find(rid) in border:
            out[y, s:e + 1] = True
    return out


def _fill_backdrop(rgb, backdrop):
    """Replace the backdrop with the nearest character pixel.

    The cut-out is smeared outwards along its own row, so the checkerboard
    never reaches the texture.  Rows with no character at all - everything
    under the chin - are copied from the nearest row that has some.
    """
    good = ~backdrop
    h, w = good.shape
    out = rgb.copy()

    # Vertically first.  The rows under the chin have no character in them at
    # all, and filling those sideways smears the row's edge pixels across the
    # whole row - which is what put the grey stripes under the jaw.
    idx = np.arange(h)[:, None]
    fwd_v = np.maximum.accumulate(np.where(good, idx, -1), axis=0)
    bwd_v = np.minimum.accumulate(np.where(good, idx, h)[::-1], axis=0)[::-1]
    use_v = np.clip(np.where(fwd_v >= 0, fwd_v, bwd_v), 0, h - 1)
    out = np.take_along_axis(out, use_v[:, :, None], axis=0)

    # Then sideways, for the columns that are nothing but backdrop.
    idx = np.arange(w)[None, :]
    fwd = np.maximum.accumulate(np.where(good, idx, -1), axis=1)
    bwd = np.minimum.accumulate(np.where(good, idx, w)[:, ::-1], axis=1)[:, ::-1]
    use = np.clip(np.where(fwd >= 0, fwd, bwd), 0, w - 1)
    # use holds a *column* for every pixel, so the gather has to run along
    # the columns - a flat row-major gather would read the wrong pixel.
    out = np.take_along_axis(out, use[:, :, None], axis=1)
    has = good.any(axis=1)
    if not has.all():
        rows = np.flatnonzero(has)
        if len(rows):
            src = rows[np.clip(np.searchsorted(rows, np.arange(h)), 0, len(rows) - 1)]
            out[~has] = out[src[~has]]
        else:
            out[~has] = SKIN
    return out


def project_reference(m, ref_path):
    """Build the head texture by projecting the reference photo onto the skull.

    Hand-painting the features gets close but never close *enough*: an anime eye
    is a lash shape, an iris gradient and two speculars, and no set of ellipses
    reads the same. The reference already has all of it, so use its pixels.

    Horizontal mapping is angular on purpose. A naive x = f(u) paste would
    double-foreshorten the cheeks, because the photo is already a projection of a
    round head; x_ref = cx + K*sin(azimuth) undoes that so the outer corners land
    where they are on the model. Vertical stays linear - the head is tall enough
    there that sin() buys nothing and costs the jaw.

    K is the scale that ties the photo to the model: it is the number of photo
    pixels per radian of head rotation. It is measured, not guessed - see
    chibi_restyle.face_scale(), which reads the model's own head width and the
    photo's eye spacing and solves for it.

    Measured off ref/chibi-ref-meshy.png (1920x1920), which is a JPEG cut-out
    with the checkerboard backdrop baked into the pixels - there is no alpha
    channel to mask with, so the backdrop is found by colour and by
    reachability, then painted over before anything is sampled.
    """
    src = bpy.data.images.load(ref_path)
    src.colorspace_settings.name = "sRGB"
    sw, sh = src.size
    buf = np.empty(sw * sh * 4, dtype=np.float32)
    src.pixels.foreach_get(buf)
    flat = buf.reshape(sh, sw, 4)
    lin = flat[::-1, :, :3]                       # top-down rows, linear

    srgb = _linear_to_srgb(lin)
    mx = srgb.max(axis=2)
    mn = srgb.min(axis=2)
    # Loose on purpose.  Neutral and bright covers the whole checkerboard and
    # also the whites of the eyes, and that is fine: the flood below only
    # claims the part of the backdrop that is connected to the edge of the
    # picture, and the whites are ringed by the lash, so they are not.
    checker = ((mx - mn) < (12.0 / 255.0)) & (mx > (150.0 / 255.0))
    backdrop = _border_flood(checker)
    ref = _fill_backdrop(lin, backdrop)
    print(f"[face] backdrop {int(backdrop.sum())} of {sw * sh} px "
          f"({100.0 * backdrop.mean():.1f}%)")

    z0, z1, R = m["z0"], m["z1"], m["radius"]
    W = max(64, int(2.0 * AZ_HALF * R * PX_PER_UNIT // 32 + 1) * 32)
    H = max(64, int((z1 - z0) * PX_PER_UNIT // 32 + 1) * 32)

    chin_y, hair_y = 893.0, 550.0
    cx = 960.0
    K = m.get("K", 340.0)

    u = (np.arange(W) + 0.5) / W
    xs = np.clip(np.round(cx + K * np.sin((u - 0.5) * 2.0 * AZ_HALF)).astype(int),
                 0, sw - 1)

    # Vertical: the texture's rows are the model's uniform height grid. The
    # model's chin (z0) is the photo's chin row and its hairline (z1) is the
    # photo's hairline row, so the warp is one straight line between them.
    v = (np.arange(H) + 0.5) / H                    # 0 = chin = canvas bottom
    ys = np.clip(np.round(chin_y - v * (chin_y - hair_y)).astype(int), 0, sh - 1)
    # No per-column clamp. The reference is a cut-out, and the column of a
    # cut-out is not a single span - it is the hair, then a gap of backdrop
    # between the strands, then the face. Clamping a row into the span of
    # the backdrop that happens to be in that column drags the sample onto
    # the wrong row of the photo, and since the eye is the highest contrast
    # thing in it, the result is a stack of horizontal bands right across
    # the eye. The backdrop that does slip through is replaced below.
    ys2 = np.broadcast_to(ys[:, None], (H, W))

    rgb = ref[ys2, xs[None, :]].copy()

    # The backdrop was painted over in the photo itself, so every sample below
    # is already a character pixel.  This is only a tripwire: if the flood
    # fill ever misses a square of checkerboard, say so instead of shipping
    # it as a stripe.
    print(f"[face] {int(backdrop[ys2, xs[None, :]].sum())} of {H * W} samples "
          f"came from the backdrop region (already painted over)")

    # The photo already carries baked 3D shading. Left at full strength the
    # render's own lighting lands on top of it and the face goes muddy - the
    # blush in particular turns into a red mask. Pull the contrast back so the
    # realtime lighting is what shades the face.
    #
    # In sRGB, not in linear. The eye of the reference is almost black, and
    # squeezing the range in linear space lifts those blacks into grey: the
    # iris comes out as a flat grey disc instead of the deep black of the
    # photo. Perceptual compression keeps the blacks where they are.
    srgb = _linear_to_srgb(rgb)
    srgb = 0.5 + (srgb - 0.5) * 0.86
    srgb[:, :, 0] *= 0.94                          # blush reads far too hot
    rgb = _srgb_to_linear(srgb)

    bpy.data.images.remove(src)
    print(f"[face] projected {ref_path} -> {W}x{H} texture  K={K:.1f} "
          f"cx={cx:.0f} chin={chin_y:.0f} hair={hair_y:.0f}")
    return rgb


def bake(m, skin_mat, out_dir=None, ref_path=None):
    """Wrap the head texture in a material matched to the skin shader."""
    if ref_path:
        rgb = project_reference(m, ref_path)
        h, w = rgb.shape[0], rgb.shape[1]
    else:
        z0, z1, R = m["z0"], m["z1"], m["radius"]
        w = max(64, int(2.0 * AZ_HALF * R * PX_PER_UNIT // 32 + 1) * 32)
        h = max(64, int((z1 - z0) * PX_PER_UNIT // 32 + 1) * 32)
        cv = Canvas(w, h, SKIN)
        _paint_face(cv, m)
        rgb = cv.rgb

    img = bpy.data.images.new("FacePaint", w, h, alpha=False)
    img.colorspace_settings.name = "sRGB"
    rgba = np.empty((h, w, 4), np.float32)
    rgba[:, :, :3] = rgb
    rgba[:, :, 3] = 1.0
    img.pixels.foreach_set(np.ascontiguousarray(rgba).ravel())
    img.file_format = "PNG"
    img.update()
    if out_dir:
        img.filepath_raw = os.path.join(out_dir, "face_paint.png")
        img.save()
        # Reload it. An image whose pixels were written straight into memory
        # never had its mipmaps built, and a broken mipmap chain draws as
        # fine horizontal bands wherever the texture is minified - which is
        # exactly what the white of the eyes did.
        path = img.filepath_raw
        bpy.data.images.remove(img)
        img = bpy.data.images.load(path)
        img.name = "FacePaint"
        img.colorspace_settings.name = "sRGB"
    img.pack()
    img.filepath_raw = ""

    mat = bpy.data.materials.new("Face")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    src = skin_mat.node_tree.nodes["Principled BSDF"]
    for key in ("Roughness", "Metallic", "Specular IOR Level",
                "Subsurface Weight", "Subsurface Radius"):
        if key in bsdf.inputs and key in src.inputs:
            bsdf.inputs[key].default_value = src.inputs[key].default_value
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Cubic"
    tex.location = (-420, 220)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])

    print(f"[face] {w}x{h} texture, az +/-{math.degrees(AZ_HALF):.0f} deg, "
          f"eye_az={math.degrees(m['eye_az']):.1f} deg, "
          f"source={'reference ' + ref_path if ref_path else 'painted'}")
    return mat


def apply(objs, m, mat, slot, z_neck, skin_slots, keep_regions=None):
    """Give the skull its material and the cylindrical UVs that go with it.

    Only *skin* above the neck switches over - the bangs and the side locks are
    separate shells that pass through the same height band, and painting those
    too turns the whole hairstyle into forehead. Everything else falls outside
    the painted region anyway and clamps onto its plain-skin border, which is
    exactly what the cheeks, ears and jaw want.

    `keep_regions` is a list of (x, z, rx, rz) ellipses - the painted eyes -
    where the "inside of the skull" rule is suspended. The wall of the eye
    socket faces inwards, so it would be thrown out of the face material and
    come back as plain skin, and then poke through the black of the painted
    iris as a pale shard.
    """
    if isinstance(skin_slots, int):
        skin_slots = (skin_slots,)
    if keep_regions is None:
        keep_regions = []
    for ob in objs:
        uvl = ob.data.uv_layers.get("HeadUV") or ob.data.uv_layers.new(name="HeadUV")
        ob.data.uv_layers.active = uvl
        cx, cy = m["cx"], m["cy"]
        zc = 0.5 * (m["z0"] + m["z1"])
        du = 1.0 / (2.0 * AZ_HALF)
        inv = 1.0 / (m["z1"] - m["z0"])
        cos = [v.co.copy() for v in ob.data.vertices]
        nos = [p.normal.copy() for p in ob.data.polygons]
        data = uvl.data

        n = 0
        for p in ob.data.polygons:
            # Everything that is not the face gets a flat (0, 0). The layer is
            # per-loop whatever we do, but a body full of zeros quantises down
            # to almost nothing, while projected coordinates on a mesh this
            # dense add a megabyte of noise to the GLB.
            if p.center.z > z_neck and p.material_index in skin_slots:
                us = []
                for li in p.loop_indices:
                    c = cos[ob.data.loops[li].vertex_index]
                    u = math.atan2(c.x - cx, -(c.y - cy)) * du + 0.5
                    us.append(u)
                # The inside of the skull. Meshy leaves the head as an open
                # shell and the inside of the back of it shows through the
                # opening under the chin. Those faces point inwards, so they
                # are the ones whose normal disagrees with the direction away
                # from the middle of the head - and they must not wear the
                # photo, which would smear the picture across them.
                radial = (p.center.x - cx, p.center.y - cy, p.center.z - zc)
                nrm = nos[p.index]
                keep = any(((p.center.x - ex) / rx) ** 2
                           + ((p.center.z - ez) / rz) ** 2 <= 1.0
                           for ex, ez, rx, rz in keep_regions)
                if (radial[0] * nrm.x + radial[1] * nrm.y + radial[2] * nrm.z) < 0.0 \
                        and not keep:
                    p.material_index = skin_slots[0]
                    for li in p.loop_indices:
                        data[li].uv = (0.0, 0.0)
                    continue
                # A polygon that falls outside the face is not the face. The
                # ears sit past the edge of the photo, and the inside of the
                # skull shows through the gaps Meshy left in the sockets.
                # Both of them clamp onto one column of the photo, and that
                # column is the reference's hair: the ears come out grey and
                # the inside of the head draws as a stack of horizontal bands
                # over the eye. So neither gets the face material at all.
                #
                # The material has to be put back to plain skin here, not just
                # the UV: the face material is a texture, and its corner is
                # the photo's backdrop, so a face-material polygon that kept
                # the painted UVs would still read as a grey patch.
                if min(us) < 0.08 or max(us) > 0.92:
                    p.material_index = skin_slots[0]
                    for li in p.loop_indices:
                        data[li].uv = (0.0, 0.0)
                    continue
                p.material_index = slot
                n += 1
                for li, u in zip(p.loop_indices, us):
                    c = cos[ob.data.loops[li].vertex_index]
                    v = (c.z - m["z0"]) * inv
                    data[li].uv = (min(max(u, 0.0), 1.0),
                                   min(max(v, 0.0), 1.0))
            else:
                for li in p.loop_indices:
                    data[li].uv = (0.0, 0.0)
        ob.data.update()
        print(f"[face] {ob.name}: {n} polygons switched to the painted face")