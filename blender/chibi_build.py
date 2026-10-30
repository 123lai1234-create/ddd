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

# Eye geometry, measured off the reference (blender/measure_eye.py plus the
# ASCII map in blender/dbg_face.py):
#   aperture   x 0.062 .. 0.216,  z 1.150 .. 1.258
#   iris       x 0.062 .. 0.176,  z 1.150 .. 1.258   (near black)
#   sclera     a crescent on the OUTER side only
#   lash       a thick arc topping the eye, reaching z 1.272
#   highlight  a big silver disc at x 0.148, z 1.243
#   brow       |x| 0.095 .. 0.185,  z 1.305 .. 1.330
EYE_AP_X, EYE_AP_Z = 0.139, 1.204
EYE_AP_RX, EYE_AP_RZ = 0.077, 0.050
IRIS_X, IRIS_Z = 0.119, 1.203
IRIS_RX, IRIS_RZ = 0.055, 0.050
BROW_Z = 1.312
NOSE_Z = 1.140
MOUTH_Z = 1.078

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
    m["glint"] = L.make_material("Glint", (1.0, 1.0, 1.0), roughness=0.05)
    m["ear"] = L.make_material("Ear", (0.620, 0.150, 0.135), roughness=0.55)
    m["blush"] = make_vcol_blush_material("Blush")
    # The nose is a soft shadow, not a pink bead: it is barely darker than the
    # skin, just a touch warmer.
    m["nose"] = L.make_material("Nose", (0.700, 0.320, 0.250), roughness=0.55)
    m["mouth"] = L.make_material("Mouth", (0.460, 0.022, 0.022), roughness=0.40)
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
PLAID_PERIOD = 0.072


def _stripe(v, period, duty):
    return (v / period) % 1.0 < duty


