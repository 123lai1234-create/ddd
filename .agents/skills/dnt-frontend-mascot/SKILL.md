---
name: dnt-frontend-mascot
description: "D:\\project chatbot 浮動 mascot 系統 — sprite sheet 動畫 + 3D model-viewer 兩條路徑 + mood 對應。當用戶說「chatbot 頭像」「mascot」「chibi」「浮動按鈕」「sprite sheet」「mood」「kawaii」「6 frame」「model-viewer」時使用。涵蓋 360×2160 6-frame vertical sprite sheet（happy/sad/surprised/angry/sleepy/curious 6 個 mood 對應）、background-position-y 切換、3 view 設計 sheet crop 邏輯、Three.js chibi-3d.js 整合、model-viewer + Three.js 共存警告、mood 觸發時序（idle blink / drag / busy）、build asset 權重、kawaii-sprite CSS 結構。應用：D:\\project astro/src/components/Chatbot.astro 浮動按鈕 + 角色 /\\/3d-mascot/ 展示頁。"
license: MIT
metadata:
  author: donttalk-deploy
  version: "1.0.0"
  tags:
    - mascot
    - chibi
    - sprite
    - model-viewer
    - three.js
    - chatbot
    - mood
    - animation
    - kawaii
---

# D:\project Frontend Mascot（chibi sprite + 3D 整合）

> 浮動 chatbot avatar 從單張圖進化到 **6-frame vertical sprite sheet**（957 KB），加上 3D GLB model-viewer fallback。完整 mood 對應 + 3 個 3D camera state。

## 兩條主要路徑

| 路徑 | 場景 | 技術 |
|---|---|---|
| **A. 6-frame sprite sheet** | 浮動按鈕（高效能，957 KB 一次載入） | CSS `background-position-y` |
| **B. 3D model-viewer** | `/3d-mascot/` 展示頁 / 大尺寸 avatar | `<model-viewer>` + GLB |
| **C. chibi-3d.js（procedural）** | 完全程式化、無 GLB | Three.js + scene graph |

> 目前 commit `d18de4b5`（2026-10-13）採 A 路徑（sprite sheet）。3D 路徑作為升級路徑（commit d80f4f71，2026-10-13 部署 `htp74txyu`）。

## Path A — 6-Frame Sprite Sheet

### Layout

`public/img/mascot-sprite.png` 是 **360×2160**（957 KB），6 個 frame 垂直疊：

| y px | mood | 觸發 |
|---|---|---|
| 0 | happy | 預設 idle / hover / 完成回覆 |
| -360 | sad | 關 panel（500ms 後回 happy） |
| -720 | surprised | 開 panel（700ms 後回 happy）/ reset 對話 |
| -1080 | angry | drag start（600ms 後回 happy） |
| -1440 | sleepy | idle blink（每 6-10s 隨機，600ms 後回 happy） |
| -1800 | curious | busy / 等 API 回覆 |

### CSS

```css
.kawaii-sprite {
  background-image: url('/img/mascot-sprite.png');
  background-size: 100% auto;     /* 維持寬度 360，高自動算 */
  background-position: 0 0;
  transition: background-position 0.25s ease;
  border-radius: 50%;
  animation: float 3.2s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
```

### JS 切換 mood

```js
const MOOD_Y = { 
  happy: 0, sad: -360, surprised: -720, 
  angry: -1080, sleepy: -1440, curious: -1800 
};
const sprite = document.querySelector('.kawaii-sprite');

function setMood(name, autoMs = 0) {
  sprite.style.backgroundPosition = `0px ${MOOD_Y[name]}px`;
  if (autoMs > 0) setTimeout(() => setMood('happy'), autoMs);
}
```

### 觸發時機

```js
// open panel
setMood('surprised', 700);

// close panel
setMood('sad', 500);

// user 拖浮動按鈕
setMood('angry', 600);

// 等 API 回覆
setMood('curious', 0);  // 持續到 done

// 完成回覆
setMood('happy', 0);

// idle blink（每 6-10s）
setInterval(() => {
  if (currentMood === 'happy') setMood('sleepy', 600);
}, 6000 + Math.random() * 4000);
```

## 6 個 frame crop 來源

6 個 360×360 PNG 來自兩個不同 source：

| Frame | Source | Crop |
|---|---|---|
| `character_sad.jpg` | AI 獨立 portrait | `crop((410,410,1638,1638))` 中心 60% |
| `character_surprised.jpg` | AI 獨立 portrait | `crop((410,410,1638,1638))` 中心 60% |
| `character_happy.jpg` | AI character design sheet | `crop((1495,1370,1925,1795))` 右下 EXPRESSION inset |
| `character_angry.jpg` | character design sheet | `crop((1495,1370,1925,1795))` |
| `character_sleepy.jpg` | character design sheet | `crop((1495,1370,1925,1795))` |
| `character_curious.jpg` | character design sheet | `crop((1495,1370,1925,1795))` |

character design sheet 是「3 view + callouts」結構 — 三視圖（front / side / back）跟 expression callouts 分區塊。EXPRESSION inset 通常在右下或左下 430×425 像素，純臉部表情。

合併 sprite sheet 用 PIL：

```python
from PIL import Image
imgs = [Image.open(f'character_{m}.jpg') for m in ['happy','sad','surprised','angry','sleepy','curious']]
sheet = Image.new('RGB', (360, 360*6), (0,0,0))
for i, im in enumerate(imgs):
    sheet.paste(im.resize((360, 360)), (0, i*360))
sheet.save('public/img/mascot-sprite.png')
```

