---
name: glb-asset-pipeline
description: "GLB 3D asset 完整 pipeline — 從 meshy.ai share URL 到能在 /3d-mascot/ 或 chatbot 浮動按鈕用的 .glb。涵蓋 meshy .meshy 加密格式解密、Node 24 ESM URL scheme 修法、Open3D simplify_quadric_decimation 簡化、GLB header 12-byte 手動 re-pack、model-viewer 跟 Three.js 兩種渲染路徑、chibi 程式化 3D 替代方案（mc320 對 2D chibi 永遠出石頭）。當用戶說「弄個 3D mascot」「GLB 壞掉」「model-viewer 沒顯示」「chatbot 加 3D 頭像」「meshy 下載」「chibi 3D」時使用。"
license: MIT
metadata:
  author: donttalk-deploy
  version: "1.0.0"
  tags:
    - glb
    - 3d
    - meshy
    - three.js
    - model-viewer
    - chibi
    - decimation
    - webgl
---

# GLB Asset Pipeline

> 完整 SOP：URL → 解密 → 簡化 → header 驗證 → 部署。對 chibi 卡通風格，AI 重建（mc320 / Hunyuan3D / TripoSR）永遠出石頭，建議走 **procedural Three.js** 路線。

## 兩條主要路徑

| 路徑 | 適合 | 產出 |
|---|---|---|
| **A. meshy.ai URL → GLB** | 已有 meshy 模型 / 想用 AI 3D | `model.glb` (3-16 MB) |
| **B. Procedural Three.js** | chibi 卡通角色 / mascot | inline JS chibi 程式碼（~270 KB GLB export） |

> 經驗：mc320 / Hunyuan3D / TripoSR 對 2D chibi 卡通風格不友善或下載太慢 → **path B 對 chibi 永遠是首選**。Path A 對寫實風或已有 meshy 帳號的人。

## Path A — meshy.ai → GLB（解密 + 簡化 + re-pack）

### 工具

```powershell
pip install uv
py -3.12 -m uv tool install git+https://github.com/Shuvam-Banerji-Seal/meshy-glb-downloader
```

### 跑

```powershell
meshy-glb "https://www.meshy.ai/zh-Hant/3d-models/<slug>-<uuid>" -o D:\tmp\model.glb
```

內部流程：
1. parse task ID from URL
2. GET `meshyd-api/web/public/v2/tasks/<uuid>` (公開 API 不需 auth) 拿 `modelUrl`
3. 下載 `.meshy` (signed S3 URL, application/octet-stream, magic bytes `MESHY.AI\x01\x00`)
4. 用 `mesh_loader.wasm` (從 `https://www.meshy.ai/resource/decrypt/` cache 到 `~/.cache/meshy-glb/`) 解密成 binary GLB
5. 寫檔 — **但 GLB header 12-byte 可能錯**（見下）

### Node 24 ESM URL scheme 修法

`decrypt.mjs` 用 `await import(jsPath)` 帶 raw `C:\...` 路徑會 throw `ERR_UNSUPPORTED_ESM_URL_SCHEME`。

**修法**：把 `jsPath` 改成 `pathToFileURL(jsPath).href` 再 import。

```js
// decrypt.mjs
import { pathToFileURL } from 'node:url';
// ...
const mod = await import(pathToFileURL(jsPath).href);
```

### GLB header 12-byte 驗證

解密後第一件事驗證 header：

```python
import struct
with open(p, 'rb') as f:
    h = f.read(20)
assert h[:4] == b'glTF'
version = struct.unpack('<I', h[4:8])[0]  # 應為 2
total = struct.unpack('<I', h[8:12])[0]  # 應 == os.path.getsize(p)
chunk_len = struct.unpack('<I', h[12:16])[0]
chunk_type = h[16:20]  # 應 b'JSON'
```

如果 header length 寫成 8-byte uint64 而非 4-byte uint32：
- bytes 12-15 會是 size 的 high 32 bits 而非 JSON chunk length
- 修法：手動 re-pack GLB header

```python
import struct
with open(p, 'rb') as f:
    data = bytearray(f.read())
# Re-write header: magic(4) + version(4) + length(4) = 12 bytes
data[8:12] = struct.pack('<I', len(data))
with open(p, 'wb') as f:
    f.write(data)
```

### Decimation（16 MB → 3-4 MB）

```python
import open3d as o3d
mesh = o3d.io.read_triangle_mesh("D:/tmp/model-full.glb")
mesh.simplify_quadric_decimation(target_number_of_triangles=8000)  # 8k faces
o3d.io.write_triangle_mesh("D:/tmp/model.glb", mesh)
```

簡化後再 re-pack GLB header（Open3D write 會算對，但保險起見再驗一次）。

## Path B — Procedural Three.js chibi（推薦卡通角色）

