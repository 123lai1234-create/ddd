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
# The head is NOT an ellipsoid.  Measured off chibi-hero.png the face keeps a
# near-constant half width of ~0.256 from the brow down to the jaw and then
# rounds off into a small chin.  An ellipsoid is too wide at the brow and too
# narrow at the jaw, and that is what made the head read as a squashed ball
# with small eyes stuck on it.
#
# (z, half width in x, half depth in y) - the silhouette is sampled off the
# reference by blender/measure_hero.py.
HEAD_PROFILE = [
    (0.950, 0.004, 0.004),
    (0.960, 0.032, 0.033),
    (0.980, 0.068, 0.070),
    (1.000, 0.121, 0.124),
    (1.030, 0.172, 0.175),
    (1.060, 0.212, 0.215),
    (1.100, 0.238, 0.240),
    (1.140, 0.250, 0.252),
    (1.200, 0.257, 0.258),
    (1.260, 0.259, 0.260),
    (1.320, 0.256, 0.257),
    (1.380, 0.247, 0.248),
    (1.440, 0.227, 0.228),
    (1.490, 0.199, 0.200),
    (1.530, 0.160, 0.161),
    (1.560, 0.106, 0.107),
    (1.582, 0.032, 0.033),
    (1.590, 0.004, 0.004),
]
HEAD_POWER = 2.2     # cross section power: >2 flattens the face plane

HC = Vector((0.0, 0.0, 1.29))        # head centre (kept for the hair cap)
HR = Vector((0.259, 0.260, 0.318))  # widest half width / depth / height
HCAP_R = Vector((0.355, 0.345, 0.358))  # hair cap radii
HCAP_Z = 1.318

CHIN_Z = 0.950

# Eye geometry, measured off the reference (blender/measure_eye.py plus
# blender/measure_fringe.py, which finds the dark eye blob in the reference):
#   the eye box (lash included) spans x 0.080 .. 0.219 and z 1.155 .. 1.284
#   so the eye is 0.139 wide and 0.129 tall, centred at (0.150, 1.220)
#   the reference iris is nearly as big as the eye: the sclera is a thin
#   crescent at the bottom and the outer corner only
#   lash       a thick arc topping the eye
#   highlight  a big silver disc at the upper inner corner of the iris
#   brow       |x| 0.095 .. 0.185,  z 1.305 .. 1.330
EYE_AP_X, EYE_AP_Z = 0.150, 1.218
EYE_AP_RX, EYE_AP_RZ = 0.070, 0.058
IRIS_X, IRIS_Z = 0.1330, 1.2220
IRIS_RX, IRIS_RZ = 0.0560, 0.0480
BROW_Z = 1.316
NOSE_Z = 1.140
MOUTH_Z = 1.090

random.seed(20261020)

TAU = math.pi * 2.0


def linspace(a, b, n):
    if n == 1:
        return [a]
    return [a + (b - a) * i / (n - 1.0) for i in range(n)]


def _sweep_poly(name, pts, radius, mat, sides=10, flat=0.6, radii=None):
    """Sweep a small flattened section along a polyline.

    Used for the upper lash line, which has to follow the curve of the iris
    instead of being a straight bar floating over the eye.  `radii` gives a
    per-point radius so a stroke can be thick at one end and taper to a point
    at the other.
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
        r = radii[i] if radii else radius
        ring = []
        for j in range(sides):
            ang = TAU * j / sides
            p = (pts[i] + nrm * (math.cos(ang) * r)
                 + bn * (math.sin(ang) * r * flat))
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
    m["iris"] = L.make_material("Iris", (0.008, 0.005, 0.005), roughness=0.22)
    # The reference iris is not a flat black disc: the lower third is a
    # soft grey crescent (the reflected light under the pupil).  Without it
    # the sclera reads as a white band and the eye looks like a goggle.
    m["irislow"] = L.make_material("IrisLow", (0.052, 0.050, 0.054),
                                   roughness=0.35)
    # The eyelid line of the reference is a dark BROWN, not black.
    m["eyeline"] = L.make_material("EyeLine", (0.058, 0.030, 0.024),
                                    roughness=0.45)
    m["glint"] = L.make_material("Glint", (1.0, 1.0, 1.0), roughness=0.05)
    m["ear"] = L.make_material("Ear", (0.760, 0.250, 0.205), roughness=0.55)
    m["blush"] = make_vcol_blush_material("Blush")
    # The nose is a soft shadow, not a pink bead: it is barely darker than the
    # skin, just a touch warmer.
    m["nose"] = L.make_material("Nose", (0.700, 0.320, 0.250), roughness=0.55)
    m["mouth"] = L.make_material("Mouth", (0.520, 0.055, 0.050), roughness=0.40)
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
PLAID_A = (0.480, 0.020, 0.022)   # red, matching the pants
PLAID_B = (0.020, 0.018, 0.018)   # near-black
# The reference check squares measure ~0.028 units across, so the period is
# 0.058.  It also has to be COARSE enough for the vertex grid to resolve:
# the old 0.034 period aliased into black blotches that read as damage.
PLAID_PERIOD = 0.050


def _stripe(v, period, duty):
    return (v / period) % 1.0 < duty


def plaid_rgb(x, z):
    """Buffalo plaid: wide red/black checks crossed by thin black lines.

    The reference is a big red check with black squares at the crossings and
    a thin black line running through every red square - not a fine hatch.
    """
    dark = (_stripe(x, PLAID_PERIOD, 0.46)
            and _stripe(z, PLAID_PERIOD, 0.46))
    return PLAID_B if dark else PLAID_A


def make_vcol_blush_material(name="Blush"):
    """Blush is a gradient that fades into the skin at its rim.

    A flat pink ellipse pasted on the cheek reads as a sticker.  Baking the
    fade into a vertex colour means the rim is exactly the skin colour and
    only the centre is red, which is what the reference cheek looks like.
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    attr.location = (-420, 60)
    L.set_input(bsdf, "Roughness", 0.55)
    L.set_input(bsdf, "Specular IOR Level", 0.35)
    nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


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


def _subdivide(ob, levels=2):
    """Simple (non-smoothing) subdivision so a vertex-colour pattern has
    enough vertices to resolve it."""
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    mod = ob.modifiers.new("Subdiv", "SUBSURF")
    mod.subdivision_type = "SIMPLE"
    mod.levels = levels
    mod.render_levels = levels
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return ob


