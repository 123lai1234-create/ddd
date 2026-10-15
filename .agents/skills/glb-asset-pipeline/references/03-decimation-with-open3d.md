# Open3D Decimation（簡化面數）

## 為什麼要 decimate

meshy.ai 預設產出 **高面數** GLB：
- 16 MB / 719k faces / 628k verts — 太大
- chatbot 浮動按鈕場景要 < 4 MB（不然 lazy load 也救不了）
- `/3d-mascot/` 展示頁可以到 16 MB（一次載入值得）

目標面數參考：

| 用途 | 檔案 | Faces | Verts | 大小 |
|---|---|---|---|---|
| `/3d-mascot/` 展示頁 | `mascot-3d-full.glb` | 719k | 628k | 16.18 MB |
| chatbot 浮動按鈕 | `mascot-3d.glb` | 8k | 144k | 3.56 MB |
| 慢網路 fallback | `mascot-3d-tiny.glb` | 3k | 141k | 3.43 MB |

## 安裝 Open3D

```powershell
pip install open3d
```

CPU 版就夠，decimation 不需要 GPU。

## 用法

```python
import open3d as o3d

# 讀 GLB
mesh = o3d.io.read_triangle_mesh("D:/tmp/model-full.glb")
print(f"Before: {len(mesh.triangles)} faces, {len(mesh.vertices)} verts")

# 簡化
mesh.simplify_quadric_decimation(target_number_of_triangles=8000)
print(f"After:  {len(mesh.triangles)} faces, {len(mesh.vertices)} verts")

# 計算 normals（Open3D decimation 後會丟）
mesh.compute_vertex_normals()

# 寫 GLB
o3d.io.write_triangle_mesh("D:/tmp/model.glb", mesh)
```

## 參數

- `target_number_of_triangles=8000` — 8k faces，視覺品質還 OK
- `target_number_of_triangles=3000` — 3k faces，明顯 polygon-y
- `target_number_of_triangles=50000` — 50k faces，細節保留多但 6+ MB

## Decimation 對卡通風格 vs 寫實風

- **寫實模型**（人臉、細節）：3k faces 就 polygon-y 明顯，建議 8-15k
- **卡通模型**（chibi、低面數設計）：3k 反而比 8k 好看（多餘面擾亂 silhouette）
- **硬表面**（建築、機械）：需要 15k+ 保留細節

## Decimation 後一定要 compute_vertex_normals

Open3D `simplify_quadric_decimation` 後 normals 會丟，沒 normals 會看起來「平」、光照錯。

```python
mesh.simplify_quadric_decimation(target_number_of_triangles=8000)
mesh.compute_vertex_normals()  # ← 必加
```

## Decimation 失敗 fallback

如果 Open3D 拋 `pybind11` 或 `std::bad_alloc`：
- 記憶體不夠 → 分塊 decimate（先 split mesh，個別 simplify，再 merge）
- 或降 target_number_of_triangles（8000 → 3000 試試）

## 部署前 size check

```powershell
Get-Item "D:\project\astro\public\models\mascot-3d.glb" | Select-Object Name, Length
```

預期：
- `mascot-3d-full.glb`: ~16 MB
- `mascot-3d.glb`: ~3.5 MB
- `mascot-3d-tiny.glb`: ~3.4 MB

超過 5 MB 但檔名是 `-tiny` → 重新 decimate。

## 跟 Vite / Astro build 的互動

GLB 放 `astro/public/models/` → build 自動到 `dist/models/` → Vercel serve `/models/<file>.glb`。

- 16 MB 檔會讓 build 慢（gzip 不壓 binary asset，要 CDN cache）
- 解法：對展示頁用 `mascot-3d-full.glb` + 顯示進度條；對 chatbot 用 `mascot-3d.glb`
- 兩個不要自動 lazy load — model-viewer 自己會等 `<model-viewer>` 元素 visible 才開始 fetch
