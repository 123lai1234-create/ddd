---
name: blender-chibi-parametric
description: "2D chibi 設定圖 → Blender 手動/參數化建模 → Draco GLB → model-viewer 上線的完整教學。涵蓋：量參考圖輪廓、超橢圓截面堆疊建頭顱、貼在臉上的眼睛曲面片、單一參數化頭髮殼層、投影到衣面的帶狀衣領、純色材質、Draco 匯出、用 model-viewer 相機公式驗正面角與構圖。當用戶說「幫我建模」「做 chibi 3D」「3D mascot」「設定圖變 3D」「頭髮壞掉」「衣領破洞」「模型鋸齒」時使用。"
license: MIT
metadata:
  author: donttalk-deploy
  version: "1.0.0"
  tags:
    - blender
    - chibi
    - mascot
    - glb
    - draco
    - model-viewer
    - parametric
---

# Chibi 從 2D 設定圖到線上 3D（參數化手工建模）

> 目標：拿到一張 2D chibi 設定圖，**不靠 AI 重建**，用 Blender 刻出一顆乾淨的 3D 模型，
> 匯出成 GLB 掛到 model-viewer 上。
> 本 repo 的實作：`blender/chibi_build.py`（本 skill 的程式碼皆出自它），
> 量測腳本 `blender/measure_hero.py`（把參考圖的輪廓/眼睛/配色印成參數）。

---

## 0. 先做判斷：chibi 不要走 AI 重建

試過的都有同樣的結果：

| 方式 | 對 2D chibi 設定圖的結果 |
|---|---|
| TripoSR (mc128/256/320) | puffy blob，不像小朋友 |
| Hunyuan3D-2 | 形體糊、貼圖貼不對 |
| Meshy draft | 幾何還行，但五官是貼圖 → 投影鋸齒 |
| **Blender 參數化手工建** | ✅ 乾淨、可控、可重跑 |

**判斷準則**：卡通 / chibi / 比例誇張的角色 → 手工建；寫實、掃描、有機曲面 → 才考慮 AI 重建。

---

## 1. 量參考圖（不要用眼睛估）

設定圖是 1024px 的 A-pose。把它當成「整個角色 1.80 高、腳底貼地」的座標系，
**用程式掃像素量輪廓**，得到的數字直接變成建模參數。

```python
# 掃暗色像素 → 每個高度的輪廓半寬
import numpy as np
from PIL import Image

im = Image.open(r'kid-3d-project\character_apose_clean.png').convert('RGB')
a = np.asarray(im).astype(int)
H = im.size[1]
UPX = H / 1.80                       # px per unit

def px(z):  return int(H * (1.0 - z / 1.80))

for z in (1.66, 1.60, 1.54, 1.48, 1.44, 1.40, 1.36, 1.30, 1.22):
    row = a[px(z)]
    dark = np.where(row.sum(axis=1) < 150)[0]
    print('%.2f  %.3f' % (z, (dark.max() - dark.min()) / 2 / UPX))
```

量到的表就是 `HAIR_RX`（頭髮輪廓）、`HEAD_SEC`（頭顱截面）這類參數的來源。
**把量測腳本留在 repo 裡**（本 repo：`blender/measure_hero.py`），
換設定圖時重跑，不要重憑印象改數字。

> ⚠️ 用「暗色像素」量頭髮時，眼睛和眉毛也算進去了。量的高度要避開眼睛區（z 1.2–1.35）。

> ⚠️ **參考圖的棋盤格背景是畫進去的、沒有 alpha**：
> 用 `alpha > 128` 會把整張圖當角色，量出來的半寬會等於半張圖。
> 正確做法：用 scipy 把「低飽和 + 亮度像棋盤格」的像素標成候選背景，
> `ndimage.label` 後取**碰到畫面邊界**的那些元件當背景，其餘（角色）保留。
> 白色衣服也是低飽和的，但它被角色包住，所以不會被誤刪。

---

## 2. 建模：全部用參數化曲面，headless 跑

```powershell
& 'C:\Users\User\tools\blender-4.5.14-windows-x64\blender.exe' `
    --background --factory-startup --python 'D:\project\blender\chibi_build.py'
