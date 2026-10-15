# 3D / Sprite Fallback 策略

## 三層 fallback

```html
<canvas id="mascot-canvas-3d" style="display:none"></canvas>
<model-viewer id="mascot-viewer" style="display:none" src="/models/mascot-3d.glb"></model-viewer>
<div id="mascot-sprite" class="kawaii-sprite"></div>
```

```js
async function initMascot() {
  // Level 1: 3D model-viewer
  if (await hasWebGL2() && !isMobileSlow()) {
    try {
      await loadModelViewer();
      showElement('mascot-viewer');
      return 'model-viewer';
    } catch (e) { console.warn('model-viewer fail', e); }
  }
  
  // Level 2: Three.js procedural
  if (await hasWebGL2()) {
    try {
      await loadThreeChibi();
      showElement('mascot-canvas-3d');
      return 'three-chibi';
    } catch (e) { console.warn('three chibi fail', e); }
  }
  
  // Level 3: sprite sheet
  showElement('mascot-sprite');
  return 'sprite';
}
```

## WebGL2 偵測

```js
function hasWebGL2() {
  try {
    const canvas = document.createElement('canvas');
    return !!canvas.getContext('webgl2');
  } catch (e) {
    return false;
  }
}
```

WebGL1 也能跑 Three.js 但功能少（無 instanced rendering）。預設偵測 WebGL2。

## Mobile 慢裝置偵測

```js
function isMobileSlow() {
  // 啟發式：navigator.hardwareConcurrency < 4 或 deviceMemory < 4GB
  if (navigator.deviceMemory && navigator.deviceMemory < 4) return true;
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) return true;
  
  // User-Agent 啟發式（不準，僅最後手段）
  const ua = navigator.userAgent;
  if (/Android [1-7]\./.test(ua)) return true;  // 舊 Android
  
  return false;
}
```

`navigator.deviceMemory` 是 GB 為單位的近似 RAM（不是 VRAM）。`navigator.hardwareConcurrency` 是 CPU 邏輯核心數。

## Sprite sheet 永遠是最終 fallback

3D 載入失敗（GLB 解碼錯 / WebGL 沒支援）→ 退回 sprite sheet。

sprite sheet 957 KB 一次下載，所有裝置都能跑，無外部依賴。

## 載入時機

```js
// 延遲載入：等到浮動按鈕 hover / 第一次開 panel 才升級到 3D
let mascot = null;

async function maybeUpgradeMascot() {
  if (mascot && mascot !== 'sprite') return;  // 已升級
  
  // 首次 hover
  sprite.addEventListener('mouseenter', upgradeMascot, { once: true });
}

async function upgradeMascot() {
  if (mascot === 'model-viewer' || mascot === 'three-chibi') return;
  
  // 嘗試升級
  const level = await initMascot();
  mascot = level;
  console.log(`Mascot upgraded to: ${level}`);
}
```

效益：第一次載入不會因 16 MB GLB 慢，user 互動後才升級。

## importmap 設定

`/3d-mascot/` 頁用 importmap：

```html
<script type="importmap">
{
  "imports": {
    "three": "https://esm.sh/three@0.160.0",
    "three/addons/": "https://esm.sh/three@0.160.0/examples/jsm/"
  }
}
</script>
```

**注意**：`three@0.160.0` 是固定版本（不要用 `three@latest`，會 break）。

## model-viewer + Three.js 共存警告

同頁用 model-viewer (Google CDN) + chibi-3d.js (esm.sh) 載 three.js 會跳：

```
WARNING: Multiple instances of Three.js being imported
```

**無害**，只是 warning 不影響 rendering。

想消掉：把兩個 import 整成一個 source：

```html
<!-- 全部用 esm.sh -->
<script type="importmap">
{ "imports": { "three": "https://esm.sh/three@0.160.0" } }
</script>
<!-- 不用 unpkg / Google CDN 的 model-viewer，改用 esm.sh 版本 -->
<script type="module">
  import '@google/model-viewer';  // 但這是另一個 package，不衝突
</script>
```

model-viewer 內部用 three.js 但 bundled，理論上不衝突外部 import。實際上 model-viewer 的 three 是 namespace 內的，不會跟外部衝突。但 chibi-3d.js 用的 three 是另一份 — 兩個都 alive 就會 warning。

## WebGL2 context loss

```js
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  console.warn('WebGL context lost, falling back to sprite');
  showElement('mascot-sprite');
  hideElement('mascot-canvas-3d');
});
```

context loss（GPU 切換、driver crash）時退回 sprite。

## Build asset 驗證

部署前確認 3 個 asset 都在：

```powershell
Test-Path "D:\project\astro\public\models\mascot-3d.glb"   # 3.56 MB
Test-Path "D:\project\astro\public\models\mascot-3d-tiny.glb"  # 3.43 MB
Test-Path "D:\project\astro\public\img\mascot-sprite.png"  # 957 KB
```

部署後確認 Vercel serve：

```powershell
foreach ($p in @("models/mascot-3d.glb", "models/mascot-3d-tiny.glb", "img/mascot-sprite.png")) {
  $h = Invoke-WebRequest -Uri "https://donttalk.vercel.app/$p" -Method Head
  Write-Host "$p → $($h.StatusCode) ($($h.Headers['Content-Length']) bytes)"
}
```

預期全部 200 + 合理 size。

## 用戶偏好記憶

有些 user 不喜歡浮動 3D 動畫（耗電、會動）。可加 toggle：

```js
localStorage.setItem('mascot-3d-enabled', '0');
// 設 0 → 永遠用 sprite，不升級 3D
```

UI：

```html
<label>
  <input type="checkbox" id="mascot-3d-toggle" checked>
  啟用 3D mascot
</label>
```

checkbox 變更時 `localStorage.mascot-3d-enabled = checked ? '1' : '0'`。
