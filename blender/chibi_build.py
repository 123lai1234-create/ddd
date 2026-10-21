"""Build the chibi mascot from scratch, matching astro/public/images/chibi-hero.png.

Coordinate system: Z up, feet at Z=0, character faces -Y (Blender front view).
Total height 1.80, head is ~45% of that (2.2-head-tall chibi proportions).

Run headless:
    blender --background --python chibi_build.py
"""

import bpy
import bmesh
import math
import os
import random
import sys
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import chibi_lib as L

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")

# ---------------------------------------------------------------- proportions
HC = Vector((0.0, 0.0, 1.29))        # head centre
HR = Vector((0.295, 0.285, 0.315))  # head radii (x, y, z)
HCAP_R = Vector((0.355, 0.345, 0.358))  # hair cap radii
HCAP_Z = 1.318

CHIN_Z = HC.z - HR.z               # 0.975
EYE_Z = 1.190
EYE_X = 0.118
BROW_Z = 1.300
NOSE_Z = 1.128
MOUTH_Z = 1.070

random.seed(20261020)


def _make_ribbon(parts, mat, name, p0, p2, radii):
    """A short tapered ribbon between two points — stretched icosphere."""
    mid = (p0 + p2) * 0.5
    direction = (p2 - p0)
    length = direction.length
    if length < 1e-4:
        return
    direction = direction.normalized()
    up = Vector((0.0, 0.0, 1.0))
    if abs(direction.dot(up)) > 0.95:
        up = Vector((1.0, 0.0, 0.0))
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0,
                                         location=tuple(mid))
    ob = bpy.context.object
    ob.name = name
    ob.rotation_euler = up.rotation_difference(direction).to_euler()
    r0, r1 = radii
    ob.scale = (r0, r0, length * 0.55)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    me = ob.data
    for vert in me.vertices:
        t = vert.co.z
        if t > 0.2:
            k = max(1.0 - (t - 0.2) * 1.3, 0.15)
            vert.co.x *= k
            vert.co.y *= k
    L.shade_smooth(ob)
    L.assign(ob, mat)
    parts.append(ob)
    return ob


# ------------------------------------------------------------------ materials
def build_materials():
    m = {}
    m["skin"] = L.make_material("Skin", (0.985, 0.705, 0.620), roughness=0.50,
                                subsurface=0.30, sss_radius=(0.34, 0.11, 0.07))
    m["hair"] = L.make_material("Hair", (0.022, 0.020, 0.028), roughness=0.46,
                                coat=0.18, specular=0.42)
    m["tee"] = L.make_material("Tee", (0.930, 0.930, 0.945), roughness=0.66)
    m["plaid"] = L.make_plaid_material("Plaid", (0.720, 0.105, 0.090),
                                       (0.050, 0.042, 0.042))
    m["pants"] = L.make_material("Pants", (0.700, 0.145, 0.135), roughness=0.60)
    m["shoe"] = L.make_material("Shoe", (0.048, 0.048, 0.055), roughness=0.34,
                                coat=0.25)
    m["sole"] = L.make_material("Sole", (0.950, 0.950, 0.950), roughness=0.45)
    m["sclera"] = L.make_material("Sclera", (0.975, 0.945, 0.905), roughness=0.30)
    m["iris"] = L.make_material("Iris", (0.085, 0.052, 0.048), roughness=0.22)
    m["glint"] = L.make_material("Glint", (1.0, 1.0, 1.0), roughness=0.05)
    m["blush"] = L.make_material("Blush", (0.945, 0.540, 0.495), roughness=0.55)
    m["mouth"] = L.make_material("Mouth", (0.560, 0.145, 0.145), roughness=0.40)
    return m


# --------------------------------------------------------------------- pieces
def face_point(x, z, out=0.0):
    """Point on the front of the head for a given (x, z)."""
    dx = x / HR.x
    dz = (z - HC.z) / HR.z
    s = max(1.0 - dx * dx - dz * dz, 0.03)
    return Vector((x, -HR.y * math.sqrt(s) - out, z))


