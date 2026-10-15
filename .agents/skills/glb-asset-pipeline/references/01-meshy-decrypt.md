# meshy.ai URL → GLB 解密（細節）

## 安裝

```powershell
pip install uv
py -3.12 -m uv tool install git+https://github.com/Shuvam-Banerji-Seal/meshy-glb-downloader
```

`uv` 是 Python 套件管理，跑一次就好。

## 跑解密

```powershell
meshy-glb "https://www.meshy.ai/zh-Hant/3d-models/<slug>-<uuid>" -o D:\tmp\model.glb
```

URL 格式：
- 公開 share link：`https://www.meshy.ai/s/<share_id>` 或 `https://www.meshy.ai/zh-Hant/3d-models/<slug>-<uuid>`
- task UUID 從 URL 末段 parse 出來

## 內部流程

1. **parse task ID** from URL
2. **GET task metadata**：`GET https://meshyd-api/web/public/v2/tasks/<uuid>`
   - 公開 API，**不需 auth**
   - 拿 `modelUrl`（signed S3 URL）
3. **下載 `.meshy` 加密格式**：
   - signed S3 URL
   - `Content-Type: application/octet-stream`
   - magic bytes：`MESHY.AI\x01\x00` (8 bytes)
4. **解密**：用 `mesh_loader.wasm`（從 `https://www.meshy.ai/resource/decrypt/` cache 到 `~/.cache/meshy-glb/`）
5. **寫 binary GLB** — magic `glTF` version 2

## 踩坑

### 1. Node 24 ESM URL scheme 壞掉

`decrypt.mjs` 內部用：

```js
const mod = await import(jsPath);
```

帶 raw Windows 絕對路徑 `C:\Users\...\mesh_loader.js` 會 throw：

```
Error [ERR_UNSUPPORTED_ESM_URL_SCHEME]: Only URLs with a scheme in: file, data, and node are supported by the default ESM loader.
```

**修法**：用 `pathToFileURL` 轉 file URL：

```js
import { pathToFileURL } from 'node:url';
// ...
const mod = await import(pathToFileURL(jsPath).href);
```

改 `decrypt.mjs`：
- 開頭加 `import { pathToFileURL } from 'node:url';`
- 找 `await import(jsPath)` 改 `await import(pathToFileURL(jsPath).href)`

### 2. WASM cache 位置

`~/.cache/meshy-glb/` 第一次跑會從 `https://www.meshy.ai/resource/decrypt/` 下載：

- `mesh_loader.wasm` (~50 KB)
- `mesh_loader.js` (~5 KB)

Windows 對應路徑：`C:\Users\<user>\.cache\meshy-glb\`

如果網路被擋，可手動下載放到那位置。

## 驗證解密成功

```python
import struct
with open(r"D:\tmp\model.glb", "rb") as f:
    h = f.read(20)
print("magic:", h[:4])         # 應 b'glTF'
print("version:", struct.unpack('<I', h[4:8])[0])  # 應 2
print("total:", struct.unpack('<I', h[8:12])[0])   # 應 == os.path.getsize(p)
```

如果 magic 不是 `glTF` → 解密失敗，重跑。
如果 total 對但 bytes 12+ 是 garbage → header 寫成 8-byte，修 header（見 `02-glb-header-validation.md`）。

## meshy.ai 帳號需求

公開 share link **不需要** meshy 帳號。workspace 內的私有模型需要登入（CLI 不支援，要手動下載）。
