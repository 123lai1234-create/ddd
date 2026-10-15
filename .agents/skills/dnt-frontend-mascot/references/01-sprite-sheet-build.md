# Sprite Sheet Build（6 frame crop 細節）

## 6 個 frame 來源

兩個 source 模式：

### Source A — AI 獨立 portrait

AI 圖像生成給的 2048×2048 單張圖，角色佔中間 80% 區域。

例：
- `character_sad.jpg` — 2048×2048，sad 表情大頭
- `character_surprised.jpg` — 2048×2048，surprised 表情大頭

Crop 邏輯：**中心 60%**（1228×1228 from 2048）：

```python
from PIL import Image
img = Image.open('character_sad.jpg')  # 2048×2048
W, H = img.size
# 中心 60%
margin = int(W * 0.2)  # 410
crop = img.crop((margin, margin, W - margin, H - margin))  # 1228×1228
# 縮到 360×360
crop = crop.resize((360, 360), Image.LANCZOS)
crop.save('frame_sad.jpg')
```

### Source B — AI character design sheet（3 view + callouts）

AI 給的 4096×4096 design sheet，**分區塊**：

```
┌──────────────────────────────────────┐
│ FRONT VIEW (1500×1500)  SIDE VIEW    │
│                        (1500×1500)   │
│                                       │
│                                       │
│ BACK VIEW (1500×1500)  EXPRESSION    │
│                       (430×425)      │
│                                       │
│                              CALLOUTS │
└──────────────────────────────────────┘
```

EXPRESSION inset 在右下 430×425 像素，純臉部表情。

Crop 邏輯：

```python
# expression inset 在右下
# 約 (1495, 1370) 到 (1925, 1795) from 4096×4096
img = Image.open('character_sheet.jpg')  # 4096×4096
crop = img.crop((1495, 1370, 1925, 1795))  # 430×425
# 縮到 360×360
crop = crop.resize((360, 360), Image.LANCZOS)
crop.save('frame_happy.jpg')
```

**關鍵**：
- 同一 sheet 給 happy / angry / sleepy / curious 四個 frame
- crop 座標在 (1495, 1370) 附近（不同 sheet 微調 ±20px）

## PIL 合併 sprite sheet

```python
from PIL import Image

moods = ['happy', 'sad', 'surprised', 'angry', 'sleepy', 'curious']
frames = []

for mood in moods:
    if mood in ('sad', 'surprised'):
        # Source A: 2048×2048 中心 60%
        img = Image.open(f'character_{mood}.jpg')
        W, H = img.size
        margin = int(W * 0.2)
        crop = img.crop((margin, margin, W - margin, H - margin))
    else:
        # Source B: 4096×4096 design sheet 右下 expression inset
        img = Image.open('character_sheet.jpg')
        crop = img.crop((1495, 1370, 1925, 1795))
    
    crop = crop.resize((360, 360), Image.LANCZOS)
    frames.append(crop)

# 垂直疊成 360×2160
sheet = Image.new('RGB', (360, 360 * 6), (0, 0, 0))
for i, frame in enumerate(frames):
    sheet.paste(frame, (0, i * 360))

sheet.save('public/img/mascot-sprite.png', optimize=True)
print(f'✅ sprite sheet: {sheet.size} → {Path("public/img/mascot-sprite.png").stat().st_size} bytes')
```

## 為什麼 360×360

- **360px 寬**：mobile 浮動按鈕 80px @ 2x retina = 160px，source 360px 有 downscaling 餘裕
- **360px 高**：每個 frame 剛好等寬，垂直疊 6 個 = 2160px 高
- **總 size 957 KB**：PNG 8-bit RGB，3 channels × 360 × 2160 = 2.3 MB uncompressed → PNG 壓到 957 KB（~60% 壓縮）

## PNG 優化

```powershell
# 用 oxipng 進一步壓
oxipng -o 6 public/img/mascot-sprite.png
# 957 KB → 600-700 KB

# 或用 PIL save optimize=True
sheet.save('public/img/mascot-sprite.png', optimize=True)
```

## Crop 座標微調

不同 AI 生成的 design sheet 表情位置略不同。建議先看圖再決定 crop box：

```python
# 找 expression inset 的啟發式：右下 1/4 區域找顏色變化大的方塊
import numpy as np
img = np.array(Image.open('character_sheet.jpg').convert('RGB'))
H, W = img.shape[:2]
# 右下 1/4
roi = img[H//2:, W//2:]
# 計算 gradient
gx = np.abs(np.diff(roi, axis=1)).sum()
gy = np.abs(np.diff(roi, axis=0)).sum()
# 高 gradient 區 = expression 邊界
```

實務上 **直接手動看圖決定** 比較快。

## Sprite sheet 驗證

```python
# 確認每個 frame 內容不同（不是空白 / 重複）
import hashlib
for i in range(6):
    y0 = i * 360
    y1 = y0 + 360
    frame = sheet.crop((0, y0, 360, y1))
    h = hashlib.md5(frame.tobytes()).hexdigest()[:8]
    print(f'frame {i}: hash {h}')

# 預期 6 個不同 hash
```

## 替換單一 frame

不想整個 sheet 重 build？只改某個 frame：

```python
# 讀現有 sheet
sheet = Image.open('public/img/mascot-sprite.png')
# 替換第 0 個 frame（happy）
new_happy = Image.open('new_happy.jpg').resize((360, 360))
sheet.paste(new_happy, (0, 0))
sheet.save('public/img/mascot-sprite.png', optimize=True)
```

## WebP / AVIF 替代

PNG 957 KB 可以再壓：

| 格式 | Size | 瀏覽器支援 |
|---|---|---|
| PNG | 957 KB | 100% |
| WebP | ~400 KB | 97% |
| AVIF | ~250 KB | 92% |

要再省 50%+ 用 WebP，但 Safari < 14 不支援（用 `<picture>` fallback）。

```html
<picture>
  <source srcset="/img/mascot-sprite.avif" type="image/avif">
  <source srcset="/img/mascot-sprite.webp" type="image/webp">
  <img src="/img/mascot-sprite.png" alt="mascot" class="kawaii-sprite">
</picture>
```

但 `background-image` 不能用 `<picture>` 切 — 改用：

```css
@supports (background: url('test.avif')) {
  .kawaii-sprite { background-image: url('/img/mascot-sprite.avif'); }
}
@supports not (background: url('test.avif')) {
  @supports (background: url('test.webp')) {
    .kawaii-sprite { background-image: url('/img/mascot-sprite.webp'); }
  }
}
```

複雜度提升，除非真的需要省帶寬，PNG 957 KB 可接受。
