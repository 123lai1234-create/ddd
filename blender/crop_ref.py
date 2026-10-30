"""Crop astro/public/images/chibi-hero.png into zoomed study tiles.

The build script has to copy the reference, not eyeball it, so the parts that
matter (eyes, hair, waist tie) get cut out at 2-3x and inspected directly.

Run:  python blender/crop_ref.py
"""

import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.path.join(HERE, "..", "astro", "public", "images", "chibi-hero.png")
OUT = os.path.join(HERE, "out")

TOTAL_H = 1.80
TOP = 115          # first silhouette row in the reference (see measure_hero.py)
PPU = 1025.0       # pixels per character unit
MID = 1013.0       # column of the character's midline


def row_of(z):
    return int(round(TOP + (TOTAL_H - z) * PPU))


def col_of(x):
    return int(round(MID + x * PPU))


def crop(name, x0, x1, z0, z1, zoom=2):
    im = Image.open(REF).convert("RGB")
    box = (col_of(x0), row_of(z1), col_of(x1), row_of(z0))
    tile = im.crop(box)
    tile = tile.resize((tile.width * zoom, tile.height * zoom), Image.LANCZOS)
    path = os.path.join(OUT, name)
    tile.save(path)
    print(f"[crop] {name}  {box}  -> {tile.size}")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    crop("_ref_face.png", -0.30, 0.30, 0.98, 1.42, zoom=2)
    crop("_ref_eyes.png", -0.28, 0.28, 1.10, 1.32, zoom=3)
    crop("_ref_eyeR.png", -0.02, 0.28, 1.10, 1.32, zoom=5)
    crop("_ref_hair.png", -0.52, 0.52, 1.28, 1.82, zoom=2)
    crop("_ref_waist.png", -0.35, 0.35, 0.52, 0.86, zoom=2)
    crop("_ref_shoes.png", -0.30, 0.30, 0.00, 0.30, zoom=2)
