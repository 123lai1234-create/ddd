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
# Measured off astro/public/images/chibi-hero.png: the dark iris reads 0.141
# wide and 0.128 tall, its centre 0.151 off the midline at z 1.205.
EYE_Z = 1.205
EYE_X = 0.144
BROW_Z = 1.288
NOSE_Z = 1.115
MOUTH_Z = 1.062

random.seed(20261020)

TAU = math.pi * 2.0


def linspace(a, b, n):
    if n == 1:
        return [a]
    return [a + (b - a) * i / (n - 1.0) for i in range(n)]


def _sweep_poly(name, pts, radius, mat, sides=10, flat=0.6):
    """Sweep a small flattened section along a polyline.

    Used for the upper lash line, which has to follow the curve of the iris
    instead of being a straight bar floating over the eye.
    """
    pts = [Vector(p) for p in pts]
    n = len(pts)
    tangents = []
    for i in range(n):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, n - 1)]
        d = b - a
        tangents.append(d.normalized() if d.length > 1e-9 else Vector((0, 0, 1)))

    ref = Vector((0.0, 0.0, 1.0))
    if abs(tangents[0].dot(ref)) > 0.95:
        ref = Vector((1.0, 0.0, 0.0))
    nrm = (ref - tangents[0] * ref.dot(tangents[0])).normalized()

    rings = []
    for i in range(n):
        t = tangents[i]
        nrm = nrm - t * nrm.dot(t)
        if nrm.length < 1e-6:
            nrm = Vector((0.0, 0.0, 1.0))
        nrm.normalize()
        bn = t.cross(nrm)
        ring = []
        for j in range(sides):
            ang = TAU * j / sides
            p = (pts[i] + nrm * (math.cos(ang) * radius)
                 + bn * (math.sin(ang) * radius * flat))
            ring.append(tuple(p))
        rings.append(ring)

    v, f = L.loft(rings, cap_start=True, cap_end=True)
    return L.make_obj(name, v, f, mat)


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
    # Every colour below is the LINEAR value of the matching pixel in
    # chibi-hero.png, so the render lands on the reference instead of on a
    # washed-out guess.  The old values were far too pale: skin rendered at
    # 255,255,252 - completely blown out.
    m["skin"] = L.make_material("Skin", (0.820, 0.490, 0.370), roughness=0.50,
                                subsurface=0.30, sss_radius=(0.34, 0.11, 0.07))
    # Hair is matte.  A clear coat on a near-black base reads as wet plastic
    # under a key light - the sheen has to come from the strand grooves.
    m["hair"] = L.make_material("Hair", (0.020, 0.018, 0.024), roughness=0.44,
                                coat=0.0, specular=0.35)
    m["tee"] = L.make_material("Tee", (0.820, 0.805, 0.795), roughness=0.66)
    # Vertex-colour plaid, not the procedural node material - see the
    # "plaid (vertex colour)" block above for why the procedural one exports
    # as white.
    m["plaid"] = make_vcol_plaid_material("Plaid")
    m["pants"] = L.make_material("Pants", (0.430, 0.030, 0.030), roughness=0.60)
    m["shoe"] = L.make_material("Shoe", (0.020, 0.019, 0.021), roughness=0.34,
                                coat=0.15)
    m["sole"] = L.make_material("Sole", (0.880, 0.875, 0.865), roughness=0.45)
    m["sclera"] = L.make_material("Sclera", (0.930, 0.900, 0.870), roughness=0.30)
    m["iris"] = L.make_material("Iris", (0.035, 0.020, 0.017), roughness=0.22)
    m["glint"] = L.make_material("Glint", (1.0, 1.0, 1.0), roughness=0.05)
    m["blush"] = L.make_material("Blush", (0.760, 0.400, 0.360), roughness=0.55)
    m["nose"] = L.make_material("Nose", (0.780, 0.410, 0.330), roughness=0.50)
    m["mouth"] = L.make_material("Mouth", (0.520, 0.110, 0.110), roughness=0.40)
    return m


# ---------------------------------------------------------- plaid (vertex colour)
# The original buffalo plaid was a procedural node setup (TexCoord -> Mapping ->
# Checker + wave bands). Procedural textures do not survive glTF export at all -
# the exporter only writes image textures and scalar PBR factors, so Base Color
# fell back to its default white and the waist tie rendered as a plain white
# apron in model-viewer.
#
# Baking the same pattern into a colour attribute fixes it permanently: COLOR_0
# is part of the glTF 2.0 core spec and every viewer (model-viewer included)
# multiplies it into base colour, so the Blender render and the browser agree.
PLAID_A = (0.430, 0.030, 0.030)   # red, matching the pants
PLAID_B = (0.020, 0.018, 0.018)   # near-black


