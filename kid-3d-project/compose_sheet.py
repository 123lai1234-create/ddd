"""Compose 3 reference views into one horizontal sheet."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

PROJ = Path(r"C:\Users\User\.minimax\sessions\mvs_4523b3f8d78e4a098b3512a12e688cec\workspace\kid-3d-project")

front = Image.open(PROJ / "character_front.jpg").convert("RGB")
side = Image.open(PROJ / "character_side.jpg").convert("RGB")
back = Image.open(PROJ / "character_back.jpg").convert("RGB")

# Target tile size
TILE = 900
def fit(img: Image.Image) -> Image.Image:
    img.thumbnail((TILE, TILE), Image.LANCZOS)
    canvas = Image.new("RGB", (TILE, TILE), (245, 245, 247))
    x = (TILE - img.width) // 2
    y = (TILE - img.height) // 2
    canvas.paste(img, (x, y))
    return canvas

front_t = fit(front)
side_t = fit(side)
back_t = fit(back)

PAD = 24
LABEL_H = 56
W = TILE * 3 + PAD * 4
H = TILE + PAD * 2 + LABEL_H
sheet = Image.new("RGB", (W, H), (255, 255, 255))

sheet.paste(front_t, (PAD, PAD + LABEL_H))
sheet.paste(side_t, (PAD * 2 + TILE, PAD + LABEL_H))
sheet.paste(back_t, (PAD * 3 + TILE * 2, PAD + LABEL_H))

draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("C:/Windows/Fonts/msjh.ttc", 28, index=0)
except Exception:
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 28)
    except Exception:
        font = ImageFont.load_default()

for i, name in enumerate(["FRONT (主視圖 + 細節)", "SIDE (右側面)", "BACK (背面)"]):
    x = PAD + i * (TILE + PAD) + TILE // 2
    bbox = draw.textbbox((0, 0), name, font=font)
    tw = bbox[2] - bbox[0]
    draw.text((x - tw // 2, PAD + 14), name, fill=(50, 50, 50), font=font)

# Footer
footer = "Reference sheet for chibi character 3D modeling — sourced from AI reference image"
try:
    ffont = ImageFont.truetype("C:/Windows/Fonts/msjh.ttc", 18, index=0)
except Exception:
    ffont = font
draw.text((PAD + 6, H - 28), footer, fill=(140, 140, 140), font=ffont)

out = PROJ / "character_3view_sheet.jpg"
sheet.save(out, "JPEG", quality=88)
print(f"wrote {out}  size={sheet.size}")