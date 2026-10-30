"""Measure the reference eye pixel-by-pixel.

The eye is the single feature that decides whether the mascot reads as the
reference or as a generic doll, so it is measured instead of eyeballed:
for every image column across one eye the script prints the vertical runs of
white (sclera) and dark (iris / lash) pixels, in character units.

Run:  python blender/measure_eye.py
"""

import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.path.join(HERE, "..", "astro", "public", "images", "chibi-hero.png")

TOTAL_H = 1.80
TOP = 115
PPU = 1025.0
MID = 1013.0


def main():
    im = Image.open(REF).convert("RGB")
    rgb = np.asarray(im).astype(np.float32)
    H, W = rgb.shape[:2]

    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    sat = rgb.max(axis=2) - rgb.min(axis=2)

    def row_of(z):
        return int(round(TOP + (TOTAL_H - z) * PPU))

    def col_of(x):
        return int(round(MID + x * PPU))

    print("[eye] right eye (character's left), column scan")
    print("      x    white z-range        dark z-runs")
    for xu in np.arange(0.060, 0.256, 0.012):
        c = col_of(xu)
        if c < 0 or c >= W:
            continue
        col = slice(row_of(1.34), row_of(1.08))
        wl = col.lum if hasattr(col, "lum") else lum[col, c]
        sl = sat[col, c]
        white = (wl > 195) & (sl < 26)
        dark = (wl < 95) & (sl < 70)

        def runs(mask):
            out = []
            start = None
            for i, v in enumerate(mask):
                if v and start is None:
                    start = i
                elif not v and start is not None:
                    out.append((start, i - 1))
                    start = None
            if start is not None:
                out.append((start, len(mask) - 1))
            return out

        def fmt(rs):
            return " | ".join(f"{TOTAL_H - (row_of(1.34) + s) / PPU:.3f}"
                              f"..{TOTAL_H - (row_of(1.34) + e) / PPU:.3f}"
                              for s, e in rs)

        wr = runs(white)
        dr = runs(dark)
        print(f"  {xu:+.3f}  {fmt(wr):28s}  {fmt(dr)}")


if __name__ == "__main__":
    main()
