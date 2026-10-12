"""Compose the 6 expression portraits into one 3x2 sheet for mascot reference."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

PROJ = Path(r"C:\Users\User\.minimax\sessions\mvs_4523b3f8d78e4a098b3512a12e688cec\workspace\kid-3d-project")

EXPRESSIONS = [
    ("happy",     "HAPPY 開心"),
    ("sad",       "SAD 難過"),
    ("surprised", "SURPRISED 驚訝"),
    ("angry",     "ANGRY 生氣"),
    ("sleepy",    "SLEEPY 想睡"),
    ("curious",   "CURIOUS 好奇"),
]

# 3 columns x 2 rows
COLS, ROWS = 3, 2
TILE = 760
PAD = 24
LABEL_H = 50

imgs = [Image.open(PROJ / f"character_{name}.jpg").convert("RGB") for name, _ in EXPRESSIONS]

def fit(img: Image.Image) -> Image.Image:
    img.thumbnail((TILE, TILE), Image.LANCZOS)
    canvas = Image.new("RGB", (TILE, TILE), (245, 245, 247))
    x = (TILE - img.width) // 2
    y = (TILE - img.height) // 2
    canvas.paste(img, (x, y))
    return canvas

tiles = [fit(im) for im in imgs]

W = TILE * COLS + PAD * (COLS + 1)
H = (TILE + LABEL_H) * ROWS + PAD * (ROWS + 1) + 60  # extra footer
sheet = Image.new("RGB", (W, H), (255, 255, 255))
draw = ImageDraw.Draw(sheet)

try:
    # Microsoft JhengHei for Traditional Chinese (user is zh-TW)
    font = ImageFont.truetype("C:/Windows/Fonts/msjh.ttc", 26, index=0)
    title_font = ImageFont.truetype("C:/Windows/Fonts/msjhbd.ttc", 32, index=0)
    foot_font = ImageFont.truetype("C:/Windows/Fonts/msjh.ttc", 18, index=0)
except Exception as e:
    print(f"[warn] CJK font failed: {e}; falling back to arial")
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 26)
        title_font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 32)
        foot_font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 18)
    except Exception:
        font = ImageFont.load_default()
        title_font = font
        foot_font = font

for i, (tile, (_name, label)) in enumerate(zip(tiles, EXPRESSIONS)):
    r, c = i // COLS, i % COLS
    x = PAD + c * (TILE + PAD)
    y = PAD + r * (TILE + LABEL_H + PAD)
    sheet.paste(tile, (x, y + LABEL_H))
    bbox = draw.textbbox((0, 0), label, font=font)
    tw = bbox[2] - bbox[0]
    draw.text((x + (TILE - tw) // 2, y + 12), label, fill=(40, 40, 40), font=font)

# Footer
footer = "Expression pack for chibi mascot — sourced from AI reference image"
draw.text((PAD + 6, H - 32), footer, fill=(140, 140, 140), font=foot_font)

out = PROJ / "character_expressions_sheet.jpg"
sheet.save(out, "JPEG", quality=88)
print(f"wrote {out}  size={sheet.size}")
