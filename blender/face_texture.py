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
        bx, by = P(s * (az_e + 0.26), ez - m["eye_hh"] * 0.72)
        d = np.hypot((X - bx) / (eh * 1.25), (Y - by) / (eh * 0.88))
        cv.paint(np.exp(-d * d * 1.9), BLUSH, 0.55)

        # sclera, then the iris that fills most of it, like the reference. The
        # iris sits inboard and a touch high so the white survives as a crescent
        # on the outer lower lid, which is how the reference reads; a symmetric
        # ring of white just looks like a face-paint mask.
        cv.paint(_ellipse(X, Y, ex, ey, ew, eh), SCLERA)
        cv.paint(_ellipse(X, Y, ex - mx * ew * 0.05, ey + eh * 0.02,
                          ew * 0.840, eh * 0.940), IRIS)

        # upper lash: thick through the middle, tapering to the inner corner,
        # and jutting a little past the outer one like the painted reference
        n = 26
        pts = _arc(ex, ey, ew * 1.03, eh * 1.05, -0.05, math.pi * 1.76,
                   n=n, mirror=mx, lift=eh * 0.04)
        wid = [eh * (0.115 + 0.145 * math.sin(math.pi * (t ** 0.8)) - 0.085 * t ** 2.5)
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


def bake(m, skin_mat, out_dir=None):
    """Render the face into an image and wrap it in a matching material."""
    z0, z1, R = m["z0"], m["z1"], m["radius"]
    raw_w = 2.0 * AZ_HALF * R * PX_PER_UNIT
    raw_h = (z1 - z0) * PX_PER_UNIT
    w = max(64, int(raw_w // 32 + 1) * 32)
    h = max(64, int(raw_h // 32 + 1) * 32)

    cv = Canvas(w, h, SKIN)
    _paint_face(cv, m)

    img = bpy.data.images.new("FacePaint", w, h, alpha=False)
    img.colorspace_settings.name = "sRGB"
    rgba = np.empty((h, w, 4), np.float32)
    rgba[:, :, :3] = cv.rgb
    rgba[:, :, 3] = 1.0
    img.pixels.foreach_set(np.ascontiguousarray(rgba).ravel())
    img.file_format = "PNG"
    img.update()
    img.pack()
    if out_dir:
        img.filepath_raw = os.path.join(out_dir, "face_paint.png")
        img.save()
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

    print(f"[face] baked {w}x{h} texture "
          f"(az +/-{math.degrees(AZ_HALF):.0f} deg, "
          f"eye_az={math.degrees(m['eye_az']):.1f} deg, R={R:.4f})")
    return mat


def apply(objs, m, mat, slot, z_neck, skin_slot):
    """Give the skull its material and the cylindrical UVs that go with it.

    Only *skin* above the neck switches over - the bangs and the side locks are
    separate shells that pass through the same height band, and painting those
    too turns the whole hairstyle into forehead. Everything else falls outside
    the painted region anyway and clamps onto its plain-skin border, which is
    exactly what the cheeks, ears and jaw want.
    """
    for ob in objs:
        uvl = ob.data.uv_layers.get("HeadUV") or ob.data.uv_layers.new(name="HeadUV")
        ob.data.uv_layers.active = uvl
        cx, cy = m["cx"], m["cy"]
        du = 1.0 / (2.0 * AZ_HALF)
        inv = 1.0 / (m["z1"] - m["z0"])
        cos = [v.co.copy() for v in ob.data.vertices]
        data = uvl.data

        n = 0
        for p in ob.data.polygons:
            # Everything that is not the face gets a flat (0, 0). The layer is
            # per-loop whatever we do, but a body full of zeros quantises down
            # to almost nothing, while projected coordinates on a mesh this
            # dense add a megabyte of noise to the GLB.
            if p.center.z > z_neck and p.material_index == skin_slot:
                p.material_index = slot
                n += 1
                for li in p.loop_indices:
                    c = cos[ob.data.loops[li].vertex_index]
                    u = math.atan2(c.x - cx, -(c.y - cy)) * du + 0.5
                    v = (c.z - m["z0"]) * inv
                    data[li].uv = (min(max(u, 0.0), 1.0),
                                   min(max(v, 0.0), 1.0))
            else:
                for li in p.loop_indices:
                    data[li].uv = (0.0, 0.0)
        ob.data.update()
        print(f"[face] {ob.name}: {n} polygons switched to the painted face")