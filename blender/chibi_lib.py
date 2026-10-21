"""Shared mesh helpers for the chibi build.

Everything here is plain bpy/bmesh so the character can be built headlessly:
    blender --background --python chibi_build.py
"""

import math
import bpy
from mathutils import Vector

TAU = math.pi * 2.0


# --------------------------------------------------------------- scene utils
def purge_scene():
    """Wipe the scene so a rebuild is always deterministic."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.curves,
                 bpy.data.cameras, bpy.data.lights):
        for block in list(coll):
            if block.users == 0:
                coll.remove(block)


def set_input(node, name, value):
    """Principled input names shifted around in 4.x; probe before writing."""
    if name in node.inputs:
        node.inputs[name].default_value = value
        return True
    return False


def make_material(name, color, roughness=0.55, metallic=0.0,
                  subsurface=0.0, sss_radius=(0.36, 0.14, 0.08),
                  coat=0.0, specular=0.5):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    set_input(bsdf, "Base Color", (*color, 1.0))
    set_input(bsdf, "Roughness", roughness)
    set_input(bsdf, "Metallic", metallic)
    set_input(bsdf, "Specular IOR Level", specular)
    if subsurface:
        set_input(bsdf, "Subsurface Weight", subsurface)
        set_input(bsdf, "Subsurface Radius", sss_radius)
    if coat:
        set_input(bsdf, "Coat Weight", coat)
    return mat


def make_plaid_material(name, col_a, col_b, scale=6.5, band_scale=15.0):
    """Procedural buffalo plaid: checker blocks crossed by two wave bands."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    set_input(bsdf, "Roughness", 0.62)
    set_input(bsdf, "Specular IOR Level", 0.32)

    tc = nt.nodes.new("ShaderNodeTexCoord")
    tc.location = (-1200, 0)
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.location = (-1000, 0)

    checker = nt.nodes.new("ShaderNodeTexChecker")
    checker.location = (-800, 160)
    checker.inputs["Scale"].default_value = scale
    checker.inputs["Color1"].default_value = (*col_a, 1.0)
    checker.inputs["Color2"].default_value = (*col_b, 1.0)

    waves = []
    for i, axis in enumerate(("X", "Y")):
        w = nt.nodes.new("ShaderNodeTexWave")
        w.location = (-800, -120 - i * 240)
        w.wave_type = "BANDS"
        w.bands_direction = axis
        w.wave_profile = "SIN"
        w.inputs["Scale"].default_value = band_scale
        w.inputs["Distortion"].default_value = 0.0
        lt = nt.nodes.new("ShaderNodeMath")
        lt.location = (-600, -120 - i * 240)
        lt.operation = "LESS_THAN"
        lt.inputs[1].default_value = 0.42
        nt.links.new(w.outputs["Fac"], lt.inputs[0])
        waves.append(lt)

    union = nt.nodes.new("ShaderNodeMath")
    union.location = (-400, -180)
    union.operation = "MAXIMUM"
    nt.links.new(waves[0].outputs["Value"], union.inputs[0])
    nt.links.new(waves[1].outputs["Value"], union.inputs[1])

    invert = nt.nodes.new("ShaderNodeMath")
    invert.location = (-220, -180)
    invert.operation = "SUBTRACT"
    invert.inputs[0].default_value = 1.0
    nt.links.new(union.outputs["Value"], invert.inputs[1])

    darken = nt.nodes.new("ShaderNodeMix")
    darken.location = (-40, 0)
    darken.data_type = "RGBA"
    darken.blend_type = "MIX"
    darken.inputs[7].default_value = (0.02, 0.02, 0.02, 1.0)
    nt.links.new(invert.outputs["Value"], darken.inputs["Factor"])
    nt.links.new(checker.outputs["Color"], darken.inputs[6])
    nt.links.new(darken.outputs[2], bsdf.inputs["Base Color"])

    nt.links.new(tc.outputs["Generated"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], checker.inputs["Vector"])
    wave_nodes = [n for n in nt.nodes if n.bl_idname == "ShaderNodeTexWave"]
    for wn in wave_nodes:
        nt.links.new(mapping.outputs["Vector"], wn.inputs["Vector"])
    return mat


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def shade_smooth(obj, angle=55.0):
    for p in obj.data.polygons:
        p.use_smooth = True
    mod = obj.modifiers.new("Sharpen", "EDGE_SPLIT")
    mod.split_angle = math.radians(angle)
    return obj


def make_obj(name, verts, faces, mat=None, smooth=True, split_angle=55.0):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.validate()
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    if mat is not None:
        assign(ob, mat)
    if smooth:
        shade_smooth(ob, split_angle)
    return ob


# ------------------------------------------------------------------ surfacing
def superellipse(t, a, b, power=2.0):
    """Rounded-rect cross section. power=2 -> ellipse, 4 -> rounded box."""
    ct, st = math.cos(t), math.sin(t)
    x = a * math.copysign(abs(ct) ** (2.0 / power), ct)
    y = b * math.copysign(abs(st) ** (2.0 / power), st)
    return x, y


def loft(rings, cap_start=True, cap_end=True):
    """Bridge equal-length vertex rings into a tube."""
    verts = []
    faces = []
    n = len(rings[0])
    for ring in rings:
        verts.extend(ring)
    for i in range(len(rings) - 1):
        a = i * n
        b = (i + 1) * n
        for j in range(n):
            k = (j + 1) % n
            faces.append([a + j, a + k, b + k, b + j])
    if cap_start:
        faces.append(list(range(n - 1, -1, -1)))
    if cap_end:
        base = (len(rings) - 1) * n
        faces.append([base + j for j in range(n)])
    return verts, faces