def build_head(m):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=72, ring_count=44, radius=1.0,
                                         location=tuple(HC))
    ob = bpy.context.object
    ob.name = "Head"
    ob.scale = tuple(HR)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    # taper the jaw so the chin reads round rather than ball-on-a-stick
    for v in ob.data.vertices:
        if v.co.z < 0.0:
            t = min(-v.co.z / HR.z, 1.0)
            k = 1.0 - 0.34 * (t ** 1.7)
            v.co.x *= k
            v.co.y *= k
            v.co.z *= 1.0 + 0.06 * t
        if v.co.y < 0.0:
            v.co.y *= 1.0 - 0.05 * (-v.co.y / HR.y)
    L.shade_smooth(ob)
    L.assign(ob, m["skin"])
    return ob


def build_ears(m):
    obs = []
    for s in (-1, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=18,
                                             radius=1.0,
                                             location=(s * 0.272, 0.004, 1.252))
        ob = bpy.context.object
        ob.name = f"Ear_{'L' if s < 0 else 'R'}"
        ob.scale = (0.046, 0.052, 0.068)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        L.shade_smooth(ob)
        L.assign(ob, m["skin"])
        obs.append(ob)
    return obs


def build_hair(m):
    """Hair = a solid skull cap + straight pointed locks + a slim centre fringe.

    The locks are plain tapered cones (no sideways bend, which collapses the
    length and reads as cauliflower). The cap handles coverage; the locks only
    supply the spiky silhouette.
    """
    parts = []

    # ---------- 1. solid cap over the skull, cut above the brow line
    bpy.ops.mesh.primitive_uv_sphere_add(segments=56, ring_count=34, radius=1.0,
                                         location=(0.0, 0.0, 1.348))
    cap = bpy.context.object
    cap.name = "HairCap"
    cap.scale = (0.316, 0.306, 0.324)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    me = cap.data
    bm = bmesh.new()
    bm.from_mesh(me)
    doomed = [f for f in bm.faces if f.calc_center_median().z < -0.028]
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    bm.to_mesh(me)
    bm.free()
    me.update()
    for v in me.vertices:
        if v.co.z < -0.02:
            v.co.x *= 0.96
            v.co.y *= 0.96
    L.shade_smooth(cap)
    L.assign(cap, m["hair"])
    sol = cap.modifiers.new("Solidify", "SOLIDIFY")
    sol.thickness = 0.020
    sol.offset = 1.0
    parts.append(cap)

    # ---------- 2. locks: straight tapered cones
    def lock(name, origin, direction, length, r_base, lean=0.0):
        # Built at the world origin and then offset so the lock's root lands on
        # `origin` and all of its length points outward.
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0,
                                             location=(0.0, 0.0, 0.0))
        ob = bpy.context.object
        ob.name = name

        d = Vector(direction).normalized()
        up = Vector((0.0, 0.0, 1.0))
        if abs(d.dot(up)) > 0.95:
            up = Vector((1.0, 0.0, 0.0))
        ob.rotation_euler = up.rotation_difference(d).to_euler()

        mesh = ob.data
        for v in mesh.vertices:
            z = v.co.z
            if z > -0.25:
                t = (z + 0.25) / 1.25
                k = max((1.0 - t) ** 0.42, 0.0)
                v.co.x *= k
                v.co.y *= k
            if lean and z > 0.0:
                f = min(z, 1.0) ** 1.4
                v.co.x += lean * f

        half = length * 0.50
        ob.scale = (r_base, r_base, half)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        ob.location = Vector(origin) + d * half
        L.shade_smooth(ob)
        L.assign(ob, m["hair"])
        return ob

    def on_head(theta_deg, phi_deg, k=0.94):
        th = math.radians(theta_deg)
        ph = math.radians(phi_deg)
        dd = Vector((math.sin(th) * math.cos(ph),
                     math.sin(th) * math.sin(ph),
                     math.cos(th)))
        return Vector((dd.x * HR.x * k,
                       dd.y * HR.y * k,
                       HC.z + dd.z * HR.z * k))

    def radial_dir(theta_deg, phi_deg):
        th = math.radians(theta_deg)
        ph = math.radians(phi_deg)
        return Vector((math.sin(th) * math.cos(ph),
                       math.sin(th) * math.sin(ph),
                       math.cos(th)))

    top_locks = [
        ("T0", 18, 205, 0.40, 0.130, -0.45),
        ("T1", 15, 355, 0.42, 0.133, 0.45),
        ("T2", 26, 232, 0.35, 0.116, -0.32),
        ("T3", 26, 308, 0.36, 0.118, 0.32),
        ("T4", 34, 270, 0.32, 0.110, 0.00),
        ("T5", 40,  95, 0.34, 0.112, -0.26),
        ("T6", 48, 245, 0.30, 0.104, -0.28),
        ("T7", 48, 295, 0.31, 0.106, 0.28),
        ("T8", 30, 165, 0.34, 0.114, -0.36),
        ("T9", 30,  15, 0.35, 0.116, 0.36),
    ]
    for name, th, ph, ln, rb, lean in top_locks:
        o = on_head(th, ph, k=0.70)
        d = radial_dir(th, ph)
        parts.append(lock(f"Hair_{name}", o, d, ln, rb, lean))

    # Side locks stay out of the front sector (270 deg) so they never drape
    # over the face.
    for i, ph in enumerate((152, 190, 226, 314, 350, 26, 80)):
        th = random.uniform(54, 72)
        o = on_head(th, ph, k=0.70)
        d = radial_dir(th, ph)
        ln = random.uniform(0.30, 0.40)
        rb = random.uniform(0.098, 0.118)
        lean = -0.35 if math.cos(math.radians(ph)) < 0 else 0.35
        parts.append(lock(f"Hair_Side{i}", o, d, ln, rb, lean))

    for i, ph in enumerate((72, 90, 108)):
        th = random.uniform(42, 64)
        o = on_head(th, ph, k=0.70)
        d = radial_dir(th, ph)
        ln = random.uniform(0.32, 0.40)
        rb = random.uniform(0.100, 0.120)
        parts.append(lock(f"Hair_Back{i}", o, d, ln, rb, -0.25))

    # ---------- 3. slim centre fringe hanging between the eyes
    for i, (ph, th, ln, rb, lean) in enumerate(((-112, 26, 0.30, 0.058, -0.30),
                                                (-90, 36, 0.38, 0.058, 0.00),
                                                (-68, 40, 0.35, 0.050, 0.30))):
        o = on_head(th, ph, k=0.70)
        o.z += 0.09
        d = Vector((ph / 1100.0, -0.52, -0.85))
        parts.append(lock(f"Hair_Bang{i}", o, d, ln, rb, lean))

    return parts


