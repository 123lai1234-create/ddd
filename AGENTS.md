# AGENTS.md — D:\project 專案層設定

> Agent 工作在這個 repo 時要讀的設定。短、可用、不重複 agent memory。
> 完整主題記憶在 agent memory 的 `donttalk-project.md` / `vercel-deploy.md`。

## 部署（Vercel Hobby plan）

- ❌ `git push` auto-deploy 在 Hobby plan 壞掉（state=READY 但 URL 全 404）
- ✅ 一律手動 `vercel deploy --prebuilt --prod --yes --archive tgz --scope donttalk`
- PowerShell token 用 `$env:VERCEL_TOKEN`，**不要** `--token "$env:VERCEL_TOKEN"`（引號陷阱）
- 部署完 `Invoke-WebRequest -Method Head` 實打驗證，不信 CLI Ready
- 細節 → agent memory `vercel-deploy.md`

## Stock-app 硬規則（股票/LINE bot）

- 個股只抓 `https://donttalk.vercel.app/api/stock/<ticker>`，**不準** fallback Yahoo
- 大盤指數 / ETF 才用 Yahoo（donttalk 沒這些）
- 一定要 `?_=${Date.now()}` cache-buster（每次不同，固定常數會 cache hit）
- 後端會靜默回 2330 給沒向「universe」中的 ticker → 前端必須比對 `d.symbol === ticker`
- `astro/public/stock-app/` 整資料夾是靜態資產；改檔直接改 astro 那邊，不要去動 `dontalk-import/...`
- 完整內容 → agent memory `donttalk-project.md`

## Music / LRC（音樂頁）

- `music.astro` 寫死 `?v=N` cache buster，改 JS 後**手動 bump** 版本號
- LRC 檔放 `astro/public/music/*.lrc`，UTF-8 no BOM
- 編碼：CJK 用 `new TextDecoder('utf-8').decode(buf)` 處理 binary 來源

## Branch 策略

- HEAD 通常在 `123lai1234-create`（user active branch）
- `main` 跟 `123l` 對 .lrc 走相反路線（main 砍 inline、123l 保留 .lrc）
- commit 前必跑 `git branch --show-current` 確認
- 想 push 到 main：先 checkout main → cherry-pick --no-commit → 解 MODIFY/DELETE conflict → commit

## 工作目錄注意

- `astro/` 是公共產物，`dist/` **已 track**（git push auto-deploy 壞掉期間必要）
- `dontalk-import/artifacts/portfolio/public/stock-app/` 是 stock-app **canonical source**
- 不要動 `node_modules/` `.venv/` `.wrangler/` `.mavis/` `.opencode/`
- 寫 UTF-8 檔案**不要**用 PowerShell `Add-Content`（會腐蝕編碼）

## 測試 / 驗證

- Lint：`npm run lint`（astro/ 內）
- Build：`npm run build`（astro/ 內）
- 部署驗證：`Invoke-WebRequest -Uri "https://donttalk.vercel.app/<path>/" -Method Head` 預期 200

## 公開身份

- 個人識別統一用「不說」
- meta author、schema.org Person、chatbot 人設都套用
- GitHub / LinkedIn / Email 不外露