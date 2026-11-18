# facility2-server — 封鎖設施求生全重寫版（2026-11-04）

全新實作，不是从舊 facility-server 還原。舊碼只作為功能清單參考。

## 結構
- `engine.mjs`：純邏輯（42 房、9 層、6 回合、毒氣累積投票、手術室、戰鬥／暗影、火箭筒、控制室、操作室、基因庫、傳送室、停機坪、選留 60 秒、行動 180 秒惰性逾時 + AI 代打、信譽／冷卻、觀戰唯讀）。`createApp(store)`，store 為注入式介面。
- `neon.mjs`：Neon HTTP store，只讀 `DATABASE_URL_NEON`，不含任何寫死連線字串。沿用 `facility_rooms`（code/state JSONB/version）、`facility_accounts`、`facility_sessions`、`facility_records`、`facility_oauth_states`，皆 lazy `CREATE TABLE IF NOT EXISTS`。
- `vercel.mjs`：Vercel Node runtime 入口 `(req, res) => void`，Google OAuth 用 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` 環境變數，回呼固定為 `https://donttalk.vercel.app/api/games/accounts/google/callback`。
- `build.mjs`：產生明確 `api/games/*` 路由檔（world、accounts、accounts/google、accounts/google/callback、rooms、rooms/[code]、records、[...all]），不只靠 catch-all。
- `test-harness.mjs`：記憶體假 Neon 測試，`node facility2-server/test-harness.mjs`。

## API（皆在 /api/games 之下）
- `POST accounts`：action=create（訪客／顯示名稱，恢復碼只顯示一次、只存雜湊）、recover、google（回 redirectUrl）
- `GET accounts/google/callback`：換 token 後 302 回 `/facility-survival?session=…`
- `POST rooms`：建房（娛樂 80／競技 90、冷卻檢查）
- `POST rooms/:code`：join / allocate（總點 10）/ start（AI 補滿 8 人）/ action / keep / gold / goldPick / trade / tradeRespond / freeDone / quit / spectate
- `GET rooms/:code`（或 ?spectate=1）：玩家視圖／觀戰唯讀視圖
- `GET world`：公開房間摘要（無 token、無帳號資料）
- `GET records?accountId=`：累計戰績

## 前端
- `astro/src/pages/facility-survival.astro`：全螢幕大廳（自有 CSS 漸層、無第三方圖片），大標題、加入遊戲／建立房間、世界／觀戰／成就／戰績／回顧、規則／系統介紹／更新紀錄 modal、/terms 與 /privacy 連結；遊戲內含配點、行動路徑、投票、選留、金條、交易、棄權。
- `astro/src/pages/facility-world.astro`、`.facility-review.astro`：世界列表（點碼自動填入遊戲頁）、累計戰績（非逐局重播）。
- `astro/src/pages/games.astro`：恢復封鎖設施求生卡片。

## 未線上驗證
本機 commit 後未 push，未在線上實測 API／Google 回呼／Neon 寫入；上線前需使用者授權 push 並重測。