def _carve_face_opening(hair_parts, y_limit=-0.132, z_limit=1.352,
                        x_keep=0.082):
    """Delete hair geometry that would sit in front of the face.

    No matter how the locks are scattered, this guarantees a clean forehead and
    brow opening, leaving only a slim central column for the bangs to hang in.
    """
    for ob in hair_parts:
        me = ob.data
        bm = bmesh.new()
        bm.from_mesh(me)
        doomed = []
        for f in bm.faces:
            c = f.calc_center_median()
            if c.y < y_limit and c.z < z_limit and abs(c.x) > x_keep:
                doomed.append(f)
        if doomed:
            bmesh.ops.delete(bm, geom=doomed, context="FACES")
            bm.to_mesh(me)
            me.update()
        bm.free()


def build_face(m):
    parts = []
    for s in (-1, 1):
        tag = "L" if s < 0 else "R"
        p = face_point(s * EYE_X, EYE_Z, out=0.0)

        # sclera: shallow lens sunk into the skull so only a low dome shows
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=44, ring_count=28, radius=1.0,
            location=(p.x, p.y + 0.040, p.z))
        ob = bpy.context.object
        ob.name = f"EyeWhite_{tag}"
        ob.scale = (0.084, 0.058, 0.094)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        L.shade_smooth(ob)
        L.assign(ob, m["sclera"])
        parts.append(ob)

        # iris sits proud of the sclera, leaving a thin white rim
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=44, ring_count=28, radius=1.0,
            location=(p.x - s * 0.003, p.y + 0.024, p.z - 0.004))
        ob = bpy.context.object
        ob.name = f"Iris_{tag}"
        ob.scale = (0.070, 0.050, 0.080)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        L.shade_smooth(ob)
        L.assign(ob, m["iris"])
        parts.append(ob)

        for gname, off, sc in (("Big", (-0.026, 0.034), (0.026, 0.016, 0.029)),
                               ("Small", (0.024, -0.026), (0.012, 0.009, 0.013))):
            bpy.ops.mesh.primitive_uv_sphere_add(
                segments=24, ring_count=16, radius=1.0,
                location=(p.x + off[0], p.y - 0.014, p.z + off[1]))
            ob = bpy.context.object
            ob.name = f"Glint{gname}_{tag}"
            ob.scale = sc
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            L.shade_smooth(ob)
            L.assign(ob, m["glint"])
            parts.append(ob)

        # brow: stretched icosphere arching across the brow ridge
        b0 = face_point(s * 0.052, BROW_Z - 0.026, out=0.006)
        b2 = face_point(s * 0.180, BROW_Z - 0.038, out=0.002)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1.0,
                                             location=tuple(((b0 + b2) * 0.5)))
        ob = bpy.context.object
        ob.name = f"Brow_{tag}"
        direction = (b2 - b0).normalized()
        up = Vector((0.0, 0.0, 1.0))
        if abs(direction.dot(up)) > 0.95:
            up = Vector((1.0, 0.0, 0.0))
        ob.rotation_euler = up.rotation_difference(direction).to_euler()
        length = (b2 - b0).length
        ob.scale = (0.018, 0.030, length * 0.55)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        # taper the ends
        me = ob.data
        for v in me.vertices:
            t = abs(v.co.z)
            if t > 0.6:
                k = max(1.0 - (t - 0.6) * 2.4, 0.05)
                v.co.x *= k
                v.co.y *= k
        L.shade_smooth(ob)
        L.assign(ob, m["hair"])
        parts.append(ob)

        bp = face_point(s * 0.180, EYE_Z - 0.062, out=-0.004)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=18,
                                             radius=1.0, location=tuple(bp))
        ob = bpy.context.object
        ob.name = f"Blush_{tag}"
        ob.scale = (0.046, 0.028, 0.030)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        L.shade_smooth(ob)
        L.assign(ob, m["blush"])
        parts.append(ob)

    np = face_point(0.0, NOSE_Z, out=-0.004)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=26, ring_count=16, radius=1.0,
                                         location=tuple(np))
    ob = bpy.context.object
    ob.name = "Nose"
    ob.scale = (0.021, 0.016, 0.018)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    L.shade_smooth(ob)
    L.assign(ob, m["mouth"])
    parts.append(ob)

    m0 = face_point(-0.052, MOUTH_Z + 0.006, out=0.002)
    m2 = face_point(0.052, MOUTH_Z + 0.006, out=0.002)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0,
                                         location=tuple(((m0 + m2) * 0.5)))
    ob = bpy.context.object
    ob.name = "Mouth"
    direction = (m2 - m0).normalized()
    up = Vector((0.0, 0.0, 1.0))
    if abs(direction.dot(up)) > 0.95:
        up = Vector((1.0, 0.0, 0.0))
    ob.rotation_euler = up.rotation_difference(direction).to_euler()
    length = (m2 - m0).length
    ob.scale = (0.022, 0.040, length * 0.55)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    L.shade_smooth(ob)
    L.assign(ob, m["mouth"])
    parts.append(ob)

    return parts


