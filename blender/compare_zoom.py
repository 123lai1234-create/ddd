"""Side-by-side crop of the SAME world rectangle in the reference and the model."""
import os
import sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
PX = 1025.0
Z_TOP = 1.800
ROW_TOP = 115.0
REF = os.path.join(os.path.dirname(HERE), "astro", "public", "images", "chibi-hero.png")
MODEL = os.path.join(HERE, "out", "_ortho_front.png")

x0, x1, z0, z1 = (float(v) for v in sys.argv[1:5])
zoom = float(sys.argv[5]) if len(sys.argv) > 5 else 3.0


def crop(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    mid = (w - 1) / 2.0
    c0 = int(round(mid + x0 * PX)); c1 = int(round(mid + x1 * PX))
    r0 = int(round(ROW_TOP + (Z_TOP - z1) * PX))
    r1 = int(round(ROW_TOP + (Z_TOP - z0) * PX))
    c0 = max(0, c0); r0 = max(0, r0); c1 = min(w, c1); r1 = min(h, r1)
    p = im.crop((c0, r0, c1, r1))
    return p.resize((int(p.width * zoom), int(p.height * zoom)), Image.LANCZOS)


R = crop(REF); O = crop(MODEL)
pad = 12
canvas = Image.new("RGB", (R.width + O.width + pad * 3, max(R.height, O.height) + pad * 2), (255, 255, 255))
canvas.paste(R, (pad, pad)); canvas.paste(O, (R.width + pad * 2, pad))
canvas.save(os.path.join(HERE, "out", "_zoom_pair.png"))
print("zoom_pair", canvas.size)