def bake_plaid_vertex_colors(objs, mat):
    """Write the plaid pattern into a per-vertex colour attribute.

    FLOAT_COLOR / POINT is deliberate: those values are plain scene-linear and
    Blender applies no colour-management conversion, which is exactly what
    glTF COLOR_0 wants. BYTE_COLOR would re-encode to sRGB and fighting that
    conversion is what turned the tie into a flat grey.

    The mesh is subdivided first: the check squares are 0.029 units across and
    the tie's raw vertex grid is 0.035 units apart, so without extra vertices
    the pattern aliases into blotches.

    2026-11-03 decimation (on top of c3b7945): levels 3 -> 2.  With the
    buffalo-check period at 0.050, level 2 already puts the vertex grid at
    ~0.0088 units, far under one check, while level 3 was 4x the triangles
    for no visible difference in model-viewer.  Plaid drops from ~275K to
    ~69K tris.
    """
    for ob in objs:
        if ob.type != "MESH":
            continue
        _subdivide(ob, levels=2)
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
def head_dims(z):
    """(half width, half depth) of the skull at height z."""
    p = HEAD_PROFILE
    if z <= p[0][0]:
        return p[0][1], p[0][2]
    if z >= p[-1][0]:
        return p[-1][1], p[-1][2]
    for i in range(len(p) - 1):
        z0, a0, b0 = p[i]
        z1, a1, b1 = p[i + 1]
        if z0 <= z <= z1:
            f = (z - z0) / (z1 - z0)
            f = f * f * (3.0 - 2.0 * f)          # smoothstep between stops
            return a0 + (a1 - a0) * f, b0 + (b1 - b0) * f
    return p[-1][1], p[-1][2]


def face_point(x, z, out=0.0):
    """Point on the front of the head for a given (x, z)."""
    rx, ry = head_dims(z)
    if rx < 1e-5:
        return Vector((x, 0.0, z))
    s = max(1.0 - (abs(x) / rx) ** HEAD_POWER, 0.0)
    return Vector((x, -ry * (s ** (1.0 / HEAD_POWER)) - out, z))


def build_head(m):
    v, f = L.profile_tube(HEAD_PROFILE, sides=72, power=HEAD_POWER,
                           cap_start=True, cap_end=True)
    return L.make_obj("Head", v, f, m["skin"])


def build_ears(m):
    obs = []
    for s in (-1, 1):
        # The reference ear is small and sits HIGH: the flesh coloured oval
        # beside the face runs from z 1.21 to z 1.36 and reaches x 0.348.
        # The +-0.348 at z 1.16-1.25 in the silhouette table is the HAIR
        # beside the face, not the ear - a big ear made the head look like a
        # cartoon mouse.
        bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=18,
                                             radius=1.0,
                                             location=(s * 0.300, 0.000, 1.250))
        ob = bpy.context.object
        ob.name = f"Ear_{'L' if s < 0 else 'R'}"
        # flat in Y: an ear is a disc against the head, not a ball
        ob.scale = (0.048, 0.044, 0.086)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        L.shade_smooth(ob)
        L.assign(ob, m["skin"])
        obs.append(ob)

        # The reference ears are RED inside - a flat skin-coloured disc reads
        # as a blank ear and the face loses its frame.
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16,
                                             radius=1.0,
                                             location=(s * 0.292, -0.042, 1.236))
        inner = bpy.context.object
        inner.name = f"EarInner_{'L' if s < 0 else 'R'}"
        inner.scale = (0.032, 0.016, 0.060)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        L.shade_smooth(inner)
        L.assign(inner, m["ear"])
        obs.append(inner)
    return obs


# ------------------------------------------------------------------ the hair
# The reference hair is NOT a smooth helmet with a few spikes on it, and it is
# not a cap with leaves glued to the outside either.  It is a CHRYSANTHEMUM:
# a whorl near the top of the skull with ~23 long, flat, tapering locks
# radiating out of it like petals, every one of them ending in a sharp point.
# The points ARE the silhouette; the dark mass between them is a backdrop.
#
# A lock rooted on the SURFACE of the cap only ever sticks out by the few
# centimetres between the cap and the measured line, and that reads as
# "blobs on a helmet" - which is what this used to look like.  The locks have
# to be rooted at the WHORL, so each one travels the whole distance from the
# crown to its point.
#
# Every number below is measured off chibi-hero.png:
#
#   blender/measure_hero.py    -> the silhouette table
#   blender/measure_fringe.py  -> the LEFT and RIGHT extreme of the hair at
#                                 every height (the half width alone cannot
#                                 tell a single crown horn from two)
#   blender/measure_parts.py   -> the per-part outline (hair / tee / pants ...)
#   blender/diff_silhouette.py -> the overlay of the reference and the model
#
# The measured extremes - the hair is swept to the character's left:
#
#     z 1.795   L -0.275   R +0.038     the crown horn, leaning left
#     z 1.760   L -0.284   R +0.078
#     z 1.655   L -0.281   R +0.291     a lock tip on the right
#     z 1.625   L -0.327   R +0.130     a lock tip on the left
#     z 1.565   L -0.441   R +0.156     the widest lock on the left
#     z 1.490   L -0.419   R +0.440     the widest lock on the right
#     z 1.300   L -0.415   R +0.417     the lower tier
#     z 1.175   L -0.287   R +0.287     the hair above the ears
#     z 1.020   L -0.194   R +0.193     the nape
#
# The EARS are what reaches +-0.348 at z 1.16-1.24: they are big in the
# reference and they stick out past the hair.  Hair that hangs down IN FRONT
# of the face buries them, and the face loses its frame - so the locks that
# come down beside the cheeks are kept BEHIND the ear plane.
#
# The hairline: the curve where the hair stops and the forehead starts.
# A flat cut reads as the brim of a hat sitting on the head - the reference
# hair has a rounded hairline that stays high over the forehead and drops at
# the temples, so the ears can come through.
HAIRLINE_Z = 1.500
HAIRLINE_X0 = 0.12
HAIRLINE_DROP = 0.23
HAIRLINE_SPAN = 0.19