## Path B — 3D model-viewer

`/3d-mascot/` 頁用 `<model-viewer>` 載 `mascot-3d-full.glb`（16.18 MB，719k faces）：

```astro
<model-viewer src="/models/mascot-3d-full.glb"
              alt="3D mascot"
              auto-rotate
              camera-controls
              shadow-intensity="1"
              style="width: 100%; height: 500px;">
</model-viewer>
<script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>
```

優點：camera-controls / auto-rotate / AR / shadow 內建。
缺點：model-viewer 額外 ~150 KB JS。

## Path C — Three.js Procedural chibi-3d.js

`public/scripts/chibi-3d.js` 程式化建 chibi（不用 GLB）：

```js
import * as THREE from 'three';

const scene = new THREE.Scene();
// ... sphere 頭 + hemisphere 瀏海 + capsule 身體

// 3-light
scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const key = new THREE.DirectionalLight(0xfff4e0, 0.95); key.position.set(2,3,3);
const fill = new THREE.DirectionalLight(0xa0c0ff, 0.35); fill.position.set(-2,1,2);
const rim = new THREE.DirectionalLight(0xffd0a0, 0.25); rim.position.set(0,2,-3);

// Public API
window.Chibi3D = {
  mount(canvasId, {size}) { ... },
  setView(name) { ... },  // 'front' | 'side' | 'back'
};
```

### Camera state

| View | Position | LookAt |
|---|---|---|
| front | (0, 0.45, 3.4) | (0, 0.35, 0) |
| side | (3.4, 0.45, 0) | (0, 0.35, 0) |
| back | (0, 0.45, -3.4) | (0, 0.35, 0) |

### 平滑過渡

```js
currentPos += (targetPos - currentPos) * (1 - Math.exp(-dt/0.18));
```

`0.18` 是時間常數。

### Importmap 整合

```html
<script type="importmap">
{ "imports": { 
  "three": "https://esm.sh/three@0.160.0",
  "three/addons/": "https://esm.sh/three@0.160.0/examples/jsm/" 
} }
</script>
```

## Path A + C 整合（fallback 策略）

Chatbot.astro 浮動按鈕：

```astro
<canvas id="mascot-canvas" width="80" height="80" style="display:none"></canvas>
<div class="kawaii-sprite" id="mascot-sprite"></div>

<script type="importmap">
{ "imports": { "three": "https://esm.sh/three@0.160.0" } }
</script>
<script type="module">
import '/scripts/chibi-3d.js';

// 嘗試升級到 3D（不支援就 fallback sprite）
if (window.WebGL2RenderingContext) {
  try {
    document.querySelector('#mascot-canvas').style.display = 'block';
    document.querySelector('#mascot-sprite').style.display = 'none';
    Chibi3D.mount('mascot-canvas', { size: 80 });
  } catch (e) {
    console.warn('chibi-3d fallback to sprite', e);
  }
}

function setMood(name, autoMs = 0) {
  if (Chibi3D.setMood) {
    Chibi3D.setMood(name, autoMs);  // 3D 視角切換
  } else {
    const MOOD_Y = { /* ... */ };
    document.querySelector('#mascot-sprite').style.backgroundPosition = `0px ${MOOD_Y[name]}px`;
  }
  if (autoMs > 0) setTimeout(() => setMood('happy'), autoMs);
}
</script>
```

## model-viewer + Three.js 多實例警告

同頁用 model-viewer (Google CDN) + chibi-3d.js (esm.sh) 載 three.js 會跳：

```
WARNING: Multiple instances of Three.js being imported
```

**無害**，只是 warning 不影響 rendering。

想消掉：把兩個 import 整成一個 source（兩處都用 esm.sh 或都用 unpkg）。

## Build asset 權重

| 檔案 | Size | 用途 |
|---|---|---|
| `mascot-sprite.png` | 957 KB | 6 frame sprite |
| `mascot-3d-full.glb` | 16.18 MB | `/3d-mascot/` 展示 |
| `mascot-3d.glb` | 3.56 MB | chatbot 浮動按鈕（3D） |
| `mascot-3d-tiny.glb` | 3.43 MB | 慢網路 fallback |
| `chibi-3d.js` | ~10 KB | procedural Three.js |
| `model-viewer.min.js` | ~150 KB | Google CDN（CDN cache） |

總計 ~21 MB（最大公頭是 mascot-3d-full.glb）。HTML 從 55KB 降到 46KB 因為 asset cache 拆出去。

## 部署驗證

```powershell
$paths = @("img/mascot-sprite.png","models/mascot-3d.glb","models/mascot-3d-tiny.glb","scripts/chibi-3d.js")
foreach ($p in $paths) {
  $code = (Invoke-WebRequest -Uri "https://donttalk.vercel.app/$p" -Method Head).StatusCode
  if ($code -ne 200) { Write-Warning "$p → $code" }
}
```

預期全部 200。

## References

- [`01-sprite-sheet-build.md`](references/01-sprite-sheet-build.md) — 6 個 frame crop 細節、PIL 合併、character design sheet 結構
- [`02-mood-mapping.md`](references/02-mood-mapping.md) — 6 mood 觸發時序、idle blink 隨機化、autoMs 規則
- [`03-3d-fallback-strategy.md`](references/03-3d-fallback-strategy.md) — model-viewer / chibi-3d.js / sprite 三層 fallback、WebGL2 detection
- [`04-asset-budget.md`](references/04-asset-budget.md) — 957 KB sprite 權重、16 MB GLB 優化、page weight 拆解