def _stripe(v, period, duty):
    return (v / period) % 1.0 < duty


def plaid_rgb(x, z):
    """Buffalo plaid: wide bands both ways plus a finer offset cross-hatch.

    The waist tie is only ~0.35 m across, so the periods have to be small or
    the whole tie falls inside one band and reads as a flat colour.  The red
    has to dominate: the old 30% duty made the tie read as a black belt.
    """
    dark = (_stripe(x, 0.10, 0.17) or _stripe(z, 0.10, 0.17)
            or _stripe(x + 0.05, 0.034, 0.10)
            or _stripe(z + 0.05, 0.034, 0.10))
    return PLAID_B if dark else PLAID_A


def make_vcol_plaid_material(name="Plaid"):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    attr.location = (-420, 60)
    L.set_input(bsdf, "Roughness", 0.62)
    L.set_input(bsdf, "Specular IOR Level", 0.32)
    nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def bake_plaid_vertex_colors(objs, mat):
    """Write the plaid pattern into a per-vertex colour attribute.

    FLOAT_COLOR / POINT is deliberate: those values are plain scene-linear and
    Blender applies no colour-management conversion, which is exactly what
    glTF COLOR_0 wants. BYTE_COLOR would re-encode to sRGB and fighting that
    conversion is what turned the tie into a flat grey.
    """
    for ob in objs:
        if ob.type != "MESH":
            continue
        L.assign(ob, mat)
        me = ob.data
        if "Col" in me.color_attributes:
            me.color_attributes.remove(me.color_attributes["Col"])
        ca = me.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="POINT")
        mw = ob.matrix_world
        for v in me.vertices:
            co = mw @ v.co
            r, g, b = plaid_rgb(co.x, co.z)
            ca.data[v.index].color = (r, g, b, 1.0)
    return objs


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
            k = 1.0 - 0.16 * (t ** 2.2)
            v.co.x *= k
            v.co.y *= k
            v.co.z *= 1.0 + 0.02 * t
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
                                             location=(s * 0.286, 0.004, 1.250))
        ob = bpy.context.object
        ob.name = f"Ear_{'L' if s < 0 else 'R'}"
        # flat in Y: an ear is a disc against the head, not a ball
        ob.scale = (0.052, 0.040, 0.070)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        L.shade_smooth(ob)
        L.assign(ob, m["skin"])
        obs.append(ob)
    return obs


# ------------------------------------------------------------------ the hair
# The reference hair is a sculpted mass with ~30 pointed locks sweeping out of
# the crown, and a fringe that falls over the forehead in blades.  A lock is a
# quadratic Bezier swept with a taper (chibi_lib.strand), so it is a smooth
# blade with a real point at the tip - the old ico-sphere cones read as shark
# fins because a cone has no direction to bend in.
#
# Measured off chibi-hero.png (the character is 1.80 tall):
#     hair top        1.800      widest half width  0.436 at z 1.50
#     skull top       1.605      hair half width    0.416 at z 1.30
HAIR_CAP_R = (0.322, 0.312, 0.330)
HAIR_CAP_C = (0.0, 0.0, 1.336)

# The hairline: the curve where the hair mass stops and the forehead starts.
# A flat cut reads as the brim of a hat sitting on the head - the reference
# hair has a rounded hairline that stays high over the forehead and drops at
# the temples, so the ears can come through.
HAIRLINE_Z = 1.470
HAIRLINE_X0 = 0.12
HAIRLINE_DROP = 0.22
HAIRLINE_SPAN = 0.19


def hairline_z(x):
    """Height of the hairline at a given x."""
    t = max(0.0, min(1.0, (abs(x) - HAIRLINE_X0) / HAIRLINE_SPAN))
    z = HAIRLINE_Z - HAIRLINE_DROP * (t ** 1.7)
    # a shallow dip in the middle: the parting of the reference
    return z - 0.010 * math.exp(-((x / 0.08) ** 2))


def cap_y(x, z):
    """Front surface of the skull cap at a given (x, z)."""
    dx = (x - HAIR_CAP_C[0]) / HAIR_CAP_R[0]
    dz = (z - HAIR_CAP_C[2]) / HAIR_CAP_R[2]
    s = max(1.0 - dx * dx - dz * dz, 0.0)
    return -HAIR_CAP_R[1] * math.sqrt(s)