def hairline_z(x):
    """Height of the hairline at a given x."""
    t = max(0.0, min(1.0, (abs(x) - HAIRLINE_X0) / HAIRLINE_SPAN))
    z = HAIRLINE_Z - HAIRLINE_DROP * (t ** 1.7)
    # a shallow dip in the middle: the parting of the reference
    return z - 0.010 * math.exp(-((x / 0.08) ** 2))


# The dark mass the locks are laid over: (z, x_left, x_right, half depth,
# y centre).
#
# It follows the measured silhouette pulled IN by 25-50 mm, because the points
# of the locks are what have to reach the measured line.  The top is skewed to
# the left, because the reference crown leans that way.
#
# The first rows are the NAPE: a lobe BEHIND the neck.  The reference shows
# the neck in front of the hair down to z 1.0, so a mass that wrapped all the
# way round would cover the throat.
HAIR_BASE = [
    (0.985, -0.150, 0.150, 0.075, 0.155),
    (1.025, -0.186, 0.186, 0.086, 0.128),
    (1.065, -0.224, 0.224, 0.100, 0.078),
    (1.105, -0.242, 0.242, 0.140, 0.026),
    (1.145, -0.250, 0.250, 0.190, 0.000),
    (1.185, -0.256, 0.256, 0.226, 0.000),
    (1.225, -0.262, 0.262, 0.248, 0.000),
    (1.265, -0.268, 0.268, 0.262, 0.000),
    (1.305, -0.268, 0.268, 0.268, 0.000),
    (1.345, -0.262, 0.262, 0.266, 0.000),
    (1.385, -0.250, 0.250, 0.258, 0.000),
    (1.425, -0.232, 0.232, 0.244, 0.000),
    (1.465, -0.212, 0.212, 0.226, 0.000),
    (1.505, -0.192, 0.192, 0.206, 0.000),
    (1.545, -0.176, 0.176, 0.186, 0.000),
    (1.585, -0.166, 0.166, 0.166, 0.000),
    (1.625, -0.166, 0.150, 0.142, 0.000),
    (1.665, -0.176, 0.128, 0.116, 0.000),
    (1.705, -0.194, 0.100, 0.090, 0.000),
    (1.745, -0.210, 0.070, 0.062, 0.000),
    (1.778, -0.220, 0.044, 0.038, 0.000),
]


def hair_base_dims(z):
    """(x_left, x_right, half depth, y centre) of the hair mass at height z."""
    p = HAIR_BASE
    if z <= p[0][0]:
        return p[0][1], p[0][2], p[0][3], p[0][4]
    if z >= p[-1][0]:
        return p[-1][1], p[-1][2], p[-1][3], p[-1][4]
    for i in range(len(p) - 1):
        z0, l0, r0, d0, c0 = p[i]
        z1, l1, r1, d1, c1 = p[i + 1]
        if z0 <= z <= z1:
            f = (z - z0) / (z1 - z0)
            f = f * f * (3.0 - 2.0 * f)          # smoothstep between stops
            return (l0 + (l1 - l0) * f, r0 + (r1 - r0) * f,
                    d0 + (d1 - d0) * f, c0 + (c1 - c0) * f)
    return p[-1][1], p[-1][2], p[-1][3], p[-1][4]


def _spow(v, power=HEAD_POWER):
    """Signed power used by the superellipse cross sections."""
    return math.copysign(abs(v) ** (2.0 / power), v)


def mass_point(z, a_deg, lift=0.0):
    """A point on the hair mass's surface.  a = 0 is the front (-Y)."""
    l, r, d, cy = hair_base_dims(z)
    c = (l + r) * 0.5
    hw = max(0.002, (r - l) * 0.5)
    a = math.radians(a_deg)
    x = c + hw * _spow(math.sin(a))
    y = cy - d * _spow(math.cos(a))
    n = Vector((x - c, y - cy, 0.0))
    if n.length > 1e-6:
        n.normalize()
    return Vector((x, y, z)) + n * lift


def mass_front_y(x, z):
    """The front surface of the hair mass at a given x."""
    l, r, d, cy = hair_base_dims(z)
    c = (l + r) * 0.5
    hw = max(0.002, (r - l) * 0.5)
    u = min(1.0, abs(x - c) / hw)
    return cy - d * (max(0.0, 1.0 - u ** HEAD_POWER)) ** (1.0 / HEAD_POWER)


# The whorl: the one point every lock grows out of.  It sits slightly left of
# and behind the crown centre, which is what gives the fan its sweep.
WHORL = Vector((-0.030, 0.030, 1.608))