def plaid_rgb(x, z):
    """Buffalo plaid: wide red/black checks crossed by thin black lines.

    The reference is a big red check with black squares at the crossings and
    a thin black line running through every red square - not a fine hatch.
    """
    dark = ((_stripe(x, PLAID_PERIOD, 0.5) and _stripe(z, PLAID_PERIOD, 0.5))
            or _stripe(x, PLAID_PERIOD, 0.24)
            or _stripe(z, PLAID_PERIOD, 0.24))
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
    """
    for ob in objs:
        if ob.type != "MESH":
            continue
        _subdivide(ob, levels=3)
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
        bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=18,
                                             radius=1.0,
                                             location=(s * 0.278, 0.004, 1.246))
        ob = bpy.context.object
        ob.name = f"Ear_{'L' if s < 0 else 'R'}"
        # flat in Y: an ear is a disc against the head, not a ball
        ob.scale = (0.062, 0.044, 0.082)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        L.shade_smooth(ob)
        L.assign(ob, m["skin"])
        obs.append(ob)

        # The reference ears are RED inside - a flat skin-coloured disc reads
        # as a blank ear and the face loses its frame.
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16,
                                             radius=1.0,
                                             location=(s * 0.276, -0.024, 1.244))
        inner = bpy.context.object
        inner.name = f"EarInner_{'L' if s < 0 else 'R'}"
        inner.scale = (0.034, 0.016, 0.050)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        L.shade_smooth(inner)
        L.assign(inner, m["ear"])
        obs.append(inner)
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
HAIR_CAP_MARGIN = 0.032

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
    """Front surface of the hair mass at a given (x, z).

    The mass hugs the skull, so its front is the face surface pushed out by
    the cap margin.
    """
    return face_point(x, z, out=HAIR_CAP_MARGIN).y


def _tip(a_deg, r, z):
    """A tip position from an azimuth and a horizontal radius."""
    a = math.radians(a_deg)
    return (r * math.sin(a), -r * math.cos(a), z)


# ---------------------------------------------------------------------------
# The reference hair is a sculpted mass of BROAD, overlapping leaves with
# sharp tips - not a bundle of needles.  The silhouette measured off the
# reference has a clear double bump:
#
#     z 1.800  half width 0.000   (the top spike)
#     z 1.700  half width 0.221
#     z 1.675  half width 0.282
#     z 1.600  half width 0.300
#     z 1.575  half width 0.376
#     z 1.500  half width 0.436   <- widest
#     z 1.375  half width 0.373
#     z 1.300  half width 0.416   <- second bump
#     z 1.175  half width 0.351
#     z 1.050  half width 0.260
#     z 1.025  half width 0.191
#
# The locks below put their tips on that outline: a crown sweep and a horn,
# a wide tier at z 1.50, a second tier at z 1.30, cheek locks at z 1.18 and
# nape locks that hang to z 1.03.
#
# (z_root, a_root, tip, bow_dir, bow, r_base)
#   z_root   height the lock leaves the scalp
#   a_root   azimuth of the root, 0 = straight ahead (-Y)
#   tip      (x, y, z) of the point
#   bow_dir  direction the arc bulges towards
#   bow      how far it bulges
#   r_base   half width of the blade at the root
HAIR_LOCKS = [
    # --- crown: a big sweep to the upper left and a horn in the middle
    (1.420,  -34, (-0.267, -0.030, 1.780), (-0.75,  0.10,  0.65), 0.110, 0.130),
    (1.480,   12, ( 0.045,  0.030, 1.797), ( 0.15,  0.30,  0.94), 0.055, 0.090),
    # the two in between, so the crown is a continuous mass and not two horns
    (1.480,  -14, (-0.130, -0.020, 1.752), (-0.55,  0.10,  0.83), 0.070, 0.115),
    (1.470,   30, ( 0.180,  0.010, 1.735), ( 0.60, -0.05,  0.80), 0.070, 0.105),
    # --- left side, from the crown down to the jaw
    (1.480,  -54, (-0.317,  0.020, 1.638), (-0.92,  0.06,  0.38), 0.070, 0.105),
    (1.450,  -70, (-0.434,  0.000, 1.576), (-0.95,  0.00,  0.30), 0.080, 0.115),
    (1.380,  -80, (-0.426, -0.020, 1.462), (-0.88, -0.04, -0.45), 0.070, 0.105),
    (1.300,  -88, (-0.390, -0.060, 1.350), (-0.80, -0.10, -0.58), 0.060, 0.098),
    (1.240,  -94, (-0.348, -0.090, 1.200), (-0.70, -0.15, -0.70), 0.055, 0.092),
    (1.190,  -98, (-0.300, -0.100, 1.100), (-0.55, -0.20, -0.81), 0.050, 0.084),
    (1.140, -100, (-0.262, -0.090, 1.035), (-0.45, -0.25, -0.86), 0.045, 0.074),
    # --- right side
    (1.480,   34, ( 0.270,  0.020, 1.664), ( 0.85,  0.10,  0.52), 0.070, 0.100),
    (1.450,   58, ( 0.442,  0.000, 1.508), ( 0.96,  0.00,  0.26), 0.080, 0.125),
    (1.380,   70, ( 0.411, -0.020, 1.456), ( 0.90, -0.04, -0.42), 0.070, 0.100),
    (1.300,   80, ( 0.390, -0.060, 1.350), ( 0.82, -0.10, -0.55), 0.060, 0.098),
    (1.240,   88, ( 0.348, -0.090, 1.200), ( 0.72, -0.15, -0.68), 0.055, 0.092),
    (1.190,   94, ( 0.300, -0.100, 1.100), ( 0.58, -0.20, -0.79), 0.050, 0.084),
    (1.140,   98, ( 0.262, -0.090, 1.035), ( 0.48, -0.25, -0.84), 0.045, 0.074),
    # --- the locks that fill the volume between the outline ones
    (1.500,  -20, (-0.415,  0.060, 1.500), (-0.90,  0.10,  0.42), 0.060, 0.095),
    (1.500,   20, ( 0.420,  0.060, 1.550), ( 0.92,  0.08,  0.38), 0.060, 0.095),
    (1.470,  -62, (-0.375, -0.030, 1.380), (-0.85, -0.08, -0.52), 0.055, 0.090),
    (1.470,   64, ( 0.375, -0.030, 1.380), ( 0.85, -0.08, -0.52), 0.055, 0.090),
    # --- the back of the head, visible when the model is turned around
    (1.520,  150, (-0.280,  0.220, 1.540), (-0.35,  0.85,  0.45), 0.070, 0.100),
    (1.520, -150, ( 0.280,  0.220, 1.540), ( 0.35, -0.85,  0.45), 0.070, 0.100),
    (1.360,  180, ( 0.000,  0.265, 1.320), ( 0.00,  0.95, -0.30), 0.060, 0.100),
    (1.180,  180, ( 0.000,  0.235, 1.070), ( 0.00,  0.95, -0.30), 0.050, 0.090),
]

# The volume under the locks.  These are welded into the mass and remeshed,
# so they only have to give the hair its bulk - their tips are never seen.
HAIR_FILL = [
    (1.500,    0, (-0.120, -0.230, 1.620), (-0.55,  0.25,  0.80), 0.060, 0.100),
    (1.500,  180, ( 0.120,  0.230, 1.620), ( 0.55, -0.25,  0.80), 0.060, 0.100),
    (1.430,  -70, (-0.320,  0.000, 1.470), (-0.92,  0.00,  0.36), 0.070, 0.105),
    (1.430,   70, ( 0.320,  0.000, 1.470), ( 0.92,  0.00,  0.36), 0.070, 0.105),
    (1.330,  150, (-0.240,  0.190, 1.330), (-0.45,  0.75, -0.48), 0.060, 0.095),
    (1.330, -150, ( 0.240,  0.190, 1.330), ( 0.45, -0.75, -0.48), 0.060, 0.095),
    (1.180,  180, ( 0.000,  0.230, 1.060), ( 0.00,  0.95, -0.30), 0.050, 0.090),
]

# The volume locks are welded into the mass so the hair is a carved volume
# and not a hat with leaves stuck on it.  They stay inside the silhouette.

# The fringe: thirteen broad locks lying on the forehead.
#
# (x_tip, z_tip, a_root)
#   x_tip   where the tip lands on the forehead
#   z_tip   how low it hangs - the brows sit at 1.31, so the tips stop
#           between 1.25 and 1.39 and the lower edge stays ragged instead of
#           reading as one straight row of triangles
#   a_root  azimuth of the root on the skull cap
HAIR_FRONGE = [
    (-0.300, 1.160, -94),
    (-0.278, 1.190, -86),
    (-0.256, 1.212, -80),
    (-0.232, 1.232, -74),
    (-0.208, 1.248, -68),
    (-0.186, 1.262, -62),
    (-0.164, 1.276, -56),
    (-0.140, 1.290, -50),
    (-0.116, 1.302, -44),
    (-0.092, 1.314, -38),
    (-0.066, 1.322, -32),
    (-0.038, 1.330, -25),
    (-0.010, 1.336, -17),
    ( 0.020, 1.338,  -8),
    ( 0.050, 1.336,   2),
    ( 0.080, 1.330,  12),
    ( 0.108, 1.322,  22),
    ( 0.136, 1.310,  32),
    ( 0.162, 1.296,  42),
    ( 0.188, 1.278,  52),
    ( 0.214, 1.256,  62),
    ( 0.238, 1.230,  74),
    ( 0.262, 1.202,  86),
    ( 0.286, 1.172,  96),
]


def _skull_point(z, a_deg, inset=0.0):
    """A point on the scalp.  z = height, a = azimuth (0 = front / -Y).

    `inset` pushes the point into the skull so a lock's root is buried
    instead of sitting on the surface.
    """
    rx, ry = head_dims(z)
    a = math.radians(a_deg)
    p = Vector((rx * math.sin(a), -ry * math.cos(a), z))
    if inset:
        n = Vector((p.x, p.y, 0.0))
        if n.length > 1e-6:
            p -= n.normalized() * inset
    return p


# The surface leaves are gone: the crescent locks below now do that job.
# A separate set of small leaves lying on the mass only added noise - the
# reference hair is made of big blades, not of a helmet with scales on it.


def _lock(name, z_root, a_root, tip, bow_dir, bow, r_base, mat,
          tip_r0=0.005, steps=20, flatten=0.34, hold=0.34, inset=0.010):
    """One crescent lock of hair.

    A broad blade that leaves the scalp, arcs outward and ends in a sharp
    point.  The locks are built AFTER the mass is carved and booleaned: a
    voxel remesh rounds every tip into a petal, and the reference hair is all
    sharp points - so the silhouette is made of separate blades that are never
    remeshed.

    The blade is swept with its wide axis in the screen plane, so a lock
    shows its full width to the viewer the way the reference locks do.
    """
    root = _skull_point(z_root, a_root, inset=inset)
    tip = Vector(tip)
    ctrl = (root + tip) * 0.5 + Vector(bow_dir).normalized() * bow
    pts = L.bezier_pts(root, ctrl, tip, steps)
    radii = L.blade_radii(r_base, tip_r0, steps, hold)
    v, f = L.blade(pts, radii, radial=20, flatten=flatten)
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


def _bang(name, x_tip, z_tip, a_root, mat, r_base=0.150, hold=0.70):
    """One fringe lock: it leaves the hair mass at the hairline and lies on
    the forehead from there down to its tip.

    The lock has to follow the FOREHEAD, not the cap.  The cap is 32 mm in
    front of the face, so a lock that starts at the crown and falls
    straight down ends up inside the skull and only its tip shows - that is
    exactly the row of black triangles this replaced.

    The blade is swept with its wide axis in the screen plane, so a fringe
    lock shows its full width to the viewer the way the reference bangs do.
    """
    x0 = 0.150 * math.sin(math.radians(a_root))
    z0 = hairline_z(x0) + 0.075
    x1 = x_tip * 0.92
    z1 = hairline_z(x1) - 0.030

    steps = 18
    pts = []
    for i in range(steps + 1):
        t = i / float(steps)
        mt = 1.0 - t
        x = mt * mt * x0 + 2 * mt * t * x1 + t * t * x_tip
        z = mt * mt * z0 + 2 * mt * t * z1 + t * t * z_tip
        f = max(0.0, min(1.0, t / 0.45))
        f = f * f * (3.0 - 2.0 * f)
        # The lock has to sit ON TOP of the hair mass, not inside it: a fringe
        # buried under the cap surface shows nothing but its tip, which is the
        # row of black teeth the reference does not have.
        y_cap = cap_y(x, z) + 0.022
        y_face = face_point(x, z, out=0.014).y
        pts.append(Vector((x, y_cap * (1.0 - f) + y_face * f, z)))

    radii = L.blade_radii(r_base, 0.012, steps, hold, power=2.0)
    v, f = L.blade(pts, radii, radial=20, flatten=0.40)
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
    """Hair = a scalp shell + crescent locks + a fringe.

    The mass and the fringe are built in that order on purpose: the face
    opening and the ear pockets are booleans, and a lock that is welded into
    the mass gets cut away with it.  The crescent locks are added last so the
    voxel remesh cannot round their points off.
    """
    # ---------- 1. the mass: the scalp shell plus the volume under it
    sections = []
    for z, rx, ry in HEAD_PROFILE:
        if z < 1.060 or z > 1.582:
            continue
        if z < 1.120:
            margin = -0.020         # tuck the rim inside the skull
        elif z < 1.180:
            margin = 0.012
        else:
            margin = HAIR_CAP_MARGIN
        sections.append((z, rx + margin, ry + margin))
    v, f = L.profile_tube(sections, sides=64, power=HEAD_POWER,
                           cap_start=True, cap_end=True)
    cap = L.make_obj("HairCap", v, f, m["hair"])

    parts = [cap]
    for i, spec in enumerate(HAIR_FILL):
        parts.append(_lock(f"Hair_Fill{i}", *spec, m["hair"]))

    mass = _weld_hair(parts, smooth_factor=0.10, smooth_iters=2,
                      voxel=0.008)[0]
    _groove_strands(mass)

    # ---------- 2. the crescent locks: the silhouette
    locks = [_lock(f"Hair_Lock{i}", *spec, m["hair"])
             for i, spec in enumerate(HAIR_LOCKS)]
    lock_ob = _join(locks, "HairLocks")

    # ---------- 3. the fringe, lying on the forehead
    fringe = [_bang(f"Hair_Fringe{i}", spec[0], spec[1], spec[2], m["hair"])
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
    verts = [tuple(face_point(cx, cz, out=0.0035))]
    for r in range(1, rings + 1):
        f = r / float(rings)
        # The rim has to stay a hair in front of the skin: exactly on it, the
        # patch z-fights with the face and the cheek gets a torn edge.
        o = 0.0035 * (1.0 - f ** 2.0) + 0.0012
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
                                  IRIS_RX, IRIS_RZ, 0.008, m["iris"],
                                  rim=0.0035, dome=2.0))

        # The upper lash line: a BOLD black band riding on the rim of the eye,
        # thickening towards the outer corner into an eyeliner wing.  It has to
        # sit on the white - a black tube lying on a black iris is invisible.
        parts.append(_sweep_poly(
            f"Lash_{tag}",
            _eye_rim(s, 166, 16, out=0.010, n=11),
            0.009, m["hair"], sides=10, flat=0.50,
            radii=[0.006, 0.0085, 0.0105, 0.0120, 0.0130, 0.0135, 0.0135,
                   0.0125, 0.0105, 0.0080, 0.0045]))

        # A thin lower lid under the iris.
        parts.append(_sweep_poly(
            f"LidLow_{tag}",
            _eye_rim(s, 202, 338, out=0.007, n=7),
            0.0045, m["hair"], sides=8, flat=0.45,
            radii=[0.002, 0.0035, 0.0042, 0.0042, 0.0035, 0.0028, 0.0018]))

        # The big highlight sits at the upper OUTER corner of the iris and a
        # small one at the lower inner - that is the reference's glint pair.
        # They have to sit ON the iris dome or they sink into it and the eye
        # reads as a flat black hole.
        for gname, gx, gz, gr, gy, go in (
                ("Big", 0.128, 1.226, 0.017, 0.006, 0.0090),
                ("Small", 0.095, 1.176, 0.010, 0.005, 0.0085)):
            hp = face_point(s * gx, gz, out=go)
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
            _eye_arc(s, (0.104, 1.296), (0.142, 1.318), (0.182, 1.300),
                     n=9, out=0.007),
            0.011, m["hair"], sides=10, flat=0.45,
            radii=[0.013, 0.0145, 0.0140, 0.0130, 0.0115, 0.0095, 0.0065,
                   0.0035, 0.0012]))

        # The blush is a soft gradient on the lower cheek, not a pink dot.
        parts.append(_blush_patch(f"Blush_{tag}", s * 0.192, 1.100,
                                   0.050, 0.044, m["blush"],
                                   (0.776, 0.426, 0.321),
                                   (0.715, 0.205, 0.180)))

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
    # reads as a red blob pasted on the face.  The reference smile is ~0.126
    # wide with sharply upturned corners.
    mouth_pts = []
    for u in linspace(-1.0, 1.0, 13):
        x = u * 0.063
        z = MOUTH_Z - 0.014 + 0.030 * (u * u)
        mouth_pts.append(face_point(x, z, out=0.002))
    parts.append(_sweep_poly("Mouth", mouth_pts, 0.0030, m["mouth"],
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
    # The plaid shirt is rolled into a thick band around the hips.  Measured off
    # chibi-hero.png the band sits at z 0.587..0.694 - BELOW the hem of the
    # white tee - and it is WIDER than the tee, so it has to stick out over it
    # or the whole thing disappears behind the shirt.
    band = [(0.700, 0.238, 0.158),
            (0.660, 0.246, 0.163),
            (0.620, 0.244, 0.161),
            (0.590, 0.230, 0.150)]
    v, f = L.profile_tube(band, sides=36, power=2.5)
    parts.append(L.make_obj("PlaidBand", v, f, m["plaid"]))

    # The knot and the hanging ends have to sit IN FRONT of the waist band
    # and the pants: tucked inside them they were invisible, and all that
    # showed was a black rectangle where the plaid pattern happened to fall.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, radius=1.0,
                                         location=(0.0, -0.212, 0.648))
    ob = bpy.context.object
    ob.name = "PlaidKnot"
    ob.scale = (0.070, 0.048, 0.056)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    L.shade_smooth(ob)
    L.assign(ob, m["plaid"])
    parts.append(ob)

    # The two ends of the tied shirt: flat wide flaps hanging in front of the
    # pants.  A round ribbon here reads as a dark blob - the reference shows
    # broad flat ends that spread out from the knot.
    for name, x, z, ang, rx, ry, rz in (
            ("TailA", 0.090, 0.524, -13.0, 0.072, 0.017, 0.140),
            ("TailB", -0.084, 0.520, 13.0, 0.068, 0.017, 0.134)):
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

        # The reference shoe has a white collar folded over the ankle - it is
        # what separates the black upper from the red cuff above it.
        collar = [(0.132, 0.118, 0.156, cx, cy),
                  (0.146, 0.124, 0.160, cx, cy),
                  (0.166, 0.122, 0.158, cx, cy),
                  (0.178, 0.114, 0.150, cx, cy)]
        v, f = L.profile_tube(collar, sides=32, power=3.2)
        parts.append(L.make_obj(f"Collar_{tag}", v, f, m["sole"]))

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