def _tip(a_deg, r, z):
    """A tip position from an azimuth and a horizontal radius."""
    a = math.radians(a_deg)
    return (r * math.sin(a), -r * math.cos(a), z)


# (a_root, polar, tip, bow, r_base)
#   a_root   azimuth of the root in degrees, 0 = straight ahead (-Y)
#   polar    the root's angle away from +Z
#   tip      where the tip lands, in world units
#   bow      how far the lock bows outward from the straight line
#   r_base   the lock's thickness at its root
HAIR_CROWN = [
    (  22, 0.26, _tip(  40, 0.13, 1.800), 0.040, 0.092),
    ( -22, 0.26, _tip( -40, 0.13, 1.800), 0.040, 0.092),
    (  78, 0.28, _tip( 100, 0.17, 1.782), 0.048, 0.098),
    ( -78, 0.28, _tip(-100, 0.17, 1.782), 0.048, 0.098),
    ( 140, 0.30, _tip( 165, 0.16, 1.772), 0.046, 0.096),
    (-140, 0.30, _tip(-165, 0.16, 1.772), 0.046, 0.096),
]

HAIR_MID = [
    (  24, 0.60, _tip(  46, 0.330, 1.556), 0.070, 0.104),
    (  62, 0.64, _tip(  84, 0.432, 1.506), 0.086, 0.110),
    ( 100, 0.60, _tip( 118, 0.436, 1.492), 0.088, 0.110),
    ( 140, 0.66, _tip( 158, 0.415, 1.478), 0.084, 0.108),
    ( 178, 0.62, _tip( 196, 0.400, 1.496), 0.078, 0.106),
    ( 218, 0.66, _tip( 236, 0.400, 1.520), 0.076, 0.106),
    ( 258, 0.60, _tip( 276, 0.420, 1.548), 0.078, 0.108),
    ( 296, 0.64, _tip( 316, 0.400, 1.560), 0.074, 0.104),
    ( 336, 0.60, _tip( 352, 0.300, 1.590), 0.064, 0.100),
]

# The side locks fall past the cheek and hang beside the jaw.  They sit in
# FRONT of the ears (azimuth 56-80, not 90) - a lock that hangs straight out
# to the side ends up inside the ear and hides it.
#
# The azimuth is measured from straight ahead, so the mirror of a lock is
# -a, NOT 180-a: sin(180-a) == sin(a) puts the copy on the SAME side.
HAIR_SIDE = [
    (  34, 0.94, _tip(  56, 0.400, 1.296), 0.050, 0.078),
    (  52, 1.00, _tip(  68, 0.372, 1.232), 0.042, 0.072),
    (  68, 1.12, _tip(  80, 0.330, 1.176), 0.036, 0.064),
    ( -34, 0.94, _tip( -56, 0.400, 1.296), 0.050, 0.078),
    ( -52, 1.00, _tip( -68, 0.372, 1.232), 0.042, 0.072),
    ( -68, 1.12, _tip( -80, 0.330, 1.176), 0.036, 0.064),
]

HAIR_BACK = [
    ( 148, 0.78, _tip( 150, 0.26, 1.400), 0.062, 0.096),
    (-148, 0.78, _tip(-150, 0.26, 1.400), 0.062, 0.096),
    ( 180, 0.70, _tip( 180, 0.30, 1.430), 0.070, 0.100),
    ( 212, 0.74, _tip( 210, 0.28, 1.410), 0.066, 0.098),
    (-212, 0.74, _tip(-210, 0.28, 1.410), 0.066, 0.098),
]

# The fringe: eleven locks hanging over the forehead.
#
# (x_tip, z_tip, a_root)
#   x_tip   where the tip lands on the forehead
#   z_tip   how low it hangs - the brows sit at 1.288, so the tips stop
#           between 1.30 and 1.39 and the lower edge stays ragged instead of
#           reading as one straight row of triangles
#   a_root  azimuth of the root on the skull cap
HAIR_FRONGE = [
    (-0.175, 1.378, -52),
    (-0.126, 1.330, -38),
    (-0.074, 1.352, -24),
    (-0.020, 1.302, -10),
    ( 0.032, 1.330,  12),
    ( 0.082, 1.302,  26),
    ( 0.130, 1.348,  40),
    ( 0.176, 1.382,  54),
]


