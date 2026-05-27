# 圖片格式優化指南 (WebP/AVIF)

本指南說明如何將現有 PNG/JPG 圖片轉換為現代高效格式。

## 快速轉換腳本

### 使用 Python + Pillow (最簡單)

```bash
pip install pillow pillow-avif-plugin
```

```python
# scripts/convert_images.py
from PIL import Image
import os

def convert_to_webp(src_dir, quality=85):
    """將目錄下所有 PNG/JPG 轉為 WebP"""
    for f in os.listdir(src_dir):
        if f.endswith(('.png', '.jpg', '.jpeg')):
            img = Image.open(os.path.join(src_dir, f))
            # 移除透明背景用 RGBA，否則用 RGB
            if img.mode in ('RGBA', 'LA', 'P'):
                img = img.convert('RGBA')
            else:
                img = img.convert('RGB')

            webp_path = os.path.join(src_dir, f.rsplit('.', 1)[0] + '.webp')
            img.save(webp_path, 'WEBP', quality=quality, method=6)
            print(f'✓ {f} → {os.path.basename(webp_path)}')

convert_to_webp('frontend/outputs')
```

### 使用 cwebp (Google 無損壓縮工具)

```bash
# 安裝
# macOS: brew install webp
# Linux: apt install webp-tools
# Windows: 下載 cwebp.exe

# 基本轉換
cwebp -q 85 input.png -o output.webp

# 批量轉換
for f in *.png; do cwebp -q 85 "$f" -o "${f%.png}.webp"; done
```

### 使用 FFmpeg (支援 AVIF)

```bash
# PNG → WebP
ffmpeg -i input.png -c:v libwebp -quality 85 output.webp

# PNG → AVIF (更高壓縮率)
ffmpeg -i input.png -c:v libaom-av1 -crf 30 -avif output.avif

# JPG → AVIF
ffmpeg -i input.jpg -c:v libaom-av1 -crf 35 -avif output.avif
```

## HTML 使用方式

### 現代響應式圖片

```html
<picture>
  <!-- AVIF (最佳壓縮, Safari 16+)
  <source 
    srcset="outputs/result.avif" 
    type="image/avif">
  
  <!-- WebP (良好支援) -->
  <source srcset="outputs/result.webp" type="image/webp" />

  <!-- 原圖 (降級方案) -->
  <img
    src="outputs/result.png"
    alt="描述文字"
    loading="lazy"
    decoding="async"
    width="800"
    height="600"
  />
</picture>
```

### 簡化版 (現代瀏覽器)

```html
<img
  src="outputs/result.webp"
  alt="描述文字"
  loading="lazy"
  decoding="async"
  width="800"
  height="600"
/>
```

## 壓縮率對比範例

| 格式 | 原始 2MB PNG | 壓縮率    |
| ---- | ------------ | --------- |
| PNG  | 2.0 MB       | 原始      |
| WebP | ~300 KB      | ~85% 減少 |
| AVIF | ~200 KB      | ~90% 減少 |

## 建議工作流

1. **原始檔案保留** - 保留 PSD/AI 原始檔
2. **自動轉換** - 部署時用 CI/CD 自動轉換
3. **漸進增強** - 用 `<picture>` 提供多格式支援

## 預覽檢查清單

- [ ] 視覺品質與原始圖片相近
- [ ] 在 Safari、Chrome、Firefox 測試
- [ ] 驗證 lazy loading 正常運作
- [ ] 確認無 CLS (版面位移)
