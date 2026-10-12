"""Procedural low-poly chibi character mesh.

Outputs:
  - chibi_base.obj (Wavefront OBJ with vertices / faces / normals)
  - chibi_base.mtl (basic material)

Chibi proportions: oversized round head (~50% body height), small body,
stubby limbs, classic "kawaii" sitting pose.

Coordinates: Y up, origin at feet-center.
Units: arbitrary (1.0 = ~1 unit cube bounding).
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np

PROJ = Path(r"C:\Users\User\.minimax\sessions\mvs_4523b3f8d78e4a098b3512a12e688cec\workspace\kid-3d-project")


# ---------- Geometry helpers ----------

def uv_sphere(radius: float, rings: int, sectors: int) -> tuple[np.ndarray, np.ndarray]:
    """Generate UV-sphere vertices and faces.

    Returns (V, F) where V is (N, 3) float and F is (M, 3) int (0-indexed).
    """
    V = []
    for r in range(rings + 1):
        theta = math.pi * r / rings  # 0..pi
        for s in range(sectors + 1):
            phi = 2 * math.pi * s / sectors
            x = radius * math.sin(theta) * math.cos(phi)
            y = radius * math.cos(theta)
            z = radius * math.sin(theta) * math.sin(phi)
            V.append((x, y, z))
    V = np.asarray(V, dtype=np.float64)

    F = []
    for r in range(rings):
        for s in range(sectors):
            i0 = r * (sectors + 1) + s
            i1 = i0 + (sectors + 1)
            F.append((i0, i1, i1 + 1))
            F.append((i0, i1 + 1, i0 + 1))
    return V, np.asarray(F, dtype=np.int64)


def capsule(radius: float, height: float, radial: int, height_seg: int) -> tuple[np.ndarray, np.ndarray]:
    """Cylinder with hemisphere ends along Y axis."""
    verts = []
    faces = []

    # Body cylinder
    for h in range(height_seg + 1):
        y = -height / 2 + h * (height / height_seg)
        for s in range(radial):
            phi = 2 * math.pi * s / radial
            x = radius * math.cos(phi)
            z = radius * math.sin(phi)
            verts.append((x, y, z))
    body_top = height_seg * radial
    body_bottom = 0
    for h in range(height_seg):
        for s in range(radial):
            i0 = body_bottom + h * radial + s
            i1 = body_bottom + h * radial + (s + 1) % radial
            i2 = body_bottom + (h + 1) * radial + (s + 1) % radial
            i3 = body_bottom + (h + 1) * radial + s
            faces.append((i0, i2, i1))
            faces.append((i0, i3, i2))

    # Top hemisphere
    top_center_idx = len(verts)
    verts.append((0, height / 2, 0))
    top_ring_start = len(verts)
    for h in range(1, height_seg + 1):
        theta = math.pi / 2 * h / height_seg
        y = height / 2 + radius * math.sin(theta)
        rr = radius * math.cos(theta)
        for s in range(radial):
            phi = 2 * math.pi * s / radial
            x = rr * math.cos(phi)
            z = rr * math.sin(phi)
            verts.append((x, y, z))
    for h in range(height_seg - 1):
        for s in range(radial):
            i0 = top_ring_start + h * radial + s
            i1 = top_ring_start + h * radial + (s + 1) % radial
            i2 = top_ring_start + (h + 1) * radial + (s + 1) % radial
            i3 = top_ring_start + (h + 1) * radial + s
            faces.append((i0, i2, i1))
            faces.append((i0, i3, i2))
    # Top cap triangles
    last_ring = top_ring_start + (height_seg - 1) * radial
    for s in range(radial):
        faces.append((last_ring + s, top_center_idx, last_ring + (s + 1) % radial))

    # Bottom hemisphere
    bot_center_idx = len(verts)
    verts.append((0, -height / 2, 0))
    bot_ring_start = len(verts)
    for h in range(1, height_seg + 1):
        theta = math.pi / 2 * h / height_seg
        y = -height / 2 - radius * math.sin(theta)
        rr = radius * math.cos(theta)
        for s in range(radial):
            phi = 2 * math.pi * s / radial
            x = rr * math.cos(phi)
            z = rr * math.sin(phi)
            verts.append((x, y, z))
    for h in range(height_seg - 1):
        for s in range(radial):
            i0 = bot_ring_start + h * radial + s
            i1 = bot_ring_start + h * radial + (s + 1) % radial
            i2 = bot_ring_start + (h + 1) * radial + (s + 1) % radial
            i3 = bot_ring_start + (h + 1) * radial + s
            faces.append((i0, i1, i2))
            faces.append((i0, i2, i3))
    last_ring = bot_ring_start + (height_seg - 1) * radial
    for s in range(radial):
        faces.append((bot_center_idx, last_ring + s, last_ring + (s + 1) % radial))

    return np.asarray(verts, dtype=np.float64), np.asarray(faces, dtype=np.int64)


# ---------- Chibi assembly ----------

def build_chibi() -> tuple[np.ndarray, np.ndarray, list[dict]]:
    """Assemble chibi character. Returns (vertices, faces, groups)."""
    all_v: list[np.ndarray] = []
    all_f: list[np.ndarray] = []
    groups: list[dict] = []
    vert_offset = 0  # running total of vertex count, NOT list length

    def add(part_name: str, mat: str, V: np.ndarray, F: np.ndarray) -> None:
        nonlocal vert_offset
        offset = vert_offset
        all_v.append(V)
        all_f.append(F + offset)
        groups.append({"name": part_name, "mat": mat, "offset": offset, "count": len(V)})
        vert_offset += len(V)

    # Head: oversized round sphere
    head_V, head_F = uv_sphere(radius=0.55, rings=14, sectors=18)
    head_V += np.array([0, 1.05, 0])  # lift head up
    add("head", "skin", head_V, head_F)

    # Hair cap: a slightly larger sphere, only top half, slightly darker / different material
    hair_V, hair_F = uv_sphere(radius=0.555, rings=8, sectors=18)
    hair_V += np.array([0, 1.10, 0])
    # Keep only faces whose centroid is above y~1.05 (top hemisphere)
    c = hair_V[hair_F].mean(axis=1)
    keep = c[:, 1] > 1.06
    hair_F = hair_F[keep]
    add("hair", "hair", hair_V, hair_F)

    # Eyes: two small dark spheres in front
    for sign, x in [(-1, -0.16), (1, 0.16)]:
        eye_V, eye_F = uv_sphere(radius=0.07, rings=8, sectors=12)
        eye_V += np.array([x, 1.07, 0.48])
        add(f"eye_{sign}", "eye", eye_V, eye_F)
    # Eye whites (just one slightly larger for layering illusion — skip; keep simple)

    # Body: tapered torso (use capsule, narrow at bottom for chibi)
    body_V, body_F = capsule(radius=0.28, height=0.55, radial=16, height_seg=4)
    # Slight taper: scale x/z by (0.85 + 0.3*y/maxY) to widen at top
    ys = body_V[:, 1]
    body_V[:, 0] *= 0.95 + 0.25 * (ys + 0.275) / 0.55
    body_V[:, 2] *= 0.95 + 0.25 * (ys + 0.275) / 0.55
    body_V += np.array([0, 0.50, 0])  # sit body above legs
    add("body", "shirt", body_V, body_F)

    # Arms: two capsules reaching up to face (cute pose)
    for sign, x in [(-1, -0.30), (1, 0.30)]:
        arm_V, arm_F = capsule(radius=0.085, height=0.45, radial=10, height_seg=3)
        # Rotate so the arm points upward and slightly inward toward face
        # tilt: rotate around Z axis by ~25deg outward
        ang = math.radians(25) * sign
        cos_a, sin_a = math.cos(ang), math.sin(ang)
        rot = np.array([[cos_a, -sin_a, 0], [sin_a, cos_a, 0], [0, 0, 1]])
        arm_V = arm_V @ rot.T
        arm_V += np.array([x, 0.85, 0.05])  # near cheek level
        add(f"arm_{sign}", "skin", arm_V, arm_F)

    # Legs: shorter capsules, splayed forward (sitting)
    for sign, x in [(-1, -0.18), (1, 0.18)]:
        leg_V, leg_F = capsule(radius=0.11, height=0.30, radial=12, height_seg=2)
        # Tilt slightly forward (rotate around X)
        ang = math.radians(-15)
        cos_a, sin_a = math.cos(ang), math.sin(ang)
        rot = np.array([[1, 0, 0], [0, cos_a, -sin_a], [0, sin_a, cos_a]])
        leg_V = leg_V @ rot.T
        leg_V += np.array([x, 0.18, 0.10])
        add(f"leg_{sign}", "pants", leg_V, leg_F)

    # Shoes: small flattened spheres at leg tips
    for sign, x in [(-1, -0.18), (1, 0.18)]:
        shoe_V, shoe_F = uv_sphere(radius=0.13, rings=6, sectors=10)
        shoe_V[:, 1] *= 0.6  # flatten
        shoe_V += np.array([x, 0.04, 0.30])
        add(f"shoe_{sign}", "shoe", shoe_V, shoe_F)

    V = np.vstack(all_v)
    F = np.vstack(all_f)
    return V, F, groups


def compute_normals(V: np.ndarray, F: np.ndarray) -> np.ndarray:
    """Compute per-vertex smooth normals."""
    N = np.zeros_like(V)
    np.add.at(N, F[:, 0], np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]]))
    np.add.at(N, F[:, 1], np.cross(V[F[:, 2]] - V[F[:, 1]], V[F[:, 0]] - V[F[:, 1]]))
    np.add.at(N, F[:, 2], np.cross(V[F[:, 0]] - V[F[:, 2]], V[F[:, 1]] - V[F[:, 2]]))
    norm = np.linalg.norm(N, axis=1, keepdims=True)
    norm[norm == 0] = 1
    return N / norm


def write_obj(path: Path, V: np.ndarray, F: np.ndarray, groups: list[dict], mtl_name: str = "chibi.mtl") -> None:
    N = compute_normals(V, F)
    lines = [
        "# Chibi character base mesh",
        "# Generated by build_chibi_mesh.py — for use as a starter template.",
        f"mtllib {mtl_name}",
        f"o chibi",
    ]
    # Vertices
    for x, y, z in V:
        lines.append(f"v {x:.5f} {y:.5f} {z:.5f}")
    for nx, ny, nz in N:
        lines.append(f"vn {nx:.5f} {ny:.5f} {nz:.5f}")
    # Faces — group per part with material
    for g in groups:
        lines.append(f"g {g['name']}")
        lines.append(f"usemtl {g['mat']}")
        # faces belonging to this group are F indices [offset, offset+count-1]
        start = g["offset"]
        end = start + g["count"]
        mask = (F[:, 0] >= start) & (F[:, 0] < end)
        subF = F[mask]
        for tri in subF:
            a, b, c = tri + 1  # OBJ is 1-indexed
            lines.append(f"f {a}//{a} {b}//{b} {c}//{c}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_mtl(path: Path) -> None:
    lines = [
        "# Chibi character materials",
        "newmtl skin",
        "  Ka 0.95 0.78 0.66",
        "  Kd 0.95 0.78 0.66",
        "  Ks 0.10 0.10 0.10",
        "  Ns 8",
        "  d 1",
        "",
        "newmtl hair",
        "  Ka 0.10 0.10 0.12",
        "  Kd 0.12 0.12 0.15",
        "  Ks 0.20 0.20 0.20",
        "  Ns 16",
        "  d 1",
        "",
        "newmtl shirt",
        "  Ka 0.20 0.40 0.70",
        "  Kd 0.30 0.55 0.85",
        "  Ks 0.10 0.10 0.10",
        "  Ns 8",
        "  d 1",
        "",
        "newmtl pants",
        "  Ka 0.15 0.20 0.40",
        "  Kd 0.20 0.25 0.55",
        "  Ks 0.05 0.05 0.05",
        "  Ns 4",
        "  d 1",
        "",
        "newmtl shoe",
        "  Ka 0.10 0.10 0.12",
        "  Kd 0.15 0.15 0.18",
        "  Ks 0.30 0.30 0.30",
        "  Ns 32",
        "  d 1",
        "",
        "newmtl eye",
        "  Ka 0.05 0.05 0.05",
        "  Kd 0.05 0.05 0.05",
        "  Ks 0.50 0.50 0.50",
        "  Ns 64",
        "  d 1",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    V, F, groups = build_chibi()
    write_obj(PROJ / "chibi_base.obj", V, F, groups)
    write_mtl(PROJ / "chibi_base.mtl")
    print(f"V={len(V)} F={len(F)} groups={len(groups)}")
    print(f"bbox min={V.min(axis=0).round(3)} max={V.max(axis=0).round(3)}")
    print(f"wrote {PROJ / 'chibi_base.obj'}")
    print(f"wrote {PROJ / 'chibi_base.mtl'}")