# ---------------------------------------------------------------------------
# The locks.  Each one is a quadratic Bezier:
#
#   root     where it leaves the whorl (or the side of the mass)
#   tip      the point, on the measured silhouette
#   dir      the direction the lock points AT its tip - this is what makes
#            the point aim outwards instead of into the skull
#   half_w   half of its width across the screen
#
# The lock is wide near the root and tapers over most of its length: the
# reference locks are petals, not needles.  A profile that tapers straight
# from the root turns every lock into a triangle and the head into a sea
# urchin.
HAIR_LOCKS = [
    # (name, ring angle, root height, ring radius, tip, tip direction,
    #  half width, bow)
    #
    # The blade roots sit on a RING around the crown, not at a single point:
    # a ring of broad petals overlapping like a chrysanthemum is what the
    # reference hair is, and it is the only arrangement that both covers the
    # skull and leaves the tips standing proud as points.
    ("Horn",   -40, 1.600, 0.100, (-0.272, 0.035, 1.806), (-0.38, 0.06, 0.92), 0.118, 0.055),
    ("CrownR",  25, 1.600, 0.100, (0.028, 0.040, 1.784), (0.26, 0.10, 0.96), 0.084, 0.038),
    ("CrownM", -12, 1.580, 0.100, (-0.120, 0.030, 1.768), (-0.40, 0.06, 0.91), 0.112, 0.032),
    ("UpR",     40, 1.560, 0.130, (0.272, 0.015, 1.658), (0.78, 0.06, 0.62), 0.082, 0.042),
    ("UpL",    -55, 1.550, 0.130, (-0.327, 0.010, 1.624), (-0.88, 0.02, 0.47), 0.112, 0.042),
    ("UpL2",   -60, 1.585, 0.115, (-0.302, 0.020, 1.706), (-0.85, 0.03, 0.53), 0.105, 0.030),
    ("FrontL", -34, 1.575, 0.110, (-0.228, -0.050, 1.688), (-0.66, -0.34, 0.67), 0.112, 0.030),
    ("FrontR",  12, 1.570, 0.108, (0.152, -0.055, 1.672), (0.60, -0.36, 0.71), 0.106, 0.028),
    ("BigL",   -85, 1.520, 0.150, (-0.450, -0.012, 1.560), (-0.90, -0.04, 0.43), 0.132, 0.000),
    ("BigR",    85, 1.530, 0.150, (0.452, -0.012, 1.505), (0.90, -0.04, 0.43), 0.132, 0.000),
    ("MidL",  -100, 1.500, 0.160, (-0.419, -0.030, 1.492), (-0.92, -0.05, 0.38), 0.122, 0.008),
    ("MidL2", -108, 1.470, 0.155, (-0.406, -0.030, 1.432), (-0.94, -0.05, 0.33), 0.115, 0.005),
    ("MidR",   100, 1.500, 0.160, (0.428, -0.025, 1.462), (0.90, -0.05, 0.42), 0.118, 0.008),
    ("LowL",  -115, 1.470, 0.170, (-0.415, -0.045, 1.296), (-0.86, -0.06, -0.50), 0.136, 0.030),
    ("LowR",   115, 1.470, 0.170, (0.417, -0.045, 1.296), (0.86, -0.06, -0.50), 0.136, 0.030),
    ("CheekL",-135, 1.395, 0.175, (-0.348, 0.055, 1.130), (-0.66, -0.10, -0.74), 0.112, 0.026),
    ("CheekR", 135, 1.395, 0.175, (0.348, 0.055, 1.130), (0.66, -0.10, -0.74), 0.112, 0.026),
    ("BackL", -150, 1.540, 0.140, (-0.300, 0.150, 1.556), (-0.56, 0.74, 0.37), 0.108, 0.032),
    ("BackR",  150, 1.540, 0.140, (0.290, 0.150, 1.540), (0.56, 0.74, 0.37), 0.108, 0.032),
    ("BackT",  180, 1.520, 0.140, (0.000, 0.292, 1.428), (0.00, 0.94, -0.34), 0.098, 0.022),
    ("NapeL", -160, 1.300, 0.150, (-0.252, 0.050, 1.042), (-0.30, 0.28, -0.91), 0.086, 0.018),
    ("NapeR",  160, 1.300, 0.150, (0.252, 0.050, 1.042), (0.30, 0.28, -0.91), 0.086, 0.018),
]


# The fringe: broad locks lying on the forehead.
#
# Ten of them, not twenty-four.  A dense row of narrow spikes reads as a
# sawtooth band across the brow, which is not what the reference looks like:
# the reference has a handful of big leaves whose tips reach different
# depths, overlapping each other.
#
# (x_tip, z_tip, a_root, half width, depth)
HAIR_FRONGE = [
    (-0.204, 1.286, -74, 0.112, 0.032),
    (-0.112, 1.246, -42, 0.118, 0.022),
    (-0.016, 1.292, -6, 0.120, 0.030),
    (0.082, 1.240, 30, 0.118, 0.020),
    (0.182, 1.288, 66, 0.110, 0.030),
]


def _lock_radii(half_w, steps, hold=0.42, power=1.18, ramp=0.28, tip_r=0.005):
    """Width profile of a lock: thin at the root, broad over the first 40%,
    and a long taper to a sharp point.

    The reference locks are broad crescents - a quarter of the head across -
    and the point is only the last third of the lock.  A profile that tapers
    straight from the root turns every lock into a triangle, and a head of
    triangles is the sea-urchin look the reference does not have.
    """
    out = []
    for i in range(steps + 1):
        t = i / float(steps)
        g = min(1.0, t / ramp)
        g = g * g * (3.0 - 2.0 * g)
        if t <= hold:
            r = half_w * g
        else:
            f = (t - hold) / (1.0 - hold)
            r = tip_r + (half_w - tip_r) * (1.0 - f) ** power
        out.append(r)
    return out


def _bezier3(p0, p1, p2, p3, steps):
    """Sample a CUBIC Bezier into a list of points."""
    p0, p1, p2, p3 = (Vector(p0), Vector(p1), Vector(p2), Vector(p3))
    out = []
    for i in range(int(steps) + 1):
        t = float(i) / steps
        mt = 1.0 - t
        out.append(p0 * (mt ** 3) + p1 * (3 * mt * mt * t)
                   + p2 * (3 * mt * t * t) + p3 * (t ** 3))
    return out


def _lock(name, root, tip, tip_dir, half_w, mat, bow=0.0, steps=20,
          flatten=0.95, hold=0.42, power=1.18, ramp=0.28, tip_r=0.005):
    """One long crescent lock of hair.

    The reference locks are PETALS: they bow away from the head and then
    sweep back so the point aims outwards.  A quadratic Bezier cannot do
    that - it can only draw a slightly bent triangle - so the path is a
    cubic: the first control point lifts the middle of the blade (the bow)
    and the second control point sits back along the tip direction, which
    is what makes the point aim where it should.
    """
    p0 = Vector(root)
    p3 = Vector(tip)
    out = Vector(tip_dir).normalized()
    chord = p3 - p0
    span = max(1e-4, chord.length)
    p1 = p0 + chord * 0.34 + Vector((0.0, 0.0, bow))
    p2 = p3 - out * (span * 0.34)
    pts = _bezier3(p0, p1, p2, p3, steps)
    radii = _lock_radii(half_w, steps, hold, power, ramp, tip_r)
    v, f = L.blade(pts, radii, radial=20, flatten=flatten)
    return L.make_obj(name, v, f, mat)