def _cap_point(a, polar, inset=0.0):
    """A point on the hair cap.  a = azimuth (0 = front / -Y), polar = the
    angle away from the +Z axis.  inset pushes the point into the cap so a
    lock's root is buried instead of sitting on the surface."""
    sp = math.sin(polar)
    p = Vector((HAIR_CAP_R[0] * sp * math.sin(a),
                -HAIR_CAP_R[1] * sp * math.cos(a),
                HAIR_CAP_R[2] * math.cos(polar)))
    if inset:
        p = p.normalized() * max(0.0, p.length - inset)
    return Vector((HAIR_CAP_C[0] + p.x, HAIR_CAP_C[1] + p.y,
                   HAIR_CAP_C[2] + p.z))


def _blade(name, a_root, polar, tip, bow, r_base, mat,
           tip_r=0.016, inset=0.055):
    """One hair lock: a tapered blade from the cap out to a point."""
    ar = math.radians(a_root)
    root = _cap_point(ar, polar, inset=inset)
    tip = Vector(tip)
    out = Vector((math.sin(ar), -math.cos(ar), 0.0))
    ctrl = (root + tip) * 0.5 + out * bow
    v, f = L.strand(root, ctrl, tip, r_base, r_tip=tip_r, steps=16, radial=12,
                    flatten=0.60)
    return L.make_obj(name, v, f, mat)


def _sweep_taper(name, pts, r0, r1, mat, sides=12, flat=0.40, hold=0.0):
    """Sweep a flattened tube with a linear taper along a polyline.

    The cross section is squashed along the depth axis, so a lock stays flat
    against the forehead instead of rolling like a rope.  `hold` keeps the
    full width up to that fraction of the path and only then tapers, which
    is what makes a fringe lock a broad leaf with a point instead of a
    narrow spike.
    """
    pts = [Vector(p) for p in pts]
    n = len(pts)
    tangents = []
    for i in range(n):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, n - 1)]
        d = b - a
        tangents.append(d.normalized() if d.length > 1e-9 else Vector((0.0, 0.0, 1.0)))

    ref = Vector((0.0, 0.0, 1.0))
    if abs(tangents[0].dot(ref)) > 0.95:
        ref = Vector((1.0, 0.0, 0.0))

    rings = []
    for i in range(n):
        t = tangents[i]
        nn = ref - t * ref.dot(t)
        if nn.length < 1e-6:
            ref = Vector((1.0, 0.0, 0.0))
            nn = ref - t * ref.dot(t)
        nn.normalize()
        bn = t.cross(nn)
        f = i / float(n - 1)
        if f <= hold:
            r = r0
        else:
            r = r0 + (r1 - r0) * ((f - hold) / max(1e-6, 1.0 - hold))
        ring = []
        for j in range(sides):
            ang = TAU * j / sides
            p = (pts[i] + nn * (math.cos(ang) * r)
                 + bn * (math.sin(ang) * r * flat))
            ring.append(tuple(p))
        rings.append(ring)

    # collapse the last ring to a point: the tip has to be sharp
    rings[-1] = [tuple(pts[-1])] * sides
    v, f = L.loft(rings, cap_start=True, cap_end=False)
    return L.make_obj(name, v, f, mat)


def _bang(name, x_tip, z_tip, a_root, mat, r_base=0.082):
    """One fringe lock: it leaves the hair mass at the hairline and lies on
    the forehead from there down to its tip.

    The lock has to follow the FOREHEAD, not the cap.  The cap is 27 mm in
    front of the face, so a lock that starts at the crown and falls
    straight down ends up inside the skull and only its tip shows - that is
    exactly the row of black triangles this replaced.
    """
    x0 = 0.150 * math.sin(math.radians(a_root))
    z0 = hairline_z(x0) + 0.022
    x1 = x_tip * 0.94
    z1 = hairline_z(x1) - 0.022
    z2 = z_tip + (z1 - z_tip) * 0.45
    x2 = x_tip * 0.99

    pts = [
        Vector((x0, cap_y(x0, z0) + 0.004, z0)),
        Vector((x1, cap_y(x1, z1) + 0.004, z1)),
        Vector((x2, face_point(x2, z2, out=0.016).y, z2)),
        Vector((x_tip, face_point(x_tip, z_tip, out=0.012).y, z_tip)),
    ]
    return _sweep_taper(name, pts, r_base, 0.008, mat, sides=12, flat=0.34,
                        hold=0.42)


def _join(objs, name):
    """Join meshes into one object without welding them.

    The locks must stay separate surfaces: a voxel remesh would swallow the
    points, and a join keeps every tip intact.
    """
    objs = [o for o in objs if o is not None]
    if not objs:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    for ob in objs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    fused = bpy.context.object
    fused.name = name
    for p in fused.data.polygons:
        p.use_smooth = True
    return fused


