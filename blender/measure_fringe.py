"""Measure the hair silhouette and the fringe line off the reference image.

Three things the model needs and cannot be eyeballed:

  * the LEFT and RIGHT extremes of the hair at every height (the silhouette
    table in measure_hero.py only gives the half width, so a single horn at
    the crown and two horns look identical)
  * the lowest point of the hair over the forehead for every x - that IS the
    fringe line, i.e. where each bang tip lands
  * the eye / lash / brow boxes, so the face can be matched to the reference
"""
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.path.join(os.path.dirname(HERE), "astro", "public", "images", "chibi-hero.png")

PX = 1025.0            # pixels per model unit
Z_TOP = 1.800
ROW_TOP = 115.0
COL_C = (571 + 1476) / 2.0

im = Image.open(REF).convert("RGB")
a = np.asarray(im).astype(np.float32) / 255.0
lum = a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114
H, W = lum.shape


def row_of(z):
    return int(round(ROW_TOP + (Z_TOP - z) * PX))


def rz(row):
    return Z_TOP - (row - ROW_TOP) / PX


def cx(col):
    return (col - COL_C) / PX


def col_of(x):
    return int(round(COL_C + x * PX))


print("[hair silhouette] left / right extreme x per z")
for z in [1.795, 1.785, 1.775, 1.760, 1.745, 1.730, 1.715, 1.700, 1.685,
           1.670, 1.655, 1.640, 1.625, 1.610, 1.595, 1.580, 1.565, 1.550,
           1.535, 1.520, 1.505, 1.490, 1.475, 1.460, 1.445, 1.430, 1.415,
           1.400, 1.385, 1.370, 1.355, 1.340, 1.325, 1.310, 1.295, 1.280,
           1.265, 1.250, 1.235, 1.220, 1.205, 1.190, 1.175, 1.160, 1.140,
           1.120, 1.100, 1.080, 1.060, 1.040, 1.020]:
    row = row_of(z)
    if row < 0 or row >= H:
        continue
    cols = np.nonzero(lum[row] < 0.22)[0]
    if len(cols) == 0:
        print(f"  z {z:.3f}   (empty)")
        continue
    print(f"  z {z:.3f}   L {cx(cols.min()):+.3f}   R {cx(cols.max()):+.3f}"
          f"   n {len(cols)}")


print("\n[fringe line] lowest hair pixel above the brows, per x")
r_top = row_of(1.55)
r_brow = row_of(1.30)
for x in np.arange(-0.30, 0.301, 0.02):
    col = col_of(x)
    if col < 0 or col >= W:
        continue
    rows = np.nonzero(lum[r_top:r_brow, col] < 0.22)[0]
    if len(rows) == 0:
        print(f"  x {x:+.2f}   (no hair above the brow)")
        continue
    lowest = r_top + rows.max()
    print(f"  x {x:+.2f}   fringe bottom z {rz(lowest):.3f}"
          f"   top z {rz(r_top + rows.min()):.3f}")


def blob_report(name, mask, xr, zr):
    """Report the connected dark blobs inside a box, biggest first."""
    r0, r1 = row_of(zr[1]), row_of(zr[0])
    c0, c1 = col_of(xr[0]), col_of(xr[1])
    sub = mask[r0:r1, c0:c1]
    lab = np.zeros(sub.shape, dtype=np.int32)
    cur = 0
    blobs = []
    seen = np.zeros(sub.shape, dtype=bool)
    for i in range(sub.shape[0]):
        for j in range(sub.shape[1]):
            if not sub[i, j] or seen[i, j]:
                continue
            cur += 1
            stack = [(i, j)]
            seen[i, j] = True
            pts = []
            while stack:
                y, x = stack.pop()
                pts.append((y, x))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < sub.shape[0] and 0 <= nx < sub.shape[1] \
                            and sub[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            ys = [p[0] for p in pts]
            xs = [p[1] for p in pts]
            blobs.append((len(pts),
                          cx(c0 + min(xs)), cx(c0 + max(xs)),
                          rz(r0 + max(ys)), rz(r0 + min(ys))))
    blobs.sort(reverse=True)
    print(f"\n[{name}] blobs (px, x0, x1, z_lo, z_hi)")
    for b in blobs[:6]:
        print(f"   {b[0]:6d}   x {b[1]:+.3f} .. {b[2]:+.3f}   z {b[3]:.3f} .. {b[4]:.3f}")


dark = lum < 0.22
blob_report("face dark (eyes, lash, brow, nose, mouth)", dark,
            (-0.30, 0.30), (1.02, 1.42))
