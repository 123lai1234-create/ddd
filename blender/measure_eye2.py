"""Print an ASCII map of the reference eye so the numbers are not guesses.

The reference chibi has a huge dark iris and only a sliver of white
sclera, so the old column scan (which only reported 'white' pixels) was
ambiguous.  This prints every pixel of the eye box as a character:
    '#' near-black (iris / lash)
    '+' mid tone (iris rim / soft shadow)
    'o' bright white (sclera or specular highlight)
    '.' skin
"""
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.path.join(os.path.dirname(HERE), "astro", "public", "images", "chibi-hero.png")

PX_PER_UNIT = 1025.0
Z_TOP = 1.800
ROW_TOP = 115.0          # silhouette top row <-> z 1.800
COL_CENTER = (571 + 1476) / 2.0   # horizontal centre of the silhouette


def row_to_z(row):
    return Z_TOP - (row - ROW_TOP) / PX_PER_UNIT


def col_to_x(col):
    return (col - COL_CENTER) / PX_PER_UNIT


im = Image.open(REF).convert("RGB")
a = np.asarray(im).astype(np.float32) / 255.0
lum = a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114
H, W = lum.shape


def box(x0, x1, z0, z1):
    c0 = int(round(COL_CENTER + x0 * PX_PER_UNIT))
    c1 = int(round(COL_CENTER + x1 * PX_PER_UNIT))
    r0 = int(round(ROW_TOP + (Z_TOP - z1) * PX_PER_UNIT))
    r1 = int(round(ROW_TOP + (Z_TOP - z0) * PX_PER_UNIT))
    return max(0, r0), min(H, r1), max(0, c0), min(W, c1)


def dump(tag, x0, x1, z0, z1, step=6):
    r0, r1, c0, c1 = box(x0, x1, z0, z1)
    print(f"\n=== {tag}  x[{x0},{x1}] z[{z0},{z1}]  rows {r0}..{r1} cols {c0}..{c1}")
    hdr = "     " + "".join(
        f"{col_to_x(c):+6.2f}" if c % step == 0 else "      " for c in range(c0, c1)
    )
    print(hdr)
    for r in range(r0, r1, 5):
        line = ""
        for c in range(c0, c1):
            v = lum[r, c]
            if v < 0.14:
                line += "#"
            elif v < 0.34:
                line += "+"
            elif v < 0.62:
                line += "-"
            elif v < 0.86:
                line += "o"
            else:
                line += "O"
        print(f"{row_to_z(r):6.3f} {line}")


# the whole eye band, both eyes
dump("EYE BAND", -0.30, 0.30, 1.02, 1.34, step=10)

# the ear column on the right
dump("RIGHT SIDE", 0.24, 0.46, 1.12, 1.40, step=10)

# the hairline / forehead boundary
dump("FOREHEAD", -0.24, 0.24, 1.26, 1.50, step=10)
