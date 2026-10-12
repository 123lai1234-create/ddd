# Mixamo 自動綁骨操作指南

Mixamo 是 Adobe 提供的免費網頁服務，可以上傳 character mesh 自動配骨架 + 套動作。

## 準備檔案

`3d-models-mixamo/front_for_mixamo.glb`
- 4,046 vertices / 8,000 faces（Mixamo 限制 < 10k vertices）
- 來自 mc-res 320 watertight mesh，pymeshlab quadric edge collapse decimated
- 沒有材質/貼圖（Mixamo 自動套 skeleton 後會忽略）

如果想重做：
```bash
python TripoSR/prep_mixamo.py character_front_mc320_watertight.glb out.glb --target-faces 8000
```

## 上傳到 Mixamo

1. 開 https://www.mixamo.com （要 Adobe 免費帳號）
2. 點 **UPLOAD CHARACTER**
3. 選 `front_for_mixamo.glb`
4. Mixamo 會自動偵測骨架 anchor（左/右腳、頸部、手腕）
5. 對 chibi 角色**很可能 anchor 偵測失敗**（TripoSR 重建的 mesh 比例怪，沒有正常的 T-pose），這時：
   - 手動設定 anchor：
     - Pelvis：mesh 中心偏下（Y ≈ 0.0）
     - Left/Right Foot：底部左右
     - Left/Right Wrist：手臂末端
     - Spine：軀幹中央
   - 或放棄自動配，改用 Mixamo 的「Hand-drawn character」流程

## 套動作

- 左邊選 skeleton（建議 **Y-bot** 或 **X-bot** — 中性比例）
- 右邊選動作（idle / walk / run / dance…）
- 點 DOWNLOAD：
  - Format: **FBX Binary**（最通用）
  - Pose: T-Pose（如果你還想換動作就選 T-Pose，不要選動畫後的 pose）
  - 取消勾選「Without Skin」

## 在 Blender / Three.js 用

匯入 FBX 就有 animatable character。

---

## 替代方案（如果 Mixamo anchor 偵測失敗）

| 工具 | 說明 |
|---|---|
| **Auto-Rig Pro** (Blender addon) | 付費但強，會根據 mesh 自動算骨架 |
| **Blender Rigify** | 內建，比較通用 |
| **Mixamo Hand-drawn** | 上傳 2D 圖，Mixamo 自動建 mesh + 骨架 |

chibi 角色（頭大身小、坐姿）對所有自動 rigging 都是挑戰 — 實務上通常要手動調整骨架。