```

`--background --factory-startup` = 每次結果一樣，不用開 GUI。

### 2.1 頭顱 = 超橢圓截面逐層堆疊

```python
HEAD_SEC = [ (z, half_x, half_y), ... ]     # 15 層
v, f = tube_z(HEAD_SEC, sides=64, power=HEAD_POWER)
```

`power` 調的是超橢圓的方圓程度（2 = 橢圓，2.6 = 圓中帶方）。
用球體縮放做出來的是「蛋」，不是 chibi 的臉。

### 2.2 眼睛 = 貼在臉上再往外鼓的曲面片

自由浮著的眼球在凸臉上一定會浮空或陷進去：眼角位置的顱骨表面比中心後退 100mm。
解法是**把眼睛畫在臉的表面上往外推**：

```python
def eye_patch(name, cx, cz, rx, rz, mat, amp, on=None, extra=0.0):
    # on = 它貼在哪個 patch 上（虹膜貼眼白），這樣虹膜才浮在眼白上，
    #      外角留得住一彎白
```

四層由外而內：**眼白 → 虹膜 → 瞳孔 → 高光**。
上睫毛線要**坐在虹膜上**（`eye_dome_y` 取表面高度），放歪就變成浮在眼睛上方的黑條。

### 2.3 頭髮 = 封閉殼層 + 貝茲髮片（不要用錐體）

動漫亂髮是**一片片有方向、末端收尖的葉片**，不是一顆顆尖錐。

* 錐體（把 ico-sphere 拉尖）會變成一排**鯊魚鰭** —— 錐體沒有方向可以彎。
* 正確做法：**沿二次貝茲曲線掃出一條帶漸層半徑的葉片**：

```python
# chibi_lib.strand(p0, p1, p2, r_base, r_tip, steps, radial, flatten)
root = _cap_point(azimuth, polar, inset=0.055)   # 埋在殼裡
tip  = (x, y, z)                                # 絕對座標
ctrl = (root + tip) * 0.5 + out * bow            # bow = 外彎
v, f = L.strand(root, ctrl, tip, r_base, r_tip=0.012, steps=16, radial=12,
                flatten=0.60)
```

* **尖端座標是絕對值**：埋進頭裡（y 太靠後）整片看不見；
  戳出來（y 太前）變成一根根朝鏡頭的刺。額前瀏海要**平貼在額頭上**。
* **殼層必須保持封閉（watertight）**才能跑 EXACT 布林切臉部開口。
  若把帽子底面刪掉，布林會**啃穿帽子前端 → 整隻變光頭**。
* **殼層和髮片不要一起 remesh**：voxel remesh 會把髮片尖端吃掉。
  殼層自己 remesh + 布林，髮片另外 join（join 不會 welding，尖端留得住）。
* **臉部開口切「曲線髮際線」，不要切方塊**：方塊的切面是平的，會在額頭留一條
  水平邊 → 看起來像戴帽子。用髮際線剖面做成沿 Y 的 prism：

```python
profile = [(x, hairline_z(x)) for x in linspace(-0.34, 0.34, 72)]
profile += [(0.34, 0.50), (-0.34, 0.50)]      # 封口到下巴以下
cutter = _prism("FaceCutter", profile, "y", y_face - 1.40, y_face)
```

* **瀏海要貼著「額頭」，不是貼著帽子**：帽子半徑比頭顱大 27 mm，
  瀏海若從頭頂垂下來會整段埋進頭顱 → 只剩尖端露出 → 變成一排黑三角。
  路徑要從 `hairline_z(x)` 起點，沿 `face_point()` 一路往下，最後才收尖；
  寬度用 `hold` 參數保住（到髮際線都是寬的），才是一片葉子而不是一根刺。
* **耳朵要挖槽才看得到**：耳朵埋在包住頭顱的實心帽子裡，要沿 X 開一個
  **貫通**的橢圓柱（挖在帽子內部只會得到一個藏耳朵的空腔）。
* **鎖片鏡像用 `-a` 不是 `180-a`**：`sin(180-a) == sin(a)`，
  寫成 180-a 會讓左右兩邊的鎖片全部長在同一側。

### 2.4 衣服 = 截面堆疊 + 貼在衣面的零件

身體、袖子、短褲、腳都是 `tube_z` / `tube_y` 的截面堆疊。
衣領、鈕扣、門襟這種**貼在衣服表面的零件**，用 §2.5 的方法。

### 2.5 貼在衣面的零件 = 兩條路徑之間的帶狀面

**絕對不要用單一 n-gon 當貼片。** n-gon 的內部是一條直線弦，
凸出的胸口會被這條弦切過去、整片沉進衣服裡，最後只剩一圈邊緣浮出來 ——
看起來就是兩片破洞翅膀。

正確做法：**帶狀面，每個頂點都投影到衣服表面**。

```python
def band_on_shirt(name, edge_inner, edge_outer, mat, nu=5, nv=5, ...):
    # 兩條 (x, z) 路徑 → 網格 → 每個頂點 y = shirt_front_y(x, z) - offset
    # 兩條路徑的最後一點相同 → 帶子收成一個尖（衣領的尖）