def _bang(name, x_tip, z_tip, a_root, mat, half_w=0.098, depth=0.020):
    """One fringe lock lying on the forehead.

    The lock has to follow the FOREHEAD, not the hair mass: the mass is 80 mm
    in front of the face, so a fringe that starts at the crown and falls
    straight down ends up inside the skull and only its tip shows - that is
    exactly the row of black triangles this replaced.

    The root therefore sits ON the hairline, where the mass still reaches
    the face, and the tip sits on the skin.

    `depth` pushes the tip further in front of the skin so the fringe
    locks layer over each other instead of z-fighting on one plane.
    """
    x0 = 0.100 * math.sin(math.radians(a_root))
    z0 = hairline_z(x0) + 0.058
    x1 = x_tip * 1.04
    z1 = hairline_z(x1) - 0.030

    steps = 16
    pts = []
    for i in range(steps + 1):
        t = i / float(steps)
        mt = 1.0 - t
        x = mt * mt * x0 + 2 * mt * t * x1 + t * t * x_tip
        z = mt * mt * z0 + 2 * mt * t * z1 + t * t * z_tip
        y_hood = mass_front_y(x, z) - 0.010
        y_face = face_point(x, z, out=0.010 + depth).y
        f = max(0.0, min(1.0, t / 0.22))
        f = f * f * (3.0 - 2.0 * f)
        pts.append(Vector((x, y_hood * (1.0 - f) + y_face * f, z)))

    radii = _lock_radii(half_w, steps, hold=0.58, power=1.05, ramp=0.20,
                        tip_r=0.005)
    v, f = L.blade(pts, radii, radial=20, flatten=0.94)
    return L.make_obj(name, v, f, mat)


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


def _groove_strands(ob, depth=0.0025):
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
        fade = (max(0.0, min(1.0, (1.78 - vtx.co.z) / 0.14))
                * max(0.0, min(1.0, (vtx.co.z - 1.22) / 0.10)))
        vtx.co -= n * (depth * groove * fade)
    me.update()
    return ob


def build_hair(m):
    """Hair = a dark mass + a fan of long locks + a fringe.

    The mass is built first on purpose: the face opening and the ear
    pockets are booleans on it, and the locks are added afterwards so the
    voxel remesh cannot round their points off.
    """
    # ---------- 1. the mass: a loft through the measured silhouette
    rings = []
    for z, xl, xr, d, cy in HAIR_BASE:
        c = (xl + xr) * 0.5
        hw = max(0.002, (xr - xl) * 0.5)
        ring = []
        for j in range(64):
            a = TAU * j / 64
            ring.append((c + hw * _spow(math.sin(a)),
                         cy - d * _spow(math.cos(a)),
                         z))
        rings.append(ring)
    v, f = L.loft(rings, cap_start=True, cap_end=True)
    hood = L.make_obj("HairMass", v, f, m["hair"])

    # 2026-11-03 decimation: voxel 0.007 -> 0.011.  HairMass drops from
    # ~64K to ~26K tris; the silhouette is set by HAIR_BASE, not voxel size.
    mass = _weld_hair([hood], smooth_factor=0.30, smooth_iters=4,
                      voxel=0.011)[0]
    _groove_strands(mass)

    # ---------- 2. the locks: the silhouette
    locks = []
    for spec in HAIR_LOCKS:
        name, ang, z_root, ring_r, tip, tip_dir, hw, bow = spec
        a = math.radians(ang)
        root = (ring_r * math.sin(a), -ring_r * math.cos(a), z_root)
        locks.append(_lock(f"Hair_{name}", root, tip, tip_dir, hw, m["hair"],
                           bow=bow))
    lock_ob = _join(locks, "HairLocks")

    # ---------- 3. the fringe, lying on the forehead
    fringe = [_bang(f"Hair_Fringe{i}", spec[0], spec[1], spec[2], m["hair"],
                    half_w=spec[3], depth=spec[4])
              for i, spec in enumerate(HAIR_FRONGE)]
    fringe_ob = _join(fringe, "HairFringe")

    return [mass, lock_ob, fringe_ob]


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


def _cut_face_opening(hair_obj, y_face=-0.215, x_max=0.30, z_floor=0.50):
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


def _carve_ear_pockets(hair_obj, ear_x=0.276, ear_y=0.004, ear_z=1.246,
                       r_y=0.072, r_z=0.104, x_in=0.244, x_out=0.470):
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
    _cut_face_opening(fused, y_face=-0.215, x_max=0.30)

    # Ear pockets: the reference has big ears sticking out under the hair.
    _carve_ear_pockets(fused, ear_x=0.300, ear_y=-0.006, ear_z=1.244,
                       r_y=0.084, r_z=0.118, x_in=0.248)

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


def _face_patch(name, cx, cz, rx, rz, out, mat, rim=0.0, dome=1.6, rings=6,
                segs=40):
    """A disc cut from the FACE's own surface, pushed out by `out`.

    The eye white has to be a patch of the face, not a ball: a ball big
    enough to read as an eye pokes out through the cheek at its rim, and the
    white then reads as a bead glued on.  `out` is how far the middle bulges
    off the skin and `rim` is the offset at the outer edge - a rim that sits
    on the skin (rim=0) is what makes the patch belong to the face.
    """
    verts = [tuple(face_point(cx, cz, out=out))]
    for r in range(1, rings + 1):
        f = r / float(rings)
        o = out * (1.0 - f ** dome) + rim * (f ** dome)
        for j in range(segs):
            a = TAU * j / segs
            x = cx + rx * f * math.cos(a)
            z = cz + rz * f * math.sin(a)
            verts.append(tuple(face_point(x, z, out=o)))

    faces = []
    for j in range(segs):
        faces.append([0, 1 + j, 1 + (j + 1) % segs])
    for r in range(rings - 1):
        b0 = 1 + r * segs
        b1 = 1 + (r + 1) * segs
        for j in range(segs):
            k = (j + 1) % segs
            faces.append([b0 + j, b1 + j, b1 + k, b0 + k])
    return L.make_obj(name, verts, faces, mat)


def _blush_patch(name, cx, cz, rx, rz, mat, skin_col, blush_col,
                 rings=7, segs=44):
    """A cheek blush that fades into the skin instead of ending on a hard edge.

    The vertex colour carries the fade: the centre is the red of the
    reference cheek, the rim is the skin colour, so the patch has no visible
    border at all.
    """
    verts = [tuple(face_point(cx, cz, out=0.0022))]
    for r in range(1, rings + 1):
        f = r / float(rings)
        # The rim has to stay a hair in front of the skin: exactly on it, the
        # patch z-fights with the face and the cheek gets a torn edge.
        o = 0.0022 * (1.0 - f ** 2.0) + 0.0009
        for j in range(segs):
            a = TAU * j / segs
            x = cx + rx * f * math.cos(a)
            z = cz + rz * f * math.sin(a)
            # Clamp to the face: a patch that runs past the cheek's edge falls
            # behind the head and comes back as a torn tail.
            hx, _ = head_dims(z)
            x = max(-hx * 0.985, min(hx * 0.985, x))
            verts.append(tuple(face_point(x, z, out=o)))

    faces = []
    for j in range(segs):
        faces.append([0, 1 + j, 1 + (j + 1) % segs])
    for r in range(rings - 1):
        b0 = 1 + r * segs
        b1 = 1 + (r + 1) * segs
        for j in range(segs):
            k = (j + 1) % segs
            faces.append([b0 + j, b1 + j, b1 + k, b0 + k])
    ob = L.make_obj(name, verts, faces, mat)

    ca = ob.data.color_attributes.new(name="Col", type="FLOAT_COLOR",
                                       domain="POINT")
    for i in range(len(ob.data.vertices)):
        f = 0.0 if i == 0 else math.ceil(i / float(segs)) / float(rings)
        t = max(0.0, min(1.0, (1.0 - f) ** 1.5))
        c = [blush_col[k] + (skin_col[k] - blush_col[k]) * t for k in range(3)]
        ca.data[i].color = (c[0], c[1], c[2], 1.0)
    return ob


