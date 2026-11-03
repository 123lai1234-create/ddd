"""Measure the reference iris disc: near-black pixels only, per row."""
import os
import sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
PX = 1025.0
Z_TOP = 1.800
ROW_TOP = 115.0
REF = os.path.join(os.path.dirname(HERE), "astro", "public", "images", "chibi-hero.png")
MODEL = os.path.join(HERE, "out", "_ortho_front.png")


def load(path):
    return np.asarray(Image.open(path).convert("RGB")).astype(np.float32) / 255.0


def scan(img, x0, x1, z0, z1, tag, thr):
    h, w = img.shape[:2]
    mid = (w - 1) / 2.0
    lum = 0.299 * img[..., 0] + 0.587 * img[..., 1] + 0.114 * img[..., 2]
    print(f"--- {tag}  (dark < {thr}) ---")
    for z in np.arange(z1, z0 - 0.0001, -0.008):
        r = int(round(ROW_TOP + (Z_TOP - z) * PX))
        if r < 0 or r >= h:
            continue
        c0 = int(round(mid + x0 * PX)); c1 = int(round(mid + x1 * PX))
        c0 = max(0, c0); c1 = min(w, c1)
        xs = np.nonzero(lum[r, c0:c1] < thr)[0]
        if xs.size == 0:
            print(f"  z {z:.3f}   -")
            continue
        wx0 = (c0 + xs.min() - mid) / PX
        wx1 = (c0 + xs.max() - mid) / PX
        print(f"  z {z:.3f}   x {wx0:+.4f} .. {wx1:+.4f}   w {wx1-wx0:.4f}  n {xs.size}")


ref = load(REF)
mod = load(MODEL)
scan(ref, 0.055, 0.245, 1.12, 1.32, "REF right eye", 0.10)
scan(mod, 0.055, 0.245, 1.12, 1.32, "MODEL right eye", 0.10)