```

這個 bug 在本 repo 真的踩過：`plate_on_shirt()` 用 n-gon 做衣領，
結果衣領變成兩片白色破洞。換成 `band_on_shirt()` 才對。

---

## 3. 材質：純色，不貼圖

每個部位一個純色 Principled 材質，**完全不貼 texture**。

好處：顏色不會漂移、不會有投影鋸齒、匯出體積小、glTF 原生支援。
頭髮的質地用 `roughness` 調，**不要加 coat**（黑髮 + clearcoat = 濕掉的塑膠）。

Blender 4.x 的 Principled input 名字改過，**先 probe 再寫**：

```python
def set_input(node, name, value):
    if name in node.inputs:      # "Specular IOR Level" / "Coat Weight" / "Sheen Weight"
        node.inputs[name].default_value = value
        return True
    return False
```

---

## 4. 匯出：Draco + 只選要的部分

```python
bpy.ops.export_scene.gltf(
    filepath=glb, export_format="GLB",
    use_selection=True,        # 只匯出組成角色的 mesh，別把 Floor 一起帶走
    export_apply=True,         # 把 modifier 實際算出來
    export_yup=True,           # Blender Z-up → glTF Y-up
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6)
```

**Draco 是必開的**：本 repo 26k 面從 551 KB → 131 KB。
不開會是 10 MB 級的怪物。

匯完照 `glb-asset-pipeline` 的 header 驗證檢查一次（magic / version / declared length）。

---

## 5. 驗證：用 model-viewer 的相機公式，不是用頁面截圖

**換 build 必重測正面角。** 正面角會隨 pipeline 變，別沿用舊筆記。

model-viewer 把相機放在（Y-up 世界）：

```
offset = r · (sin φ · sin θ,  cos φ,  sin φ · cos θ)
```

用它在自己的 Blender 裡模擬 θ = 0 / 90 / 180 / 270 四張，哪張是正臉就定那個角：

```python
# blender/out/_mv_camera_check.py 的一部分
def gltf_to_blender(v):  return Vector((v[0], -v[2], v[1]))   # gltf(x,y,z) → blender(x,-z,y)