def _eye_arc(s, p0, p1, p2, n=9, out=0.010):
    """Sample a quadratic arc across one eye, laid onto the face surface.

    p0/p1/p2 are (|x|, z); `s` mirrors the arc for the other eye.
    """
    pts = []
    for i in range(n):
        t = i / float(n - 1.0)
        mt = 1.0 - t
        ax = mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0]
        az = mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1]
        pts.append(face_point(s * ax, az, out=out))
    return pts


def _eye_rim(s, a0_deg, a1_deg, out=0.010, n=11):
    """Sample the RIM of the eye aperture - the eye's own outline.

    The lash line has to follow that outline.  A separate arc floating over the
    iris cuts a dark slash across the pupil, which is exactly what the old
    lash did.
    """
    pts = []
    for i in range(n):
        t = i / float(n - 1.0)
        a = math.radians(a0_deg + (a1_deg - a0_deg) * t)
        x = EYE_AP_X + EYE_AP_RX * math.cos(a)
        z = EYE_AP_Z + EYE_AP_RZ * math.sin(a)
        pts.append(face_point(s * x, z, out=out))
    return pts


def _iris_rim(s, a0_deg, a1_deg, out=0.010, n=11):
    """Sample the RIM of the IRIS disc.

    The lash has to ride on the iris, not on the aperture: the reference eye
    is a black disc with a thin brown eyelid line drawn AROUND it, and a
    heavy lash on the aperture rim reads as a separate arc floating over the
    eye.
    """
    pts = []
    for i in range(n):
        t = i / float(n - 1.0)
        a = math.radians(a0_deg + (a1_deg - a0_deg) * t)
        x = IRIS_X + IRIS_RX * math.cos(a)
        z = IRIS_Z + IRIS_RZ * math.sin(a)
        pts.append(face_point(s * x, z, out=out))
    return pts