`/public/scripts/chibi-3d.js` 用 Three.js 程式化建 chibi：
- sphere 頭 + hemisphere 瀏海
- capsule 身體 + sphere 眼睛
- 完全 procedural（不用 GLB），可控

```js
import * as THREE from 'three';
// 3-light 照明
scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const key = new THREE.DirectionalLight(0xfff4e0, 0.95); key.position.set(2,3,3);
const fill = new THREE.DirectionalLight(0xa0c0ff, 0.35); fill.position.set(-2,1,2);
const rim = new THREE.DirectionalLight(0xffd0a0, 0.25); rim.position.set(0,2,-3);
```

### Public API

```js
Chibi3D.mount(canvasId, {size});  // 掛到 canvas
Chibi3D.setView('front'|'side'|'back');  // 切鏡頭
```

### Camera state

- front: position (0, 0.45, 3.4)  lookAt (0, 0.35, 0)
- side:  position (3.4, 0.45, 0)   lookAt (0, 0.35, 0)
- back:  position (0, 0.45, -3.4) lookAt (0, 0.35, 0)
- 平滑過渡：`currentPos += (targetPos - currentPos) * (1 - exp(-dt/0.18))`

### 匯出 GLB（給其他頁用）

`/scripts/export-mascot-glb.mjs` 用 Node 端 `three@0.160.0` + `GLTFExporter` 匯出 binary GLB：

```powershell
cd D:\project\astro
node scripts/export-mascot-glb.mjs
# 產出 /public/models/mascot-3d.glb (~270 KB)
```

**踩坑**：
- `GLTFExporter` 在 Node 用 `FileReader` → Node 沒內建，要 polyfill
- `npm install three` 會清掉 289 個 devDeps（含 vercel CLI 58）→ **永遠 `--no-save`**
- 會印 "Creating normalized normal attribute" warning（無害）

## 部署到 Vercel

| 場景 | 檔案 | 大小 | 位置 |
|---|---|---|---|
| `/3d-mascot/` 展示頁 | `mascot-3d-full.glb` | 16.18 MB | model-viewer 載入 |
| Chatbot 浮動按鈕 | `mascot-3d.glb` | 3.56 MB | Three.js + importmap 載入 |
| 備用 | `mascot-3d-tiny.glb` | 3.43 MB | 給慢網路 fallback |

GLB 放 `astro/public/models/`，build 後自動到 `dist/models/`，Vercel 走 `outputDirectory: "astro/dist"` 自動 serve。

## 渲染兩條路徑

### model-viewer（簡單，給展示頁用）

```html
<model-viewer src="/models/mascot-3d-full.glb"
              alt="3D mascot"
              auto-rotate
              camera-controls></model-viewer>
<script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>
```

優點：camera-controls / auto-rotate / AR / shadow 內建。
缺點：額外 150 KB JS。

### Three.js + importmap（chatbot 用，輕量）

```html
<script type="importmap">
{ "imports": { "three": "https://esm.sh/three@0.160.0",
               "three/addons/": "https://esm.sh/three@0.160.0/examples/jsm/" } }
</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const loader = new GLTFLoader();
loader.load('/models/mascot-3d.glb', (gltf) => {
  scene.add(gltf.scene);
});
</script>
```

優點：完全可控、輕量。
缺點：要自己寫 camera / light / animation。

## 踩坑清單

1. **mc320 / Hunyuan3D / TripoSR 對 2D chibi 永遠出石頭** — 卡通風格走 procedural，不要 AI 重建
2. **Node 24 ESM URL scheme** — `decrypt.mjs` import raw `C:\...` 會壞，要 `pathToFileURL`
3. **GLB header length field 寫成 8-byte** — decrypt.mjs 在 Node 端可能寫錯，手動 re-pack
4. **npm install three 會清 devDeps** — 永遠 `--no-save`
5. **model-viewer + Three.js 多實例** — 同一頁用兩個 source 載 three.js 會跳 warning（無害）
6. **GLTFExporter 在 Node 用 FileReader** — 要 polyfill

## References

- [`01-meshy-decrypt.md`](references/01-meshy-decrypt.md) — meshy-glb-downloader 安裝、解密流程細節、Node 24 ESM 修法
- [`02-glb-header-validation.md`](references/02-glb-header-validation.md) — GLB 12-byte header 結構、decrypt 寫錯 8-byte 修法、Python 驗證 script
- [`03-decimation-with-open3d.md`](references/03-decimation-with-open3d.md) — Open3D simplify_quadric_decimation 參數、3 個 size 對應
- [`04-threejs-chibi-procedural.md`](references/04-threejs-chibi-procedural.md) — 完整 chibi-3d.js 程式碼結構、3-light setup、camera state、export-mascot-glb.mjs