def build_body(m):
    parts = []

    parts.append(L.limb("Neck", (0, 0, 0.938), (0, 0, 1.030),
                        0.074, 0.068, m["skin"], sides=24, caps=0.5))

    torso = [(0.600, 0.176, 0.120),
             (0.640, 0.188, 0.126),
             (0.700, 0.180, 0.116),
             (0.760, 0.186, 0.120),
             (0.820, 0.199, 0.126),
             (0.880, 0.204, 0.128),
             (0.925, 0.186, 0.118),
             (0.955, 0.118, 0.086)]
    v, f = L.profile_tube(torso, sides=36, power=2.5)
    parts.append(L.make_obj("Torso", v, f, m["skin"]))

    tee = [(0.688, 0.206, 0.140),
           (0.706, 0.208, 0.142),
           (0.740, 0.197, 0.130),
           (0.820, 0.214, 0.139),
           (0.880, 0.219, 0.142),
           (0.928, 0.200, 0.130),
           (0.958, 0.128, 0.093)]
    v, f = L.profile_tube(tee, sides=36, power=2.6)
    parts.append(L.make_obj("Tee", v, f, m["tee"]))

    for s in (-1, 1):
        tag = "L" if s < 0 else "R"
        parts.append(L.limb(
            f"Sleeve_{tag}",
            (s * 0.186, -0.004, 0.918), (s * 0.236, 0.002, 0.796),
            0.082, 0.070, m["tee"], sides=24, power=2.4, caps=0.65))

        parts.append(L.limb(f"UpperArm_{tag}",
                            (s * 0.192, -0.002, 0.906),
                            (s * 0.254, 0.006, 0.734),
                            0.058, 0.048, m["skin"], sides=20, caps=0.55))
        parts.append(L.limb(f"Forearm_{tag}",
                            (s * 0.254, 0.006, 0.734),
                            (s * 0.274, 0.016, 0.566),
                            0.048, 0.039, m["skin"], sides=20, caps=0.55))

        bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=18,
                                             radius=1.0,
                                             location=(s * 0.277, 0.018, 0.520))
        ob = bpy.context.object
        ob.name = f"Hand_{tag}"
        ob.scale = (0.047, 0.033, 0.063)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        L.shade_smooth(ob)
        L.assign(ob, m["skin"])
        parts.append(ob)
        parts.append(L.limb(f"Thumb_{tag}",
                            (s * 0.252, -0.014, 0.520),
                            (s * 0.238, -0.034, 0.472),
                            0.019, 0.013, m["skin"], sides=14, caps=0.6))

    return parts