off = Vector((sin(PHI)*sin(th), cos(PHI), sin(PHI)*cos(th))) * RADIUS
cam.location = gltf_to_blender(TARGET_G + off)
```

方位角慣例：**Blender 的 −Y 面 = glTF 的 +Z 面 = model-viewer 的 θ=0**。

構圖半徑自己算：模型高 H、垂直 fov F、要填滿畫面的比例 p →

```
r = H / (p · 2 · tan(F/2))
```

本 repo 的成品：H=1.8m、fov=30°、填 76% → `camera-orbit="0deg 82deg 4.4m"`、
`camera-target="0m 0.9m 0.2m"`（0.9 = 1.8 的一半）。

> ⚠️ **不要用頁面原生那個 viewer 截圖判角度**：頁面內嵌腳本可能帶 `autoRotate`，
> 會覆蓋你的設定，截到的永遠是轉到一半的角度。要另開乾淨的對照 viewer。

---

## 6. 上線

```powershell
cd astro
npm run mascot:stats                          # 解析 GLB 回寫頁面的統計數字，不要手填
npm run build
powershell -ExecutionPolicy Bypass -File scripts\prepare-deploy.ps1
& ..\node_modules\.bin\vercel.cmd deploy --prebuilt --prod --yes --archive tgz --scope donttalk
```

驗證（`Invoke-WebRequest` 在非互動模式會把狀態碼吃掉，用 curl）：

```powershell
curl.exe -s -o NUL -w "%{http_code}" https://donttalk.vercel.app/api/healthz     # 200
curl.exe -s -o NUL -w "%{http_code}" https://donttalk.vercel.app/3d-mascot        # 200
curl.exe -s -o NUL -w "%{size_download}" https://donttalk.vercel.app/models/mascot-3d.glb
```

---

## 7. 踩坑清單（都是真的踩過的）

| 症狀 | 病根 | 修法 |
|---|---|---|
| 臉頰有灰色碎片鋸齒 | 五官是貼圖投影出來的 | 改手工建模 + 純色材質 |
| 頭髮像一排鯊魚鰭 | 用錐體當髮片 | 改成貝茲曲線掃出的葉片（§2.3） |
| 整隻變光頭、額頭整片沒頭髮 | 帽子不是封閉殼，EXACT 布林啃穿前端 | 帽子保持封閉再布林；髮片最後才加 |
| 額前瀏海變一根根朝鏡頭的刺 | 髮片尖端戳出頭顱太多 | 尖端 y 改貼在額頭上 |
| 頭髮整片看不見 | 髮片埋進頭裡 | 尖端 y 往後拉出來 |
| 眼睛像「黑豆＋白圈」 | 眼白比虹膜大太多 | 眼白與虹膜同尺度，虹膜佔滿 |
| 睫毛看不見 | 黑線壓在黑色虹膜上 | 睫毛改坐在**眼白**上緣 |
| 膚色洗成 255,255,252 | 燈光過曝 | 降燈光強度，Base Color 直接填參考圖的線性值 |
| 衣領變成兩片破洞翅膀 | n-gon 在凸面沉進衣服 | 改成帶狀面並把頂點投影到衣面 |
| 頭髮縫隙露出皮膚 | 溝槽刻太深，穿透殼層 | 溝槽深度 < 離皮距離 |
| 頭頂冒出一根白刺 | 頂端 fan 的 apex 低於某些欄位的頂點 → 翻面 | `z_top` 夾在 apex 之下 |
| 頭髮像濕掉的黑色塑膠 | 黑髮加了 clearcoat | coat → 0，roughness 拉高 |
| 頭髮寬度像蘑菇帽 | 輪廓表的寬度被一路帶到髮際線 | 靠近髮際線要平滑收進顱骨（用 smoothstep 混） |
| 胯下有一塊紅色楔形 | 膚色與紅褲的端面共面，z-fighting | 褲子的髖部要蓋過軀幹底面 |
| 額頭有一條水平帽緣 | 臉部開口用方塊切，切面是平的 | 改成沿 `hairline_z(x)` 剖面的 prism 再 EXACT 布林 |
| 額前是一排黑三角 | 帽子比臉前 27 mm，瀏海從頭頂垂下來整段埋進頭顱，只剩尖端露出 | 瀏海路徑改走**額頭**（`face_point()`），從髮際線起往下 |
| 左右兩邊頭髮長的一樣但整隻看起來是轉身 | `_tip()` 的角度鏡像寫成 `180-a`（`sin(180-a)==sin(a)`） | 鏡像用 `-a` |
| 耳朵不見 | 耳朵埋在包住頭顱的實心帽子裡 | 沿 X 開一個**貫通**的橢圓柱槽 |
| 頭髮像花瓣不像尖刺 | 鎖片 `THICK` 太大 + remesh 後 smoothing 太重 | THICK 調小、smooth factor 降到 0.1／2 次 |
| model-viewer 顯示側面 | 換 build 後正面角變了 | 用相機公式重測 |

---

## 8. 本 repo 的現成資產

| 檔案 | 內容 |
|---|---|
| `blender/chibi_build.py` | 完整建模腳本（headless）—— 線上模型就是它 |
| `blender/chibi_lib.py` | 共用網格工具（loft / superellipse / strand / 材質） |
| `blender/measure_hero.py` | 從參考圖量輪廓／眼睛／配色，換設計稿先重跑 |
| `blender/out/_mv_camera_check.py` | model-viewer 相機模擬驗證 |
| `blender/out/preview_*.png` | 四視圖渲染 |
| `astro/public/images/chibi-hero.png` | 參考設定圖（= 首頁浮動立繪） |

**改完模型一定要重跑統計**：`cd astro && npm run mascot:stats`。
頁面上的「三角面 / 材質區 / GLB 大小」是從 GLB 解析出來的，手填會漂。

---

## References

- [`01-head-and-face.md`](references/01-head-and-face.md) — 頭顱截面、眼窩、眼睛四層結構
- [`02-hair-shell.md`](references/02-hair-shell.md) — 殼層頭髮的參數與三個致命細節
- [`03-clothing-and-collar.md`](references/03-clothing-and-collar.md) — 衣面投影零件的正確做法
- [`04-export-camera-deploy.md`](references/04-export-camera-deploy.md) — Draco 匯出、相機驗證、部署
