"""Compare the reference eye with the model eye, in world coordinates.

Both images share the same framing (PX px per unit, x=0 at the centre), so
the same world rectangle can be sampled on either.
"""
import os
import sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

PX = 1025.0
Z_TOP = 1.800
ROW_TOP = 115.0

REF = os.path.join(os.path.dirname(HERE), "astro", "public", "images", "chibi-hero.png")
MODEL = os.path.join(HERE, "out", "_ortho_front.png")


def load(path):
    im = Image.open(path).convert("RGB")
    return np.asarray(im).astype(np.float32) / 255.0


def sample(img, x0, x1, z0, z1):
    """Crop a world rectangle and return it as (mask array, x edges, z edges)."""
    h, w = img.shape[:2]
    mid = (w - 1) / 2.0
    c0 = int(round(mid + x0 * PX)); c1 = int(round(mid + x1 * PX))
    r0 = int(round(ROW_TOP + (Z_TOP - z1) * PX))
    r1 = int(round(ROW_TOP + (Z_TOP - z0) * PX))
    c0 = max(0, c0); r0 = max(0, r0); c1 = min(w, c1); r1 = min(h, r1)
    patch = img[r0:r1, c0:c1]
    xs = (np.arange(c0, c1) - mid) / PX
    zs = Z_TOP - (np.arange(r0, r1) - ROW_TOP) / PX
    return patch, xs, zs


def classify(patch):
    r, g, b = patch[..., 0], patch[..., 1], patch[..., 2]
    mx = patch.max(axis=-1); mn = patch.min(axis=-1)
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    sat = mx - mn
    dark = (lum < 0.22) & (sat < 0.30)
    white = (lum > 0.72) & (sat < 0.16)
    return dark, white


def bbox(mask, xs, zs):
    idx = np.nonzero(mask)
    if idx[0].size == 0:
        return None
    return (xs[idx[1].min()], xs[idx[1].max()], zs[idx[0].min()], zs[idx[0].max()],
            int(idx[0].size))


def report(tag, img, x0, x1):
    patch, xs, zs = sample(img, x0, x1, 1.12, 1.32)
    dark, white = classify(patch)
    bd = bbox(dark, xs, zs)
    bw = bbox(white, xs, zs)
    print(f"[{tag}] eye window x {x0:+.3f}..{x1:+.3f}  z 1.12..1.32")
    if bd:
        print(f"   dark  x {bd[0]:+.3f}..{bd[1]:+.3f}  z {bd[3]:+.3f}..{bd[2]:+.3f}"
              f"  w {bd[1]-bd[0]:.3f} h {bd[3]-bd[2]:.3f}  px {bd[4]}")
    else:
        print("   dark  none")
    if bw:
        print(f"   white x {bw[0]:+.3f}..{bw[1]:+.3f}  z {bw[3]:+.3f}..{bw[2]:+.3f}"
              f"  w {bw[1]-bw[0]:.3f} h {bw[3]-bw[2]:.3f}  px {bw[4]}")
    else:
        print("   white none")


ref = load(REF)
mod = load(MODEL)
for tag, img in (("REF ", ref), ("MODEL", mod)):
    report(tag, img, 0.060, 0.245)     # screen-right eye
    report(tag, img, -0.245, -0.060)   # screen-left eye