def build_waist_shraph(m):
    parts = []
    band = [(0.748, 0.201, 0.134),
            (0.726, 0.213, 0.144),
            (0.690, 0.215, 0.146),
            (0.662, 0.199, 0.132)]
    v, f = L.profile_tube(band, sides=36, power=2.5)
    parts.append(L.make_obj("PlaidBand", v, f, m["plaid"]))

    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, radius=1.0,
                                         location=(0.0, -0.148, 0.712))
    ob = bpy.context.object
    ob.name = "PlaidKnot"
    ob.scale = (0.078, 0.052, 0.052)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    L.shade_smooth(ob)
    L.assign(ob, m["plaid"])
    parts.append(ob)

    tails = [
        ("TailA", (0.022, -0.152, 0.688), (0.098, -0.140, 0.560),
         (0.062, -0.126, 0.402), 0.058),
        ("TailB", (-0.020, -0.150, 0.684), (-0.092, -0.138, 0.548),
         (-0.052, -0.120, 0.386), 0.056),
    ]
    for name, p0, p1, p2, rb in tails:
        _make_ribbon(parts, m["plaid"], f"Plaid_{name}",
                                 Vector(p0), Vector(p2),
                                 (rb, rb * 0.40))

    for s in (-1, 1):
        tag = "L" if s < 0 else "R"
        _make_ribbon(parts, m["plaid"], f"PlaidSleeve_{tag}",
                     Vector((s * 0.190, -0.040, 0.690)),
                     Vector((s * 0.212, -0.040, 0.500)),
                     (0.056, 0.028))
    return parts


def build_pants(m):
    parts = []

    hips = [(0.600, 0.178, 0.126),
            (0.640, 0.186, 0.130),
            (0.690, 0.184, 0.126),
            (0.730, 0.172, 0.118)]
    v, f = L.profile_tube(hips, sides=36, power=2.5)
    parts.append(L.make_obj("PantsHip", v, f, m["pants"]))

    for s in (-1, 1):
        tag = "L" if s < 0 else "R"
        cx = s * 0.113
        leg = [(0.712, 0.118, 0.118, cx),
               (0.640, 0.128, 0.126, cx),
               (0.520, 0.132, 0.130, cx),
               (0.400, 0.131, 0.129, cx),
               (0.290, 0.126, 0.124, cx),
               (0.196, 0.124, 0.121, cx),
               (0.150, 0.131, 0.128, cx),
               (0.132, 0.128, 0.125, cx)]
        v, f = L.profile_tube(leg, sides=32, power=2.4)
        parts.append(L.make_obj(f"PantsLeg_{tag}", v, f, m["pants"]))

        cuff = [(0.132, 0.130, 0.127, cx),
                (0.150, 0.138, 0.135, cx),
                (0.176, 0.136, 0.133, cx)]
        v, f = L.profile_tube(cuff, sides=32, power=2.4)
        parts.append(L.make_obj(f"Cuff_{tag}", v, f, m["pants"]))
    return parts


