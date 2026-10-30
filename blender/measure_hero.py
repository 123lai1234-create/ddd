"""Measure astro/public/images/chibi-hero.png so the 3D build can copy its
proportions instead of eyeballing them.

The reference PNG has its checkerboard *painted in* (no alpha channel), so the
figure is separated from the background by flood-filling the background from
the image border and taking the complement.

Prints, in the 1.80-tall character units the Blender build uses:
  * the silhouette half width per height
  * the colour of every material region
  * the eye box (iris) measured off the reference
"""

import os

import numpy as np
from PIL import Image, ImageDraw

REF = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   "..", "astro", "public", "images", "chibi-hero.png")

TOTAL_H = 1.80          # the Blender character is 1.80 tall


def figure_mask(rgb):
    """True where the character is (background checkerboard removed)."""
    from scipy import ndimage
    r = rgb[:, :, 0].astype(np.int16)
    g = rgb[:, :, 1].astype(np.int16)
    b = rgb[:, :, 2].astype(np.int16)
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    sat = rgb.max(axis=2).astype(np.int16) - rgb.min(axis=2).astype(np.int16)
    bg_like = (sat < 34) & (lum > 172)
    # the checker squares are separated by anti-aliased seams that are not
    # bg-like, which fragments the backdrop into hundreds of islands.  Close
    # and dilate once so the squares merge back into one backdrop.
    bg_like = ndimage.binary_closing(bg_like, structure=np.ones((5, 5)))
    bg_like = ndimage.binary_dilation(bg_like, structure=np.ones((7, 7)))

    # the backdrop is everything bg-like that touches the image border; the
    # white shirt is bg-like too but it is enclosed by the figure, so it
    # survives.
    lab, n = ndimage.label(bg_like)
    border = set(lab[0, :].tolist()) | set(lab[-1, :].tolist())
    border |= set(lab[:, 0].tolist()) | set(lab[:, -1].tolist())
    border.discard(0)
    background = np.isin(lab, list(border)) if border else np.zeros_like(bg_like)
    return ~background


def blobs(mask, min_px=80):
    """Connected components of a boolean mask -> list of (x0,x1,y0,y1,n)."""
    from scipy import ndimage
    lab, n = ndimage.label(mask)
    out = []
    for i in range(1, n + 1):
        yy, xx = np.where(lab == i)
        if xx.size < min_px:
            continue
        out.append((int(xx.min()), int(xx.max()), int(yy.min()), int(yy.max()),
                    int(xx.size)))
    return out


def main():
    im = Image.open(REF).convert("RGB")
    rgb = np.asarray(im)
    H, W = rgb.shape[:2]
    print(f"[ref] {W}x{H}")

    mask = figure_mask(rgb)
    rows = np.where(mask.any(axis=1))[0]
    cols = np.where(mask.any(axis=0))[0]
    top, bot = int(rows[0]), int(rows[-1])
    print(f"[ref] silhouette rows {top}..{bot}  cols {cols[0]}..{cols[-1]}")

    ppu = (bot - top) / TOTAL_H
    print(f"[ref] px per unit = {ppu:.2f}")

    def z_of(row):
        return TOTAL_H - (row - top) / ppu

    # ---- silhouette half width per height
    print("\n[profile]   z      halfwidth")
    for z in [x / 40.0 for x in range(int(TOTAL_H * 40), 0, -1)]:
        row = int(round(top + (TOTAL_H - z) * ppu))
        if row < 0 or row >= H:
            continue
        xs = np.where(mask[row])[0]
        if xs.size == 0:
            continue
        print(f"            {z:.3f}  {(xs.max()-xs.min())/2.0/ppu:.3f}")

    # ---- region colours
    r = rgb[:, :, 0].astype(np.float32)
    g = rgb[:, :, 1].astype(np.float32)
    b = rgb[:, :, 2].astype(np.float32)
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    sat = rgb.max(axis=2).astype(np.float32) - rgb.min(axis=2).astype(np.float32)

    def sample(name, cond, zlo, zhi):
        sel = mask & cond
        r0 = int(top + (TOTAL_H - zhi) * ppu)
        r1 = int(top + (TOTAL_H - zlo) * ppu)
        sel[:r0, :] = False
        sel[r1:, :] = False
        if sel.sum() < 50:
            print(f"[colour] {name}: not found")
            return
        px = rgb[sel]
        mean = px.mean(axis=0)
        lin = np.round((mean / 255.0) ** 2.2, 3)
        print(f"[colour] {name}: n={int(sel.sum())} srgb={np.round(mean,1)} "
              f"linear={lin}")

    print()
    sample("hair ", (lum < 70) & (sat < 40), 1.30, 1.90)
    sample("shirt", (lum > 200) & (sat < 22), 0.95, 1.30)
    sample("pants", (r > 120) & (r > g * 1.6) & (r > b * 1.6), 0.25, 0.90)
    sample("skin ", (r > 195) & (g > 120) & (g < 215) & (b > 100) & (b < 200)
           & (r > b + 35), 1.02, 1.35)
    sample("shoe ", (lum < 90) & (sat < 45), 0.0, 0.20)

    # ---- head width: the SKIN region only (the silhouette above z 1.2 is
    # hair, not skull).  This is what the skull's half width has to match.
    print("\n[head] skin half width per height")
    skin = mask & (lum > 150) & (lum < 255) & (sat > 18) & (r > g) & (g > b)
    for z in [x / 50.0 for x in range(66, 48, -1)]:
        row = int(round(top + (TOTAL_H - z) * ppu))
        if row < 0 or row >= H:
            continue
        xs = np.where(skin[row])[0]
        if xs.size == 0:
            continue
        # keep only the run that contains the figure's centre
        mid_px = (cols[0] + cols[-1]) / 2.0
        lo = hi = None
        for x in sorted(xs):
            if lo is None and x > mid_px - 40:
                lo = x
            if lo is not None and x > mid_px + 260:
                hi = x
                break
        if lo is None:
            continue
        print(f"            z {z:.2f}  half {(hi or lo) - mid_px:.1f}px "
              f"= {(hi or lo) - mid_px:.3f}u")

    # ---- eyes: dark blobs in the face box
    print("\n[eyes] dark blobs inside the face box")
    r0 = int(top + (TOTAL_H - 1.33) * ppu)
    r1 = int(top + (TOTAL_H - 1.06) * ppu)
    box = np.zeros(mask.shape, dtype=bool)
    box[r0:r1, :] = True
    dark = mask & box & (lum < 90) & (sat < 60)
    mid = (cols[0] + cols[-1]) / 2.0
    for x0, x1, y0, y1, n in blobs(dark, 200):
        if (x0 + x1) / 2.0 > mid + 200:
            continue
        print(f"  blob x {x0}..{x1} w={(x1-x0)/ppu:.3f}u  "
              f"z {z_of(y1):.3f}..{z_of(y0):.3f} h={(y1-y0)/ppu:.3f}u  "
              f"cx={(x0+x1)/2.0/ppu:.3f}u n={n}")

    # ---- white of the eye (bright, low sat, inside the face box)
    bright = mask & box & (lum > 200) & (sat < 22)
    print("\n[eyes] sclera-ish bright blobs in the face box")
    for x0, x1, y0, y1, n in blobs(bright, 120):
        if (x0 + x1) / 2.0 > mid + 200:
            continue
        print(f"  blob x {x0}..{x1} w={(x1-x0)/ppu:.3f}u  "
              f"z {z_of(y1):.3f}..{z_of(y0):.3f} h={(y1-y0)/ppu:.3f}u n={n}")


if __name__ == "__main__":
    main()