def _groove_strands(ob, depth=0.010):
    """Cut the strand grooves into the merged hair mass.

    A smooth remeshed blob reads as a helmet; the reference hair is a carved
    mass with visible strand separations.  The groove is a spiral around a
    whorl just above and right of the crown, and it fades out at the crown
    and at the hairline so the silhouette stays clean.

    The depth has to stay below the distance to the skin - a groove deeper
    than the shell is thick cuts straight through it and the scalp shows
    between the locks.
    """
    me = ob.data
    for vtx in me.vertices:
        n = Vector((vtx.co.x, vtx.co.y, 0.0))
        if n.length < 1e-6:
            continue
        n.normalize()
        t = math.atan2(n.x, -n.y)
        phase = 13.0 * t + 7.0 * (vtx.co.z - 1.46)
        groove = 0.5 + 0.5 * math.cos(phase)
        fade = (max(0.0, min(1.0, (1.76 - vtx.co.z) / 0.10))
                * max(0.0, min(1.0, (vtx.co.z - 1.22) / 0.10)))
        vtx.co -= n * (depth * groove * fade)
    me.update()
    return ob


def build_hair(m):
    """Hair = one carved mass (cap + crown/mid/back locks) + the fringe and
    the side locks.

    The fringe and the side locks are built AFTER the mass is carved: the
    face opening and the ear pockets are booleans, and a lock that is welded
    into the mass gets cut away with it.  They still read as one hairstyle
    because their roots are buried in the mass.
    """
    # ---------- 1. skull cap
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=40, radius=1.0,
                                         location=(0.0, 0.0, 1.336))
    cap = bpy.context.object
    cap.name = "HairCap"
    cap.scale = (0.322, 0.312, 0.330)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    L.shade_smooth(cap)
    L.assign(cap, m["hair"])

    # ---------- 2. the pointed locks
    # The locks are fattened by a factor: at the measured thickness they read
    # as separate spikes, and the reference hair is a mass they overlap into.
    # Too much of a factor and every lock turns into a broad leaf with a
    # rounded end, which is the "petals" look and not hair at all.
    THICK = 0.78

    def blade(name, spec):
        a_root, polar, tip, bow, r_base = spec
        return _blade(name, a_root, polar, tip, bow, r_base * THICK, m["hair"])

    parts = [cap]
    for i, spec in enumerate(HAIR_CROWN):
        parts.append(blade(f"Hair_Crown{i}", spec))
    for i, spec in enumerate(HAIR_MID):
        parts.append(blade(f"Hair_Mid{i}", spec))
    for i, spec in enumerate(HAIR_BACK):
        parts.append(blade(f"Hair_Back{i}", spec))

    # The cap alone would not be watertight once its bottom faces are gone,
    # and the EXACT boolean then chews a hole through the front of the cap.
    # Joining the locks first and remeshing the lot makes it a closed solid
    # again - that is the only way the face opening can be cut cleanly.
    # The smoothing has to stay light: at 0.25/3 the remesh rounded every
    # lock tip off and the hair read as a bunch of petals instead of spikes.
    mass = _weld_hair(parts, smooth_factor=0.10, smooth_iters=2,
                      voxel=0.008)[0]
    _groove_strands(mass)

    # ---------- 3. the fringe, lying on the forehead
    fringe = [_bang(f"Hair_Fringe{i}", spec[0], spec[1], spec[2], m["hair"])
              for i, spec in enumerate(HAIR_FRONGE)]
    fringe_ob = _join(fringe, "HairFringe")

    # ---------- 4. the side locks, framing the cheek
    side = [blade(f"Hair_Side{i}", spec)
            for i, spec in enumerate(HAIR_SIDE)]
    side_ob = _join(side, "HairSide")

    return [mass, fringe_ob, side_ob]


def _add_fringe(lock):
    """Kept for compatibility with the old call site."""
    return []


