# 專案清理計劃

## 當前結構問題

### 1. 重复的前端代码

- `frontend/` - 舊的純 HTML/CSS/JS 前端
- `astro/` - 新的 Astro 前端
- Astro 已經從 frontend 同步檔案

**建議：** 刪除 `frontend/` 或將其標記為 legacy

### 2. 混亂的配置檔案

- `vercel.json` - Vercel 部署配置
- `.vercelignore` - Vercel 忽略檔案
- `wrangler.toml` - Cloudflare Workers 配置
- `.railwayignore` - Railway 部署配置
- `astro/.vercelignore` - Astro 專用的 Vercel 配置

### 3. 重複的頁面檔案

- `astro/src/pages/` 有 Astro 頁面
- `frontend/` 有對應的 HTML 檔案（已同步到 Astro）
- 轉換後的檔案：`about.astro`, `works.astro` 等

### 4. 測試與文檔分散

- `tests/` - 單元測試
- `docs/` - 部署文檔
- `scripts/` - 自動化腳本

---

## 建議的清理步驟

### Phase 1: 清理前端（無風險）

- [ ] 刪除或移動 `frontend/` 到 `legacy-frontend/`
- [ ] 統一使用 `astro/` 作為唯一前端

### Phase 2: 統一配置文件

- [ ] 將所有部署配置移到 `deploy/` 目錄
- [ ] 簡化 `vercel.json`

### Phase 3: 清理構建產物

- [ ] 刪除 `astro/dist/` （它是構建產物）
- [ ] 將其加入 `.gitignore`

### Phase 4: 組織源代碼

- [ ] 移動 API 相關檔案到 `api/`
- [ ] 移動科學計算到 `src/science/` 或 `lib/`

---

## 是否要執行這些清理？
