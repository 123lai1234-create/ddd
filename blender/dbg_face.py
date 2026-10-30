"""ASCII dump of the reference face region - used to check the pixel<->model
mapping before trusting any measured number.

Run:  python blender/dbg_face.py
"""

import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.path.join(HERE, "..", "astro", "public", "images", "chibi-hero.png")

TOTAL_H = 1.80
TOP = 115
PPU = 1025.0


def main():
    im = Image.open(REF).convert("RGB")
    rgb = np.asarray(im).astype(np.float32)
    H, W = rgb.shape[:2]
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    sat = rgb.max(axis=2) - rgb.min(axis=2)

    def row_of(z):
        return int(round(TOP + (TOTAL_H - z) * PPU))

    print(f"image {W}x{H}  rows {row_of(1.80)}..{row_of(0.0)}")

    # locate the face by scanning for the widest bright (skin) row band
    mid = 1013
    for z in (1.30, 1.25, 1.20, 1.15, 1.10, 1.05, 1.00):
        row = row_of(z)
        s = lum[row]
        xs = np.where((s > 120) & (sat[row] > 20))[0]
        if xs.size:
            print(f"  z {z:.2f} row {row}: bright px {xs.min()}..{xs.max()}")

    print("\nASCII map: rows = z (top of print = high z), cols = x")
    print("     " + "".join("|" if abs(x) < 0.004 else " "
                           for x in np.arange(-0.32, 0.321, 0.008)))
    for z in np.arange(1.32, 0.99, -0.010):
        row = int(row_of(z))
        line = []
        for x in np.arange(-0.32, 0.321, 0.008):
            c = int(round(mid + x * PPU))
            if c < 0 or c >= W:
                line.append(" ")
                continue
            L, S = lum[row, c], sat[row, c]
            R, G, B = r[row, c], g[row, c], b[row, c]
            if L < 90 and S < 70:
                line.append("#")          # dark: hair / iris / lash
            elif L > 195 and S < 26:
                line.append(".")          # white: sclera / shirt
            elif R > G * 1.25 and R > 90:
                line.append("r")          # red: mouth / blush / pants
            elif L < 150 and S < 40:
                line.append("+")          # grey
            else:
                line.append("-")          # skin
        print(f"{z:5.2f} " + "".join(line))


if __name__ == "__main__":
    main()
