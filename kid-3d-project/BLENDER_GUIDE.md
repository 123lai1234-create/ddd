# Blender 手動建模指南

TripoSR / Hunyuan3D 等 image-to-3D 模型對 2D chibi 風格插畫的表現都很差（會變成 puffy blob）。要得到真正像「小朋友」的 3D model，最可靠的路是**自己用 2D 圖當 reference，在 Blender 手動建模**。

## 0. 為什麼不直接用 TripoSR 結果

AI image-to-3D 模型的訓練資料是**真實世界物體**（蘋果、椅子、人），對 chibi 卡通比例完全沒概念。給它 chibi 圖，它會試圖把它「正規化」成真實物體的形狀，結果就是 blob。給一張 3D 軟體 + 你自己，30 分鐘可以做出比 TripoSR 好 10 倍的結果。

## 1. 安裝 Blender

下載 Blender 4.2 LTS（穩定）：https://www.blender.org/download/

或用 winget：
```powershell
winget install --id=BlenderFoundation.Blender -e
```

## 2. 從 2D 圖建 3D 模型

### 2.1 匯入三視圖

1. 打開 Blender
2. 把 2 視窗切到 4 視窗（右上角按左鍵 → Split Area）
3. 視窗 1：前視圖（按 Numpad 1）
4. 視窗 2：側視圖（按 Numpad 3）
5. 視窗 3：透視圖（按 Numpad 5）
6. 視窗 4：頂視圖（按 Numpad 7）
7. **File → Import → Images as Planes**，選 `character_front.jpg`
8. 重複把 `character_side.jpg` 放側視窗、`character_back.jpg` 放後視窗

### 2.2 對齊圖片

1. 選前視窗的圖片，按 `S` 縮放到適當大小（角色高度佔視窗 1/2）
2. 用 `G` 移動圖片，讓三視圖的「地面線」對齊
3. 重複做側視、後視
4. 在每個視窗按 `G`+`Y`（前視）`G`+`X`（側視）來對齊

### 2.3 開始建模（chibi 重點：大頭小身）

1. 切到前視窗，刪掉那張參考圖（`X`）
2. **頭**：選中參考的頭部區域，按 `Shift+A` → Mesh → UV Sphere
   - 縮放成比身體大 1.5x（chibi 比例）
   - 細分段設為 32（`Segments=32, Rings=16`）
3. **身體**：Shift+A → Mesh → Cylinder
   - 縮成頭的 1/2 寬、1/2 高
   - 加 `Subdivision Surface` modifier（View 跟 Render 設為 2）
4. **手**：Cylinder，細，接到身體兩側
5. **腳**：Cylinder，矮，貼地
6. **眼睛**：UV Sphere，扁一點（`S`+`Z` 0.3），放在頭前方
7. **嘴巴**：UV Sphere，極扁（`S`+`Z` 0.1），頭前方下方
8. **頭髮**：Sphere 切一半貼在頭頂（`Edit Mode` → `B` 框選上半部 → `Del`）

### 2.4 套娃娃骨架

1. 選身體物件
2. `Shift+A` → Armature
3. 切到 `Edit Mode`（`Tab`）
4. 加關節：`Shift+D` 複製骨頭，`G` 移動到下一個關節位置
5. 順序：hip → spine → chest → neck → head / hip → upper_arm → forearm → hand / hip → thigh → shin → foot
6. 切到 `Object Mode`
7. 選 mesh（身體），`Shift` 加選 armature，按 `Ctrl+P` → Armature Deform
8. 進入 `Pose Mode` 測試關節能不能動

### 2.5 上色

1. 選 mesh，切到 `Material Properties` 面板（下方紅色球圖示）
2. `New`，命名 `skin`
3. `Base Color` 選膚色
4. 對衣服、眼睛、頭髮各開一個 material
5. 進入 `Texture Paint` 模式手繪細節

### 2.6 匯出給 Mixamo 自動綁骨

1. File → Export → FBX
2. 路徑模式：`Copy`
3. 勾 `Add Leaf Bones`、`Bake Animation`
4. Apply Transform 打勾
5. 上傳到 https://www.mixamo.com 自動套骨架

## 3. 預期時間

- 安裝 Blender：5 分鐘
- 對齊三視圖：5 分鐘
- 建基本形狀：20-30 分鐘
- 套骨架：10 分鐘
- 上色：15 分鐘
- **總計約 1-1.5 小時**

比 TripoSR 花了我們 3 個小時得到 blob 好太多。

## 4. 替代方案

如果真的不想手動建：
- 用 **VRoid Studio**（免費）— 3D chibi character 編輯器，預設就是 chibi 風格
- 用 **VRChat SDK** + Unity — 有內建 chibi rig
- 找 Fiverr/3D artist 客製 — 3D chibi 角色通常 $50-150 USD，給 2D ref 圖即可