def rings_from_sections(sections, sides=28, power=2.0):
    """sections: list of (z, half_x, half_y[, cx, cy])."""
    rings = []
    for sec in sections:
        z, a, b = sec[0], sec[1], sec[2]
        cx = sec[3] if len(sec) > 3 else 0.0
        cy = sec[4] if len(sec) > 4 else 0.0
        ring = []
        for j in range(sides):
            t = TAU * j / sides
            x, y = superellipse(t, a, b, power)
            ring.append((x + cx, y + cy, z))
        rings.append(ring)
    return rings


def profile_tube(sections, sides=28, power=2.0, cap_start=True, cap_end=True):
    return loft(rings_from_sections(sections, sides, power),
                cap_start=cap_start, cap_end=cap_end)


def bez(p0, p1, p2, t):
    mt = 1.0 - t
    return (
        mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
        mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1],
        mt * mt * p0[2] + 2 * mt * t * p1[2] + t * t * p2[2],
    )


def strand(p0, p1, p2, r_base, r_tip=0.018, steps=20, radial=18,
           flatten=0.90, tip_round=0.20, up_hint=(0.0, 0.0, 1.0)):
    """Sweep a tapered tube along a quadratic Bezier."""
    p0 = Vector(p0)
    p1 = Vector(p1)
    p2 = Vector(p2)
    rb = float(r_base)
    rt = float(r_tip)
    fl = float(flatten)
    steps_i = int(steps)
    radial_i = int(radial)

    pts, radii = [], []
    for i in range(steps_i + 1):
        t = float(i) / float(steps_i)
        mt = 1.0 - t
        cx = mt * mt * p0.x + 2.0 * mt * t * p1.x + t * t * p2.x
        cy = mt * mt * p0.y + 2.0 * mt * t * p1.y + t * t * p2.y
        cz = mt * mt * p0.z + 2.0 * mt * t * p1.z + t * t * p2.z
        pts.append((cx, cy, cz))
        if t < 0.42:
            radii.append(rb * (0.72 + 0.28 * (t / 0.42)))
        else:
            f = (t - 0.42) / 0.58
            radii.append(rt + (rb - rt) * (1.0 - f) ** 1.05)

    tangents = []
    for i in range(steps_i + 1):
        a = Vector(pts[max(i - 1, 0)])
        b = Vector(pts[min(i + 1, steps_i)])
        tangents.append((b - a).normalized())

    ref = Vector((0.0, 0.0, 1.0))
    if abs(tangents[0].dot(ref)) > 0.95:
        ref = Vector((1.0, 0.0, 0.0))

    rings = []
    for i in range(steps_i + 1):
        t = tangents[i]
        d = float(ref.dot(t))
        n = ref - t * d
        if n.length_squared < 1e-4:
            ref = Vector((1.0, 0.0, 0.0))
            n = ref - t * float(ref.dot(t))
        n = n.normalized()
        bc = t.cross(n)
        nx, ny, nz = float(n.x), float(n.y), float(n.z)
        bx, by, bz = float(bc.x), float(bc.y), float(bc.z)
        rj = float(radii[i])
        ring = []
        for j in range(radial_i):
            ang = TAU * j / float(radial_i)
            cj = math.cos(ang) * rj
            sj = math.sin(ang) * rj * fl
            cx = float(pts[i][0]) + nx * cj + bx * sj
            cy = float(pts[i][1]) + ny * cj + by * sj
            cz = float(pts[i][2]) + nz * cj + bz * sj
            ring.append((cx, cy, cz))
        rings.append(ring)

    rings[-1] = [pts[-1]] * radial_i
    return loft(rings, cap_start=True, cap_end=False)


def limb(name, a, b, ra, rb, mat=None, sides=20, power=2.0, caps=0.45):
    """Tapered capsule between two points; radii are absolute, not scaled."""
    a, b = Vector(a), Vector(b)
    axis = (b - a)
    length = axis.length
    axis = axis.normalized()

    ref = Vector((0.0, 0.0, 1.0))
    if abs(axis.dot(ref)) > 0.9:
        ref = Vector((1.0, 0.0, 0.0))
    n = (ref - axis * ref.dot(axis)).normalized()
    bn = axis.cross(n)

    steps = 12
    rings = []
    stations = []
    for i in range(steps + 1):
        f = i / steps
        stations.append(-caps * ra + (length + caps * ra + caps * rb) * f)
    total = stations[-1] - stations[0]

    for s in stations:
        if s < 0:
            ang = (1.0 + s / (caps * ra)) * math.pi * 0.5
            r = ra * math.sin(ang)
        elif s > length:
            ang = (1.0 - (s - length) / (caps * rb)) * math.pi * 0.5
            r = rb * math.sin(ang)
        else:
            r = ra + (rb - ra) * (s / max(length, 1e-6))
        c = a + axis * s
        ring = []
        for j in range(sides):
            ang = TAU * j / sides
            p = c + n * (math.cos(ang) * r) + bn * (math.sin(ang) * r)
            ring.append(tuple(p))
        rings.append(ring)

    v, f = loft(rings, cap_start=True, cap_end=True)
    return make_obj(name, v, f, mat)