# 小朋友 3D 建模起手包

從你給的 AI 參考圖生出來的素材，給 Blender / Three.js / Godot 後續加工。

---

## 0. 圖片 / Mesh 速覽

| 檔案 | 用途 |
| --- | --- |
| `character_front.jpg` | 主視圖 + 細節 zoom |
| `character_side.jpg`  | 右側面 profile |
| `character_back.jpg`  | 背面 |
| `character_3view_sheet.jpg` | 三張合併成單張 sheet |
| `chibi_base.obj` | 程式化 chibi 雛型 (1430v / 2184f / 11 groups) |
| `chibi_base.mtl` | 對應材質 |

---

## 1. AI image-to-3D（推薦 Tripo）

`tripo_generate.py` / `tripo_batch.py` / `tripo_quota.py` 是包好的 Tripo3D v2 OpenAPI 客戶端，
只吃一個 `TRIPO_API_KEY` env var 就能跑。

### 1.1 為什麼選 Tripo（vs Meshy / Rodin）

| | Tripo | Meshy | Rodin |
|---|---|---|---|
| 免費 credits | 200/mo | 100/mo | preview free, keep 扣 |
| chibi / stylized 拓樸 | **最乾淨**（v3.1） | 中 | 高 |
| Quad topology 輸出 | 支援 (+5 credits) | 不支援 | 支援 |
| Auto-rig | 支援 | 不支援 | 不支援 |
| 商用授權 | 付費才可商用 | 免費需 attribution | 付費才可商用 |

對 chibi / stylized character 來說 Tripo 是首選：拓樸乾淨、生成快（10–60s）、
quad mesh 直接進 Blender 不用 retopo。

### 1.2 取得 API key

1. 註冊 https://platform.tripo3d.ai/（email signup，免信用卡）
2. Dashboard → API Keys → Create
3. 複製 key，設定環境變數：

```powershell
# PowerShell（當前 session）
$env:TRIPO_API_KEY = "tsk_xxxxxxxx"

# 永久（user-level）
[Environment]::SetEnvironmentVariable("TRIPO_API_KEY", "tsk_xxxxxxxx", "User")
```

### 1.3 確認 quota

```bash
python tripo_quota.py
```

### 1.4 單張生成

```bash
python tripo_generate.py character_front.jpg --format glb --quad
# → character_front_3d.glb
```

可選 `--format {glb|obj|fbx|stl|usdz|ply}`，`--quad` (+5 cr)，
`--no-texture` 關 texture，預設 v3.1 模型。

### 1.5 三視圖批次生成

```bash
python tripo_batch.py --format glb
# → 3d-models/character_front_3d.glb
# → 3d-models/character_side_3d.glb
# → 3d-models/character_back_3d.glb
```

已完成生成的會自動跳過（看檔案大小 > 1KB 判斷）。

### 1.6 成本試算

- Image-to-Model：40 credits
- + Texture：+10
- + Quad mesh：+5
- 一張完整跑 ≈ 55 credits

→ 200 credits 免費額度可以跑約 **3 張完整（含 quad + texture）**。

---

## 2. 三視圖角色設定（PNG reference）

直接看上面速覽表。進 Blender 用：

1. **File → Import → Images as Planes** 載入 `character_3view_sheet.jpg`
2. 把 plane 移到世界原點（front 對 +Z，side 對 +X，back 對 -Z）
3. 開 orthographic view 對齊角色輪廓

---

## 3. 低多邊形 chibi 雛型（OBJ）

### 結構（groups）

| group | 部位 | 面數 |
| --- | --- | --- |
| `head`   | 頭（球） | 504 |
| `hair`   | 頭頂頭髮蓋（球上半） | 144 |
| `eye_-1` / `eye_1` | 左右眼球 | 192 each |
| `body`   | 軀幹（capsule） | 352 |
| `arm_-1` / `arm_1` | 左右手臂（capsule） | 160 each |
| `leg_-1` / `leg_1` | 左右腿（capsule） | 120 each |
| `shoe_-1` / `shoe_1` | 左右腳（扁平球） | 120 each |

### 邊界框

```
min = (-0.555, -0.071, -0.547)
max = ( 0.555,  1.655,  0.550)
```
Y-up，feet 在 y ≈ 0。

### Blender / Three.js 匯入

- Blender：**File → Import → Wavefront (.obj)**，勾 "Import Materials"
- Three.js：

```js
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
const loader = new OBJLoader();
loader.load('chibi_base.obj', (obj) => scene.add(obj));
```

---

## 4. 重新生成

```bash
python build_chibi_mesh.py    # 重生 OBJ / MTL
python compose_sheet.py       # 重組三視圖 sheet
python gen-3views.py          # AI 三視圖（需 mcode-tools matrix image gen）
```

`debug_groups.py` 是當初 debug group split 用的，可以刪。