def build_face(m):
    parts = []
    for s in (-1, 1):
        tag = "L" if s < 0 else "R"

        # The eye white is a patch of the face's own surface.  The iris is
        # pushed INWARD: in the reference the white shows as a crescent on the
        # OUTER side only, which is what makes the character read as looking
        # slightly inwards instead of straight ahead.
        #
        # The iris has to stay SMALLER than the aperture in every direction.
        # An iris as tall as the white pokes out over the lash line and the
        # lower lid and the eye reads as a bead stuck on the face.
        # The eye white has to stay UNDER the iris everywhere: a white dome
        # that pokes through the iris draws a light slash across the pupil.
        # The white is flat (dome 1.0) and the iris sits on top of it.
        parts.append(_face_patch(f"EyeWhite_{tag}", s * EYE_AP_X, EYE_AP_Z,
                                  EYE_AP_RX, EYE_AP_RZ, 0.004, m["sclera"],
                                  rim=0.0, dome=1.0))
        parts.append(_face_patch(f"Iris_{tag}", s * IRIS_X, IRIS_Z,
                                  IRIS_RX, IRIS_RZ, 0.010, m["iris"],
                                  rim=0.0040, dome=2.2))
        # The soft grey crescent under the pupil.  Without it the bottom of
        # the eye is bare white and the whole eye reads as a goggle.
        parts.append(_face_patch(f"IrisLow_{tag}", s * IRIS_X, IRIS_Z - 0.026,
                                  IRIS_RX * 0.90, IRIS_RZ * 0.55, 0.0105,
                                  m["irislow"], rim=0.0045, dome=2.2))

        # The upper lash line: a black band riding on the rim of the eye,
        # thickening towards the outer corner into an eyeliner wing.  It has to
        # sit on the white - a black tube lying on a black iris is invisible.
        # It must stay THIN though: at radius 0.017 it covered a third of the
        # eye and the character read as permanently angry.
        parts.append(_sweep_poly(
            f"Lash_{tag}",
            _iris_rim(s, 150, 20, out=0.011, n=11),
            0.006, m["eyeline"], sides=10, flat=0.50,
            radii=[0.0040, 0.0050, 0.0060, 0.0068, 0.0074, 0.0078, 0.0080,
                   0.0078, 0.0072, 0.0062, 0.0048]))

        # A thin lower lid under the iris.
        parts.append(_sweep_poly(
            f"LidLow_{tag}",
            _eye_rim(s, 200, 340, out=0.006, n=9),
            0.0032, m["eyeline"], sides=8, flat=0.45,
            radii=[0.0012, 0.0022, 0.0030, 0.0034, 0.0034, 0.0030, 0.0022,
                   0.0014, 0.0008]))

        # The big highlight sits at the upper LEFT of the iris and a small one
        # at the lower right - that is the reference's glint pair, and both
        # eyes catch the light on the SAME screen side.  They have to sit ON
        # the iris dome or they sink into it and the eye reads as a flat
        # black hole.
        for gname, dx, gz, gr, gy, go in (
                ("Big", 0.002, 1.249, 0.0135, 0.0055, 0.0092),):
            hp = face_point(s * IRIS_X + dx, gz, out=go)
            bpy.ops.mesh.primitive_uv_sphere_add(
                segments=26, ring_count=16, radius=1.0,
                location=(hp.x, hp.y, hp.z))
            ob = bpy.context.object
            ob.name = f"Glint{gname}_{tag}"
            ob.scale = (gr, gy, gr)
            bpy.ops.object.transform_apply(location=False, rotation=False,
                                           scale=True)
            L.shade_smooth(ob)
            L.assign(ob, m["glint"])
            parts.append(ob)

        # brow: a thick tapered arc, thickest at the inner end, arching over
        # the eye.  The fringe cuts across its inner end.
        parts.append(_sweep_poly(
            f"Brow_{tag}",
            _eye_arc(s, (0.098, 1.290), (0.140, 1.318), (0.188, 1.296),
                     n=9, out=0.007),
            0.012, m["hair"], sides=10, flat=0.45,
            radii=[0.0050, 0.0095, 0.0125, 0.0135, 0.0125, 0.0100, 0.0062,
                   0.0030, 0.0008]))

        # The blush is a soft gradient on the lower cheek, not a pink dot.
        # The reference colour is a pale pink that is barely darker than the
        # skin; the old saturated red read as a sticker pasted on the cheek.
        parts.append(_blush_patch(f"Blush_{tag}", s * 0.176, 1.092,
                                   0.040, 0.025, m["blush"],
                                   (0.824, 0.570, 0.486),
                                   (0.790, 0.470, 0.402)))

    # The nose is a soft shadow just above the mouth line - barely there.
    np = face_point(0.0, NOSE_Z, out=-0.002)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=26, ring_count=16, radius=1.0,
                                         location=tuple(np))
    ob = bpy.context.object
    ob.name = "Nose"
    ob.scale = (0.007, 0.003, 0.007)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    L.shade_smooth(ob)
    L.assign(ob, m["nose"])
    parts.append(ob)

    # The mouth is a thin, wide smile line, not a bar: a stretched sphere
    # reads as a red blob pasted on the face.  The reference smile runs from
    # z 1.082 in the middle up to z 1.152 at the corners - the corners are
    # 7 cm higher than the centre, which is what makes it read as a smile.
    mouth_pts = []
    for u in linspace(-1.0, 1.0, 13):
        x = u * 0.061
        z = MOUTH_Z - 0.008 + 0.056 * (u * u)
        mouth_pts.append(face_point(x, z, out=0.002))
    parts.append(_sweep_poly("Mouth", mouth_pts, 0.0026, m["mouth"],
                              sides=8, flat=0.45))

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
             (0.940, 0.186, 0.118),
             (0.985, 0.112, 0.086)]
    v, f = L.profile_tube(torso, sides=36, power=2.5)
    parts.append(L.make_obj("Torso", v, f, m["skin"]))

    tee = [(0.688, 0.206, 0.140),
           (0.706, 0.208, 0.142),
           (0.740, 0.197, 0.130),
           (0.820, 0.214, 0.139),
           (0.880, 0.219, 0.142),
           (0.945, 0.200, 0.130),
           (1.000, 0.118, 0.092)]
    v, f = L.profile_tube(tee, sides=36, power=2.6)
    parts.append(L.make_obj("Tee", v, f, m["tee"]))

    for s in (-1, 1):
        tag = "L" if s < 0 else "R"
        # The sleeve has to stop where the reference stops: the bare arm
        # measures +-0.246 at z 0.76 and the sleeve is only a few mm wider.
        parts.append(L.limb(
            f"Sleeve_{tag}",
            (s * 0.166, -0.004, 0.906), (s * 0.206, 0.002, 0.802),
            0.074, 0.066, m["tee"], sides=24, power=2.4, caps=0.75))

        # The upper arm starts lower and with a shorter cap than before: the
        # old cap poked out through the shoulder of the tee and left a skin
        # coloured dot on each shoulder.
        #
        # The arm hangs CLOSE to the body: the measured outer edge of the arm
        # is +-0.246 at z 0.76 and only reaches +-0.275 at z 0.70, so the
        # old arm (which sat at +-0.31) made the whole figure look bulky.
        parts.append(L.limb(f"UpperArm_{tag}",
                            (s * 0.164, -0.002, 0.882),
                            (s * 0.196, 0.004, 0.772),
                            0.050, 0.045, m["skin"], sides=20, caps=0.25))
        parts.append(L.limb(f"Forearm_{tag}",
                            (s * 0.196, 0.004, 0.772),
                            (s * 0.256, 0.014, 0.596),
                            0.045, 0.050, m["skin"], sides=20, caps=0.55))

        # The hands are big mittens in the reference: the outer edge reaches
        # +-0.322 at z 0.55 and is still +-0.30 at z 0.48.
        bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=18,
                                             radius=1.0,
                                             location=(s * 0.266, 0.000, 0.548))
        ob = bpy.context.object
        ob.name = f"Hand_{tag}"
        ob.scale = (0.064, 0.040, 0.080)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        L.shade_smooth(ob)
        L.assign(ob, m["skin"])
        parts.append(ob)
        parts.append(L.limb(f"Thumb_{tag}",
                            (s * 0.240, -0.016, 0.532),
                            (s * 0.222, -0.036, 0.480),
                            0.019, 0.013, m["skin"], sides=14, caps=0.6))

    return parts


def build_waist_shraph(m):
    parts = []
    # The plaid shirt is rolled into a thick band around the hips.  Measured off
    # chibi-hero.png the band sits at z 0.587..0.694 - BELOW the hem of the
    # white tee - and it is WIDER than the tee, so it has to stick out over it
    # or the whole thing disappears behind the shirt.
    band = [(0.702, 0.206, 0.130),
            (0.696, 0.224, 0.144),
            (0.678, 0.234, 0.152),
            (0.636, 0.236, 0.154),
            (0.606, 0.230, 0.148),
            (0.592, 0.214, 0.136),
            (0.586, 0.198, 0.124)]
    v, f = L.profile_tube(band, sides=36, power=2.0)
    parts.append(L.make_obj("PlaidBand", v, f, m["plaid"]))

    # The knot and the hanging ends have to sit IN FRONT of the waist band
    # and the pants: tucked inside them they were invisible, and all that
    # showed was a black rectangle where the plaid pattern happened to fall.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, radius=1.0,
                                         location=(0.0, -0.222, 0.646))
    ob = bpy.context.object
    ob.name = "PlaidKnot"
    ob.scale = (0.078, 0.054, 0.062)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    L.shade_smooth(ob)
    L.assign(ob, m["plaid"])
    parts.append(ob)

    # The two ends of the tied shirt: flat wide flaps hanging in front of the
    # pants.  A round ribbon here reads as a dark blob - the reference shows
    # broad flat ends that spread out from the knot.
    for name, x, z, ang, rx, ry, rz in (
            ("TailA", 0.076, 0.542, -18.0, 0.052, 0.013, 0.130),
            ("TailB", -0.072, 0.538, 18.0, 0.049, 0.013, 0.124)):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=18,
                                             radius=1.0,
                                             location=(x, -0.192, z))
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
        # The two ENDS of the tied shirt hang down the sides of the hips, in
        # front of the pants.  They are broad flat flaps: a round rope here
        # reads as a sausage stuck to the hip, which is what the old
        # PlaidSleeve ribbons did.
        side = [(0.700, 0.028, 0.020, s * 0.202),
                (0.652, 0.031, 0.024, s * 0.214),
                (0.596, 0.030, 0.024, s * 0.226),
                (0.522, 0.027, 0.021, s * 0.236),
                (0.460, 0.021, 0.017, s * 0.242),
                (0.424, 0.012, 0.011, s * 0.244)]
        v, f = L.profile_tube(side, sides=28, power=2.6)
        ob = L.make_obj(f"PlaidSide_{tag}", v, f, m["plaid"])
        ob.location.y = -0.072
        parts.append(ob)
    return parts