def _prism(name, profile, axis, lo, hi):
    """Extrude a closed 2D profile along one axis into a solid cutter.

    axis "y": the profile is (x, z) and the prism runs along Y.
    axis "x": the profile is (y, z) and the prism runs along X.
    """
    n = len(profile)
    verts = []
    for a, b in profile:
        verts.append((a, lo, b) if axis == "y" else (lo, a, b))
    for a, b in profile:
        verts.append((a, hi, b) if axis == "y" else (hi, a, b))

    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, j + n, i + n))
    faces.append(tuple(range(n)))
    faces.append(tuple(range(2 * n - 1, n - 1, -1)))

    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()

    # The caps are n-gons and one of them is not convex, so triangulate them
    # before the EXACT boolean tries to read them.
    bm = bmesh.new()
    bm.from_mesh(me)
    ngons = [f for f in bm.faces if len(f.verts) > 4]
    if ngons:
        bmesh.ops.triangulate(bm, faces=ngons)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    me.update()

    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def _boolean_cut(target, cutter, name):
    """Subtract a cutter from a target and apply it right away."""
    mod = target.modifiers.new(name, "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cutter
    mod.solver = "EXACT"
    bpy.ops.object.select_all(action="DESELECT")
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def _cut_face_opening(hair_obj, y_face=-0.128, x_max=0.34, z_floor=0.50):
    """Cut the face opening along the hairline.

    The cutter is a prism whose cross section IS the hairline curve, not a
    box: a box leaves a flat horizontal rim across the forehead, and that
    flat rim is what read as the brim of a hat.  The character faces -Y, so
    the prism runs from well in front of the skull back to the face plane.
    """
    profile = []
    steps = 72
    for i in range(steps + 1):
        x = -x_max + 2.0 * x_max * i / steps
        profile.append((x, hairline_z(x)))
    profile.append((x_max, z_floor))
    profile.append((-x_max, z_floor))

    cutter = _prism("FaceCutter", profile, "y", y_face - 1.40, y_face)
    _boolean_cut(hair_obj, cutter, "FaceOpening")


def _carve_ear_pockets(hair_obj, ear_x=0.286, ear_y=0.004, ear_z=1.250,
                       r_y=0.070, r_z=0.100, x_in=0.250, x_out=0.460):
    """Open a slot on each side of the hair so the ears come through.

    The cap is a solid ball around the head, so a pocket cut inside it would
    only hide the ear in a cavity - the cutter has to reach all the way out
    through the cap's surface.
    """
    for s in (-1, 1):
        profile = []
        steps = 40
        for i in range(steps):
            a = TAU * i / steps
            profile.append((ear_y + math.cos(a) * r_y,
                            ear_z + math.sin(a) * r_z))
        lo, hi = sorted((s * x_in, s * x_out))
        cutter = _prism("EarCutter", profile, "x", lo, hi)
        _boolean_cut(hair_obj, cutter, "EarPocket")


def _weld_hair(hair_parts, smooth_factor=0.5, smooth_iters=6,
               voxel=0.010):
    """Fuse every lock and the cap into one continuous sculpted mass.

    Separate blobs read as glued-on parts. Voxel remesh welds the overlaps and
    re-surfaces the whole thing, then smoothing rounds the weld seams — this is
    how the hair is meant to look: one sculpted form with a spiky silhouette.
    """
    bpy.ops.object.select_all(action="DESELECT")
    for ob in hair_parts:
        if ob.type == "MESH":
            ob.select_set(True)
    if not hair_parts:
        return []
    bpy.context.view_layer.objects.active = hair_parts[0]
    if len(hair_parts) > 1:
        bpy.ops.object.join()
    fused = bpy.context.object
    fused.name = "Hair"

    for mod in list(fused.modifiers):
        fused.modifiers.remove(mod)

    remesh = fused.modifiers.new("VoxelRemesh", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = voxel
    remesh.use_smooth_shade = True

    smooth = fused.modifiers.new("Smooth", "SMOOTH")
    smooth.factor = smooth_factor
    smooth.iterations = smooth_iters

    bpy.ops.object.select_all(action="DESELECT")
    fused.select_set(True)
    bpy.context.view_layer.objects.active = fused
    for mod in list(fused.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)

    # Face opening: a prism cut along the hairline, so the rim of the hair
    # follows the skull instead of running flat across the forehead.
    # Deleting faces by a centre test leaves a stair-stepped rim, which reads
    # as damage once the mass is remeshed.
    _cut_face_opening(fused, y_face=-0.128)

    # Ear pockets: the reference has big ears sticking out under the hair.
    _carve_ear_pockets(fused)

    for p in fused.data.polygons:
        p.use_smooth = True
    split = fused.modifiers.new("Sharpen", "EDGE_SPLIT")
    split.split_angle = math.radians(76)

    return [fused]


# NOTE: an earlier revision carried a second, correct-looking helper called
# _carve_face_opening() that deleted front-facing hair faces by centre test.
# It was never called from anywhere, which is part of why the face stayed
# buried: the code that looked right was dead. The boolean below is now the
# single place the face opening is cut.


def build_face(m):
    parts = []
    for s in (-1, 1):
        tag = "L" if s < 0 else "R"
        p = face_point(s * EYE_X, EYE_Z, out=0.0)

        # sclera: a shallow lens sunk into the skull so only a low dome shows.
        # A deep ball reads as a bead glued to the face; the reference's eyes
        # are almost flush with the cheek.
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=44, ring_count=28, radius=1.0,
            location=(p.x, p.y + 0.016, p.z))
        ob = bpy.context.object
        ob.name = f"EyeWhite_{tag}"
        ob.scale = (0.078, 0.030, 0.068)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        L.shade_smooth(ob)
        L.assign(ob, m["sclera"])
        parts.append(ob)

        # iris sits proud of the sclera, leaving a thin white rim
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=44, ring_count=28, radius=1.0,
            location=(p.x - s * 0.002, p.y + 0.008, p.z - 0.004))
        ob = bpy.context.object
        ob.name = f"Iris_{tag}"
        ob.scale = (0.072, 0.028, 0.062)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        L.shade_smooth(ob)
        L.assign(ob, m["iris"])
        parts.append(ob)

        # The upper lash line: a thick black arc riding on the white above the
        # iris.  Without it the eye reads as a bug's eye instead of a drawn
        # one.  It has to sit on the SCLERA - a black tube lying on a black
        # iris is invisible.
        lash_pts = []
        for u in linspace(-1.0, 1.0, 7):
            x = p.x + u * 0.092
            z = p.z + 0.050 - 0.018 * u * u + 0.006 * u
            k = (1.0 - ((x - p.x) / 0.078) ** 2
                 - ((z - p.z) / 0.068) ** 2)
            y = (p.y + 0.016) - 0.030 * math.sqrt(max(0.0, k)) - 0.003
            lash_pts.append(Vector((x, y, z)))
        parts.append(_sweep_poly(f"Lash_{tag}", lash_pts, 0.015, m["hair"]))

        for gname, off, sc in (("Big", (-0.022, 0.020), (0.021, 0.007, 0.023)),
                               ("Small", (0.024, -0.046), (0.010, 0.006, 0.011))):
            bpy.ops.mesh.primitive_uv_sphere_add(
                segments=24, ring_count=16, radius=1.0,
                location=(p.x + off[0], p.y - 0.012, p.z + off[1]))
            ob = bpy.context.object
            ob.name = f"Glint{gname}_{tag}"
            ob.scale = sc
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            L.shade_smooth(ob)
            L.assign(ob, m["glint"])
            parts.append(ob)

        # brow: stretched icosphere arching across the brow ridge
        b0 = face_point(s * 0.062, BROW_Z - 0.026, out=0.006)
        b2 = face_point(s * 0.212, BROW_Z - 0.038, out=0.002)
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
        ob.scale = (0.021, 0.032, length * 0.55)
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

        bp = face_point(s * 0.200, EYE_Z - 0.070, out=-0.004)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=18,
                                             radius=1.0, location=tuple(bp))
        ob = bpy.context.object
        ob.name = f"Blush_{tag}"
        # flat and small: a fat ball reads as a sticker stuck on the cheek
        ob.scale = (0.036, 0.011, 0.021)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        L.shade_smooth(ob)
        L.assign(ob, m["blush"])
        parts.append(ob)

    np = face_point(0.0, NOSE_Z, out=-0.004)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=26, ring_count=16, radius=1.0,
                                         location=tuple(np))
    ob = bpy.context.object
    ob.name = "Nose"
    ob.scale = (0.015, 0.011, 0.013)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    L.shade_smooth(ob)
    L.assign(ob, m["nose"])
    parts.append(ob)

    # The mouth is a thin smile line, not a bar: a stretched sphere reads as
    # a red blob pasted on the face.
    mouth_pts = []
    for u in linspace(-1.0, 1.0, 9):
        x = u * 0.048
        z = MOUTH_Z - 0.006 + 0.018 * (u * u)
        mouth_pts.append(face_point(x, z, out=0.004))
    parts.append(_sweep_poly("Mouth", mouth_pts, 0.009, m["mouth"],
                              sides=8, flat=0.55))

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
            (s * 0.178, -0.004, 0.902), (s * 0.236, 0.002, 0.796),
            0.082, 0.070, m["tee"], sides=24, power=2.4, caps=0.30))

        # The upper arm starts lower and with a shorter cap than before: the
        # old cap poked out through the shoulder of the tee and left a skin
        # coloured dot on each shoulder.
        parts.append(L.limb(f"UpperArm_{tag}",
                            (s * 0.190, -0.002, 0.884),
                            (s * 0.254, 0.006, 0.734),
                            0.058, 0.048, m["skin"], sides=20, caps=0.25))
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

    # The knot and the hanging ends have to sit IN FRONT of the waist band
    # and the pants: tucked inside them they were invisible, and all that
    # showed was a black rectangle where the plaid pattern happened to fall.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, radius=1.0,
                                         location=(0.0, -0.198, 0.700))
    ob = bpy.context.object
    ob.name = "PlaidKnot"
    ob.scale = (0.064, 0.042, 0.050)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    L.shade_smooth(ob)
    L.assign(ob, m["plaid"])
    parts.append(ob)

    # The two ends of the tied shirt: flat wide flaps hanging in front of the
    # pants.  A round ribbon here reads as a dark blob - the reference shows
    # broad flat ends.
    for name, x, z, ang, rx, ry, rz in (
            ("TailA", 0.076, 0.592, -7.0, 0.074, 0.024, 0.130),
            ("TailB", -0.070, 0.586, 7.0, 0.068, 0.024, 0.124)):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=18,
                                             radius=1.0,
                                             location=(x, -0.210, z))
        ob = bpy.context.object
        ob.name = f"Plaid_{name}"
        ob.scale = (rx, ry, rz)
        ob.rotation_euler = (0.0, 0.0, math.radians(ang))
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        L.shade_smooth(ob)
        L.assign(ob, m["plaid"])
        parts.append(ob)

    for s in (-1, 1):
        tag = "L" if s < 0 else "R"
        _make_ribbon(parts, m["plaid"], f"PlaidSleeve_{tag}",
                     Vector((s * 0.192, -0.060, 0.700)),
                     Vector((s * 0.208, -0.050, 0.520)),
                     (0.056, 0.028))
    return parts