def build_shoes(m):
    parts = []
    for s in (-1, 1):
        tag = "L" if s < 0 else "R"
        cx = s * 0.128
        cy = -0.024

        sole = [(0.000, 0.140, 0.184, cx, cy),
                (0.014, 0.148, 0.192, cx, cy),
                (0.030, 0.144, 0.188, cx, cy),
                (0.040, 0.138, 0.181, cx, cy)]
        v, f = L.profile_tube(sole, sides=32, power=3.2)
        parts.append(L.make_obj(f"Sole_{tag}", v, f, m["sole"]))

        upper = [(0.034, 0.140, 0.184, cx, cy),
                 (0.062, 0.145, 0.190, cx, cy),
                 (0.092, 0.142, 0.185, cx, cy),
                 (0.118, 0.128, 0.168, cx, cy),
                 (0.138, 0.100, 0.140, cx, cy),
                 (0.152, 0.066, 0.100, cx, cy)]
        v, f = L.profile_tube(upper, sides=32, power=3.2)
        ob = L.make_obj(f"Shoe_{tag}", v, f, m["shoe"])
        ob.rotation_euler = (0.0, 0.0, s * math.radians(-9.0))
        parts.append(ob)

        for k, z in enumerate((0.108, 0.126)):
            _make_ribbon(parts, m["sole"], f"Lace_{tag}_{k}",
                         Vector((cx - 0.046, cy - 0.098, z)),
                         Vector((cx + 0.046, cy - 0.098, z)),
                         (0.011, 0.008))
    return parts


# ------------------------------------------------------------- scene / output
def setup_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)

    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
        try:
            bpy.context.scene.render.engine = engine
            break
        except TypeError:
            continue
    scn = bpy.context.scene
    try:
        scn.eevee.taa_render_samples = 96
        scn.eevee.use_raytracing = True
    except AttributeError:
        pass

    scn.render.resolution_x = 1000
    scn.render.resolution_y = 1300
    scn.render.film_transparent = False
    try:
        scn.view_settings.view_transform = "Standard"
        scn.view_settings.look = "None"
        scn.view_settings.exposure = 0.0
    except (TypeError, ValueError):
        pass

    bpy.ops.mesh.primitive_plane_add(size=14.0, location=(0, 0, 0))
    floor = bpy.context.object
    floor.name = "Floor"
    L.assign(floor, L.make_material("FloorMat", (0.78, 0.79, 0.82), roughness=0.8))

    def area(name, loc, rot, size, energy):
        bpy.ops.object.light_add(type="AREA", location=loc)
        lt = bpy.context.object
        lt.name = name
        lt.data.size = size
        lt.data.energy = energy
        lt.rotation_euler = rot
        return lt

    area("Key", (-1.55, -2.05, 2.45), (math.radians(52), 0, math.radians(-36)),
         2.4, 110)
    area("Fill", (2.25, -1.35, 1.35), (math.radians(76), 0, math.radians(58)),
         3.0, 42)
    area("Rim", (0.85, 2.35, 2.05), (math.radians(128), 0, math.radians(196)),
         2.2, 85)
    area("Top", (0.0, 0.0, 3.4), (0, 0, 0), 3.2, 30)

    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.55, 0.57, 0.62, 1.0)
    bg.inputs[1].default_value = 0.38
    scn.world = world


def look_at(obj, target):
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def render_views():
    scn = bpy.context.scene
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = 70
    cam = bpy.data.objects.new("Cam", cam_data)
    bpy.context.collection.objects.link(cam)
    scn.camera = cam

    target = Vector((0.0, 0.0, 0.95))
    views = {
        "front": (0.0, -4.10, 1.15),
        "three_quarter": (2.70, -3.00, 1.45),
        "side": (4.09, 0.0, 1.15),
        "back": (1.20, 3.90, 1.35),
    }
    out = {}
    for name, loc in views.items():
        cam.location = loc
        look_at(cam, target)
        path = os.path.join(OUT_DIR, f"preview_{name}.png")
        scn.render.filepath = path
        bpy.ops.render.render(write_still=True)
        out[name] = path
    return cam, out


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    m = build_materials()

    setup_scene()
    build_body(m)
    build_head(m)
    build_ears(m)
    build_face(m)
    build_hair(m)
    build_waist_shraph(m)
    build_pants(m)
    build_shoes(m)

    parts = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    root = bpy.data.objects.new("Chibi", None)
    bpy.context.collection.objects.link(root)
    for o in parts:
        o.parent = root

    blend = os.path.join(OUT_DIR, "chibi.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend)

    glb = os.path.join(OUT_DIR, "chibi.glb")
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB",
                              use_selection=False, export_apply=True,
                              export_yup=True)

    render_views()

    tris = 0
    for o in parts:
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
    print(f"[chibi] objects={len(parts)} tris={tris}")
    print(f"[chibi] blend={blend}")
    print(f"[chibi] glb={glb} size={os.path.getsize(glb)}")


main()