def build_pants(m):
    parts = []

    # The hips reach BELOW the torso's bottom cap on purpose: both ended at
    # z 0.600, so the skin cap and the red pants cap were coplanar and
    # z-fought into a red wedge in the crotch.  Sections are listed bottom-up.
    #
    # The waist is NARROW (+-0.195 at z 0.70, measured) and the thigh is
    # WIDE (+-0.28 at z 0.55): the reference pants are baggy harem pants that
    # flare out below the waist, not straight tubes.
    hips = [(0.470, 0.110, 0.080),
            (0.500, 0.140, 0.105),
            (0.540, 0.165, 0.125),
            (0.580, 0.180, 0.140),
            (0.620, 0.188, 0.148),
            (0.660, 0.190, 0.150),
            (0.688, 0.190, 0.148),
            (0.700, 0.182, 0.140)]
    v, f = L.profile_tube(hips, sides=36, power=2.5)
    parts.append(L.make_obj("PantsHip", v, f, m["pants"]))

    for s in (-1, 1):
        tag = "L" if s < 0 else "R"
        # The leg centres overlap on purpose: at +-0.113 the two legs left a
        # gap at the front and the hips' rounded crotch poked through it as a
        # red nub.
        cx = s * 0.128
        leg = [(0.712, 0.062, 0.058, cx),
               (0.660, 0.088, 0.080, cx),
               (0.600, 0.118, 0.104, cx),
               (0.550, 0.150, 0.128, cx),
               (0.500, 0.152, 0.132, cx),
               (0.450, 0.132, 0.118, cx),
               (0.400, 0.140, 0.124, cx),
               (0.350, 0.121, 0.112, cx),
               (0.300, 0.137, 0.122, cx),
               (0.250, 0.127, 0.118, cx),
               (0.196, 0.132, 0.122, cx)]
        v, f = L.profile_tube(leg, sides=32, power=2.4)
        parts.append(L.make_obj(f"PantsLeg_{tag}", v, f, m["pants"]))

        cuff = [(0.130, 0.126, 0.124, cx),
                (0.152, 0.136, 0.132, cx),
                (0.184, 0.128, 0.126, cx)]
        v, f = L.profile_tube(cuff, sides=32, power=2.4)
        parts.append(L.make_obj(f"Cuff_{tag}", v, f, m["pants"]))
    return parts


def build_shoes(m):
    parts = []
    for s in (-1, 1):
        tag = "L" if s < 0 else "R"
        cx = s * 0.128
        cy = -0.024

        # The reference sneaker has a TALL white midsole - the white band
        # sits at the BOTTOM of the shoe, not at the ankle.
        sole = [(0.000, 0.134, 0.178, cx, cy),
                (0.022, 0.148, 0.192, cx, cy),
                (0.052, 0.146, 0.190, cx, cy),
                (0.070, 0.137, 0.181, cx, cy)]
        v, f = L.profile_tube(sole, sides=32, power=3.2)
        parts.append(L.make_obj(f"Sole_{tag}", v, f, m["sole"]))

        upper = [(0.062, 0.137, 0.181, cx, cy),
                 (0.094, 0.143, 0.188, cx, cy),
                 (0.120, 0.139, 0.182, cx, cy),
                 (0.140, 0.126, 0.166, cx, cy),
                 (0.156, 0.098, 0.138, cx, cy),
                 (0.168, 0.064, 0.098, cx, cy)]
        v, f = L.profile_tube(upper, sides=32, power=3.2)
        ob = L.make_obj(f"Shoe_{tag}", v, f, m["shoe"])
        ob.rotation_euler = (0.0, 0.0, s * math.radians(-9.0))
        parts.append(ob)

        # Two white laces lying over the top of the shoe.  The reference has
        # NO white band at the ankle - the white is the midsole and the laces.
        for k, z in enumerate((0.118, 0.140)):
            _make_ribbon(parts, m["sole"], f"Lace_{tag}_{k}",
                         Vector((cx - 0.046, cy - 0.174, z)),
                         Vector((cx + 0.046, cy - 0.174, z)),
                         (0.013, 0.010))
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

    # Hair silhouette: the widest |x| per z band.  Compare this against the
    # profile printed by blender/measure_hero.py - the reference hair has a
    # double bump (0.436 at z 1.50, 0.373 at z 1.375, 0.416 at z 1.30).
    prof = {}
    bpy.context.view_layer.update()
    for o in parts:
        if not o.name.startswith("Hair"):
            continue
        mw = o.matrix_world
        for v in o.data.vertices:
            co = mw @ v.co
            key = int(round(co.z * 25.0)) / 25.0
            if abs(co.x) > prof.get(key, 0.0):
                prof[key] = abs(co.x)
    print("[hair] silhouette  z / half width")
    for z in sorted(prof, reverse=True):
        if z >= 0.95:
            print(f"    {z:6.3f}  {prof[z]:.3f}")
    print(f"[chibi] blend={blend}")
    print(f"[chibi] glb={glb} size={os.path.getsize(glb)}")


if __name__ == "__main__":
    main()