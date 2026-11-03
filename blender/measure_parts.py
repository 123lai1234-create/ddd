"""Measure the reference figure PART BY PART.

The silhouette compare tells us where the whole figure differs.  This script
tells us WHICH PART is wrong: it classifies every pixel of chibi-hero.png into
skin / tee / hair / shoe / pants / background and prints the left and right
extreme of each class at every height.

That is what turns "it looks different" into a table of targets that
chibi_build.py can be written against.

    python blender/measure_parts.py
"""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from measure_hero import figure_mask  # noqa: E402

REF = r"D:\project\astro\public\images\chibi-hero.png"

# The reference is aligned with the orthographic silhouette camera:
#   1025 px per unit, image centre x = 1024, row 115 == z 1.80
PX = 1025.0
CX = 1024.0
ROW_TOP = 115.0
Z_TOP = 1.800


def classify(rgb):
    """Return a class code per pixel: 1 skin, 2 tee, 3 hair, 4 shoe, 5 pants."""
    r = rgb[..., 0].astype(np.float32) / 255.0
    g = rgb[..., 1].astype(np.float32) / 255.0
    b = rgb[..., 2].astype(np.float32) / 255.0
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    v = mx
    s = np.where(mx > 1e-6, (mx - mn) / np.maximum(mx, 1e-6), 0.0)

    skin = (r > 0.80) & (g > 0.45) & (g < 0.86) & (b > 0.35) & (b < 0.78) & (r > g) & (g >= b)
    tee = (r > 0.86) & (g > 0.86) & (b > 0.86) & (s < 0.06)
    dark = (v < 0.42) & (s < 0.55)
    red = (r > 0.42) & (r > g * 1.45) & (r > b * 1.35) & (g < 0.42)

    out = np.zeros(r.shape, dtype=np.uint8)
    out[skin] = 1
    out[tee] = 2
    out[dark] = 3
    out[red] = 5
    return out


def main():
    im = Image.open(REF).convert("RGB")
    a = np.array(im)
    fig = figure_mask(a)
    cls = classify(a)

    # shoes are the dark stuff below the ankle; hair is the dark stuff above
    ys, xs = np.nonzero(fig)
    z_of_row = Z_TOP - (np.arange(a.shape[0]) - ROW_TOP) / PX
    row_is_shoe = z_of_row < 0.195
    row_is_hair = z_of_row > 0.960
    cls[(cls == 3) & row_is_shoe[None, :]] = 4
    cls[(cls == 3) & row_is_hair[None, :]] = 3
    cls[(cls == 3) & (~row_is_shoe[None, :]) & (~row_is_hair[None, :])] = 0

    names = {0: "-", 1: "skin", 2: "tee", 3: "hair", 4: "shoe", 5: "pants"}
    print("  z      " + "".join("%-30s" % n for n in
                               ("skin  L/R", "tee  L/R", "hair  L/R", "shoe  L/R", "red  L/R")))
    z = 1.78
    while z > 0.005:
        row = int(round(ROW_TOP + (Z_TOP - z) * PX))
        if row < 0 or row >= a.shape[0]:
            z -= 0.02
            continue
        line = "  %.3f  " % z
        for code in (1, 2, 3, 4, 5):
            m = (cls[row] == code) & fig[row]
            idx = np.nonzero(m)[0]
            if len(idx) == 0:
                line += "%-30s" % "-"
                continue
            l = (idx.min() - CX) / PX
            r = (idx.max() - CX) / PX
            line += "%-30s" % ("%+.3f %+.3f" % (l, r))
        print(line)
        z -= 0.02


if __name__ == "__main__":
    main()
