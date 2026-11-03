"""Overlay the reference silhouette on the model's and show where they differ.

Red   = reference only (the model is too small there)
Green = model only (the model is too big there)
Yellow= both (matched)

Both images use the same framing: 1025 px per model unit, the hair top at
row 115, the feet at row 1960, x = 0 at the image centre.
"""
import os
import sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from measure_hero import figure_mask          # noqa: E402

OUT = os.path.join(HERE, "out")
REF = os.path.join(os.path.dirname(HERE), "astro", "public", "images", "chibi-hero.png")
PX = 1025.0
Z_TOP = 1.800
ROW_TOP = 115.0


def z_of(row):
    return Z_TOP - (row - ROW_TOP) / PX


def diff(ref_img, model_img, out_name, label):
    rgb = np.asarray(Image.open(ref_img).convert("RGB"))
    ref = figure_mask(rgb)
    alpha = np.asarray(Image.open(model_img).convert("RGBA"))[..., 3]
    mod = alpha > 127
    if mod.shape != ref.shape:
        h = min(ref.shape[0], mod.shape[0])
        w = min(ref.shape[1], mod.shape[1])
        ref = ref[:h, :w]
        mod = mod[:h, :w]

    h, w = ref.shape
    img = np.zeros((h, w, 3), dtype=np.uint8)
    img[..., 0] = np.where(ref & ~mod, 255, 0)          # red   = ref only
    img[..., 1] = np.where(mod & ~ref, 255, 0)          # green = model only
    img[..., 2] = np.where(ref & mod, 255, 0)           # yellow= both
    img[..., 0] = np.where(ref & mod, 90, img[..., 0])
    img[..., 1] = np.where(ref & mod, 90, img[..., 1])
    path = os.path.join(OUT, out_name)
    Image.fromarray(img).save(path)
    print(f"[{label}] -> {path}")

    # numeric deltas per height
    print(f"[{label}]   z      ref L/R        model L/R      delta")
    for z in [x / 40.0 for x in range(int(1.82 * 40), int(0.30 * 40), -2)]:
        r = int(round(ROW_TOP + (Z_TOP - z) * PX))
        if r < 0 or r >= h:
            continue

        def span(m):
            xs = np.nonzero(m[r])[0]
            if xs.size == 0:
                return None
            mid = (w - 1) / 2.0
            return ((xs.min() - mid) / PX, (xs.max() - mid) / PX)

        a = span(ref)
        b = span(mod)
        if a is None and b is None:
            print(f"  z {z:.3f}   (both empty)")
            continue
        if a is None:
            print(f"  z {z:.3f}   ref  none        model "
                  f"{b[0]:+.3f} {b[1]:+.3f}   MODEL ONLY")
            continue
        if b is None:
            print(f"  z {z:.3f}   ref  {a[0]:+.3f} {a[1]:+.3f}   model none"
                  f"          REF ONLY")
            continue
        dl = b[0] - a[0]
        dr = b[1] - a[1]
        flag = "  <<<" if max(abs(dl), abs(dr)) > 0.035 else ""
        print(f"  z {z:.3f}   {a[0]:+.3f} {a[1]:+.3f}    "
              f"{b[0]:+.3f} {b[1]:+.3f}    dL {dl:+.3f} dR {dr:+.3f}{flag}")


diff(REF, os.path.join(OUT, "_sil_all.png"), "_diff_all.png", "FULL BODY")
diff(REF, os.path.join(OUT, "_sil_face.png"), "_diff_face.png", "FACE")