def build_pants(m):
    parts = []

    # The hips reach BELOW the torso's bottom cap on purpose: both ended at
    # z 0.600, so the skin cap and the red pants cap were coplanar and
    # z-fought into a red wedge in the crotch.  Sections are listed bottom-up.
    hips = [(0.470, 0.085, 0.058),
            (0.490, 0.120, 0.082),
            (0.520, 0.150, 0.104),
            (0.560, 0.172, 0.120),
            (0.600, 0.180, 0.127),
            (0.640, 0.186, 0.130),
            (0.690, 0.184, 0.126),
            (0.730, 0.172, 0.118)]
    v, f = L.profile_tube(hips, sides=36, power=2.5)
    parts.append(L.make_obj("PantsHip", v, f, m["pants"]))

    for s in (-1, 1):
        tag = "L" if s < 0 else "R"
        # The leg centres overlap on purpose: at +-0.113 the two legs left a
        # gap at the front and the hips' rounded crotch poked through it as a
        # red nub.
        cx = s * 0.105
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

    # The lights used to blow the skin out to 255,255,252: the render was
    # clipped, so every colour looked washed out and the model looked plastic.
    area("Key", (-1.55, -2.05, 2.45), (math.radians(52), 0, math.radians(-36)),
         2.4, 76)
    area("Fill", (2.25, -1.35, 1.35), (math.radians(76), 0, math.radians(58)),
         3.0, 30)
    area("Rim", (0.85, 2.35, 2.05), (math.radians(128), 0, math.radians(196)),
         2.2, 60)
    area("Top", (0.0, 0.0, 3.4), (0, 0, 0), 3.2, 20)

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
    bake_plaid_vertex_colors(build_waist_shraph(m), m["plaid"])
    build_pants(m)
    build_shoes(m)

    # Floor is scenery for render_views() only. It must never reach the GLB,
    # otherwise the shipped model carries a 14 m grey plane under the character
    # plus a stray FloorMat material.
    floor = bpy.data.objects.get("Floor")
    parts = [o for o in bpy.context.scene.objects
             if o.type == "MESH" and o is not floor]
    root = bpy.data.objects.new("Chibi", None)
    bpy.context.collection.objects.link(root)
    for o in parts:
        o.parent = root

    blend = os.path.join(OUT_DIR, "chibi.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend)

    glb = os.path.join(OUT_DIR, "chibi.glb")
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB",
                              use_selection=True, export_apply=True,
                              export_yup=True,
                              export_draco_mesh_compression_enable=True,
                              export_draco_mesh_compression_level=6)

    render_views()

    tris = 0
    for o in parts:
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
    print(f"[chibi] objects={len(parts)} tris={tris}")
    print(f"[chibi] blend={blend}")
    print(f"[chibi] glb={glb} size={os.path.getsize(glb)}")


if __name__ == "__main__":
    main()