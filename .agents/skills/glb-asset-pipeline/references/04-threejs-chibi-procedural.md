# Three.js Chibi Procedural（mc320 替代方案）

## 為什麼 procedural

**經驗法則**：mc320 / Hunyuan3D / TripoSR 對 **2D chibi 卡通風格**永遠出石頭或變形（AI 訓練集沒大量 chibi 3D，reconstruction 出來是寫實 3D 套到 2D silhouette）。

對 chibi 角色，**走程式化建模型**比 AI 重建快又可控。

## chibi-3d.js 結構

`astro/public/scripts/chibi-3d.js` 暴露：

```js
window.Chibi3D = {
  mount(canvasId, {size}) { ... },
  setView(name) { ... },  // 'front' | 'side' | 'back'
};
```

### 組成

- **頭**：大 sphere (大頭比例 1.3-1.5x 正常)
- **瀏海**：hemisphere 蓋頭上半
- **身體**：capsule（小身體 0.4x 頭大）
- **眼睛**：兩個大 sphere
- **其他**：依角色定（耳朵、尾巴、配件）

### 3-light 照明

```js
scene.add(new THREE.AmbientLight(0xffffff, 0.55));  // 環境光
const key = new THREE.DirectionalLight(0xfff4e0, 0.95);  // 主光 暖色
key.position.set(2, 3, 3);
const fill = new THREE.DirectionalLight(0xa0c0ff, 0.35);  // 反差 冷色
fill.position.set(-2, 1, 2);
const rim = new THREE.DirectionalLight(0xffd0a0, 0.25);  // 邊光
rim.position.set(0, 2, -3);
```

3 個 directional light + ambient 給出 soft 卡通感，不會像 single light 一邊黑。

### Camera state

```js
const VIEWS = {
  front: { pos: [0, 0.45, 3.4], look: [0, 0.35, 0] },
  side:  { pos: [3.4, 0.45, 0], look: [0, 0.35, 0] },
  back:  { pos: [0, 0.45, -3.4], look: [0, 0.35, 0] },
};
```

平滑過渡：

```js
currentPos += (targetPos - currentPos) * (1 - Math.exp(-dt/0.18));
```

`0.18` 是時間常數，越小越快。

## 匯出 GLB（給其他頁用）

`/scripts/export-mascot-glb.mjs`：

```js
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { readFileSync, writeFileSync } from 'node:fs';

// FileReader polyfill (Node 沒內建)
class FileReaderPolyfill {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(b => { this.result = b; this.onloadend?.(); });
  }
  readAsDataURL(blob) {
    blob.text().then(t => {
      this.result = 'data:' + (blob.type||'application/octet-stream') +
                    ';base64,' + Buffer.from(t,'binary').toString('base64');
      this.onloadend?.();
    });
  }
}
if (typeof globalThis.FileReader === 'undefined') globalThis.FileReader = FileReaderPolyfill;

// 從 chibi-3d.js 借場景（簡化）
const scene = new THREE.Scene();
const head = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 32), new THREE.MeshStandardMaterial({color: 0xfdd9b5}));
scene.add(head);

const exporter = new GLTFExporter();
exporter.parse(scene, (result) => {
  writeFileSync('D:/project/astro/public/models/mascot-3d.glb', Buffer.from(result));
}, { binary: true }, (err) => { throw err; });
```

### 跑

```powershell
cd D:\project\astro
node scripts/export-mascot-glb.mjs
# 產出 /public/models/mascot-3d.glb (~270 KB)
```

## Chatbot Avatar 整合

`astro/src/components/Chatbot.astro` 浮動按鈕：

```astro
<canvas id="mascot-canvas" width="80" height="80"></canvas>
<script type="importmap">
{ "imports": { "three": "https://esm.sh/three@0.160.0" } }
</script>
<script type="module">
import '/scripts/chibi-3d.js';
Chibi3D.mount('mascot-canvas', { size: 80 });
</script>
```

mood 觸發（跟 sprite sheet 版並存）：

| 事件 | View |
|---|---|
| hover / idle | front |
| busy / 等 API | back |
| drag start | side |
| 完成回覆 | front → side 短動畫 |

## 跟 model-viewer 整合（展示頁）

`/3d-mascot/` 用 `<model-viewer>` 載 `mascot-3d-full.glb`：

```astro
<model-viewer src="/models/mascot-3d-full.glb"
              alt="Chibi mascot 3D model"
              auto-rotate
              camera-controls
              shadow-intensity="1"
              style="width: 100%; height: 500px;">
</model-viewer>
<script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>
```

## npm install three 陷阱

```powershell
# ❌ 會清掉 289 個 devDeps（含 vercel CLI 58）
npm install three
npm install --save-dev three

# ✅ 永遠 --no-save
npm install --no-save three@0.160.0
```

裝完後驗證 devDeps 還在：

```powershell
npm ls --depth=0  # 確認 vercel CLI 58 還在
```

如果被清了，重裝：

```powershell
npm install --no-save three@0.160.0 vercel@58.11.0
```

## model-viewer + Three.js 多實例 warning

同一頁用 model-viewer (從 Google CDN) + chibi-3d.js (從 esm.sh) 載 three.js 會跳：

```
WARNING: Multiple instances of Three.js being imported
```

**無害**，只是 warning 不影響 rendering。

想消掉：把兩個 import 整成一個 source（兩處都用 esm.sh 或都用 unpkg）。
