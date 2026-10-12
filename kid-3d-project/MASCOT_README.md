# 角色「Mascot 小朋友」素材總覽

> 給設計師 / 3D 建模師 / 動畫師接手時看的入口文件
> 位置：`C:\Users\User\.minimax\sessions\mvs_4523b3f8d78e4a098b3512a12e688cec\workspace\kid-3d-project\`

## TL;DR

3D 重建這條路在 2D AI chibi 插畫的輸入下被堵死（TripoSR / Hunyuan3D 都只給出 puffy blob，不像小朋友）。最終決定 **以 2D 設定圖為 mascot 主交付**，並提供：

- **2 張設定圖 sheet**（直接可用於風格規範 / 動畫參考）
- **9 張單張素材**（3 視圖 + 6 表情）
- **3D 嘗試產物**（從 TripoSR 跑出來，雖然不像但 mesh 是 watertight 給 Blender 參考用）
- **手動建模指南**（VRoid 替代方案 + Mixamo 流程）

## 主交付

| 檔案 | 用途 | 尺寸 |
|---|---|---|
| `character_3view_sheet.jpg` | **主視圖設定圖**（正面 + 細節標註、側面、背面） | 2796×1004 |
| `character_expressions_sheet.jpg` | **6 表情 pack**（開心/難過/驚訝/生氣/想睡/好奇） | 2376×1752 |
| `character_front.jpg` | 正面單張 | 2K |
| `character_side.jpg` | 側面單張 | 2K |
| `character_back.jpg` | 背面單張 | 2K |
| `character_happy.jpg` | 開心 | 2K |
| `character_sad.jpg` | 難過 | 2K |
| `character_surprised.jpg` | 驚訝 | 2K |
| `character_angry.jpg` | 生氣 | 2K |
| `character_sleepy.jpg` | 想睡 | 2K |
| `character_curious.jpg` | 好奇 | 2K |

## 設計規範（從 AI 設定圖萃取出來）

- **身形**：2 頭身 chibi，圓臉、大眼、小下巴
- **膚色**：健康淺膚色
- **髮型**：黑色短髮，微亂、有層次、髮尾往上
- **眼型**：極大圓眼、深棕色、有明顯高光
- **穿著**：藍色 polo 衫（白色衣領 + 鈕扣）+ 深藍短褲
- **基本姿勢**：sat-in-palm（坐在手掌上） — 本身就是 mascot 比例
- **背景**：白底（用於合成時去背方便）

## 3D 嘗試產物（參考用 mesh，不建議直接出貨）

| 目錄 | 內容 | 備註 |
|---|---|---|
| `3d-models-triposr/` | TripoSR 預設（mc-res 128） | 80% size 縮小 |
| `3d-models-hq/` | TripoSR mc-res 256 watertight × 3 視圖 | |
| `3d-models-uhd/` | TripoSR mc-res 320 watertight × 3 視圖 | 384 OOM |
| `3d-models-uhd-textured/` | vertex color + 球面 UV + PBR | |
| `3d-models-icp/` | open3d ICP 對齊 + merge（243kV） | 對齊品質差 |
| `3d-models-merged/` | 直接 merge（387kV） | 對齊品質差 |
| `3d-models-mixamo/` | 4kV decimated | Mixamo 上傳用 |
| `3d-models-textured/` | 256 + vertex color + multiview scene | |
| `3d-models-cpu-test/` | CPU 模式測試產出 | |
| `chibi_base.obj` / `.mtl` | 程序化 chibi（11 部位、1430V、2184F、watertight） | 簡單幾何當 placeholder |

**結論**：TripoSR / Hunyuan3D 對 stylized 2D 角色都失敗，產出都是 puffy blob。**請改用手動建模**（見 `BLENDER_GUIDE.md`）。

## 指南

- **`BLENDER_GUIDE.md`** — VRoid 替代方案 + Mixamo 完整流程
- **`3d-models-mixamo/MIXAMO_GUIDE.md`** — Mixamo 上傳 / anchor 設定細節
- **`README.md`** — 整體 pipeline 紀錄（為什麼最後放棄 AI 重建）

## 腳本

- `gen_curious.py` — 用 `mcode-tools upload-temp-url` 拿 fresh 簽名 URL，避免 OSS 過期
- `gen_expressions.py` — 6 表情 batch 生成（需配合 `mcode-tools connector call`）
- `gen-3views.py` — 3 視圖 batch 生成
- `compose_sheet.py` / `compose_expression_sheet.py` — 設定圖合成（用微軟正黑體）
- `build_chibi_mesh.py` — 程序化 chibi 雛型

## 給接手的人

如果你要做的事是「交個能用的 mascot」：
1. 直接用 `character_expressions_sheet.jpg` 當 sprite sheet source，6 個表情都已就位
2. 動畫幀可從 6 表情 + 中間形變（bounce / tilt / wave）組合

如果你要做的事是「3D 化」（客戶要 3D）：
1. **不要用 AI 重建**，照 `BLENDER_GUIDE.md` 走手動建模
2. 用 `character_3view_sheet.jpg` 當 reference sheet
3. 完成後丟 `MIXAMO_GUIDE.md` 流程做自動綁骨
