# Asset Budget 與 Page Weight 拆解

## 各 asset 權重

| 檔案 | Size | 載入時機 | Cache strategy |
|---|---|---|---|
| `mascot-sprite.png` | 957 KB | 浮動按鈕初始（page load） | Cache-Control: 1y |
| `mascot-3d-full.glb` | 16.18 MB | `/3d-mascot/` 頁 | Cache-Control: 1y |
| `mascot-3d.glb` | 3.56 MB | 浮動按鈕 3D 升級（hover 後） | Cache-Control: 1y |
| `mascot-3d-tiny.glb` | 3.43 MB | 慢網路 fallback | Cache-Control: 1y |
| `chibi-3d.js` | ~10 KB | 浮動按鈕（preload） | Cache-Control: 1y |
| `model-viewer.min.js` | ~150 KB | `/3d-mascot/` 頁（CDN） | CDN cache |

## 不同頁面的 page weight

### 首頁 `/`（無 mascot 3D）

- HTML: 46 KB
- CSS: ~10 KB
- JS (chatbot, sprite sheet only): ~30 KB
- mascot-sprite.png: 957 KB
- 其他圖標: ~50 KB
- **Total: ~1.1 MB**

### 首頁 `/`（mascot 升級 3D）

- HTML + CSS + JS: ~90 KB
- mascot-sprite.png: 957 KB（升級前已下載）
- mascot-3d.glb: 3.56 MB（升級後 lazy load）
- **Total: ~4.6 MB**

### `/3d-mascot/` 展示頁

- HTML: 46 KB
- mascot-3d-full.glb: 16.18 MB
- model-viewer.min.js: 150 KB（Google CDN cache）
- **Total: ~16.4 MB**（首次載入）

## Sprite 957 KB 是否太大

957 KB PNG 在 4G 行動網路下載時間：

| 網路 | 速度 | 時間 |
|---|---|---|
| 5G | 100 Mbps | 0.08s |
| 4G LTE | 20 Mbps | 0.4s |
| 4G Edge | 5 Mbps | 1.5s |
| 3G | 1 Mbps | 7.7s |
| 2G | 200 Kbps | 38s |

現代裝置 4G 幾乎都 < 1s，可接受。

**WebP 替代**（見 sprite sheet build 細節）→ 400 KB，3G 下載 3.2s。

## 16 MB GLB 太大

`mascot-3d-full.glb` 16.18 MB 是用 719k faces。對 chatbot 浮動按鈕不適合，只給展示頁。

展示頁用 16 MB 還算 OK（用戶主動進來看 3D，本來就預期要等載入）。

**優化路徑**：
- 用 Draco 壓縮 GLB → 16 MB → 4-6 MB
- 用 Meshopt 壓縮 → 6-8 MB
- 降面數到 100k faces → 4 MB

Draco 對卡通風格效果好（mesh 簡單），但解碼要 ~200ms CPU。

## Page weight 監控

開發期用 `web-vitals` 或 Lighthouse 量 LCP / TTI / page weight。

```powershell
# 量首頁
curl.exe -o NUL -w "Size: %{size_download} bytes\nTime: %{time_total}s\n" `
  https://donttalk.vercel.app/
```

## 部署驗證

部署後確認所有 asset 200：

```powershell
$assets = @(
  "img/mascot-sprite.png",
  "models/mascot-3d.glb",
  "models/mascot-3d-tiny.glb",
  "scripts/chibi-3d.js",
  "3d-mascot/"
)
foreach ($a in $assets) {
  $r = Invoke-WebRequest -Uri "https://donttalk.vercel.app/$a" -Method Head
  $size = $r.Headers['Content-Length']
  Write-Host ("{0,-30} → {1} ({2} bytes)" -f $a, $r.StatusCode, $size)
}
```

預期：
- `mascot-sprite.png` → 200, ~957 KB
- `mascot-3d.glb` → 200, ~3.5 MB
- `mascot-3d-tiny.glb` → 200, ~3.4 MB
- `chibi-3d.js` → 200, ~10 KB
- `/3d-mascot/` → 200 HTML

## Cache-Control headers

Vercel 預設對 `/_astro/*` 路徑設 long cache，但 `public/models/` 不在預設路徑。

可以加 `vercel.json` 規則：

```json
{
  "headers": [
    {
      "source": "/(img|models|scripts)/(.+)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ]
}
```

注意：mascot sprite 改版時 browser cache 不會 revalidate，**要 bump path**（`mascot-sprite.png?v=2`）。

## CDN 考量

GLB / sprite 對 Cloudflare / Vercel CDN cache 友善：
- immutable binary
- 跨 user 共享
- 1y cache 適合

但 16 MB GLB 在邊緣節點 cold start 慢。Vercel 對 > 5MB 檔案有限制（要分片或 CDN）。

## 量測工具

```js
// 在 chatbot 內量 page weight
window.addEventListener('load', () => {
  const entries = performance.getEntriesByType('resource');
  const total = entries.reduce((sum, e) => sum + (e.transferSize || 0), 0);
  console.log(`Total page weight: ${(total / 1024 / 1024).toFixed(2)} MB`);
});
```

或在 CI 跑 Lighthouse：

```powershell
npx lighthouse https://donttalk.vercel.app/ --only-categories=performance --output=json --output-path=./lighthouse.json
```

Lighthouse 對 mascot 給分：
- 957 KB sprite → LCP 加 0.5-1s
- 16 MB GLB → 展示頁 LCP 2-3s
- 目標：LCP < 2.5s
