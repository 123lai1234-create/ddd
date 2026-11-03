# 封鎖設施求生 — serverless 後端（Neon 移植版）

多人連線生存遊戲的後端，原本是 dontalk 作品集 api-server 的 Express router
（in-memory 房間），移植到 ddd 線上站的 Vercel serverless function，
房間改存 Neon。2026-11-03 起引擎改為多人完整規則版：規則移植自本站
自有資產 `astro/public/games/lockdown-survival/js/`（單人版），
不是抄 ksever 的程式碼；舊的 3 層 × 5 房簡化版已被取代。

## 檔案

| 檔案 | 說明 |
| --- | --- |
| `game-engine.ts` | 多人完整規則版引擎：42 房、9 樓層、6 回合（見「規則移植」） |
| `game-ai.ts` | AI 決策：bots.js 政策的簡化移植（4 種政策，無難度分級） |
| `neon.ts` | Neon HTTP SQL 查詢 helper（`DATABASE_URL` 或 `DATABASE_URL_NEON`） |
| `store.ts` | 房間的 Neon 持久化層（樂觀鎖 version、12 小時過期、lazy 建表） |
| `handler.ts` | 十支 endpoint 的完整移植＋惰性推進（見下） |
| `vercel-entry.ts` | Vercel function 入口（Web Request/Response，與 catchall 同簽名） |
| `test-harness.ts` | 本機端到端 harness（假 Neon，見「驗證」） |
| `../api/games/[...all].mjs` | 打包輸出（要 check-in，部署時直接用這支） |

## API（與 Express 版相同）

```
POST /api/games/rooms                    建房 → 201 { code, playerId, token, room }
POST /api/games/rooms/:code/join         加入（大廳階段）→ 201 { playerId, token, room }
GET  /api/games/rooms/:code?token=…      查狀態（前端每 2 秒輪詢）
POST /api/games/rooms/:code/setup        配點＋出生點
POST /api/games/rooms/:code/start        房主開始（AI 補滿 4 人）
POST /api/games/rooms/:code/ready        自由階段準備
POST /api/games/rooms/:code/action       行動階段提交路徑＋毒樓層投票＋控制室／操作室／火箭筒／結算用道具
POST /api/games/rooms/:code/use-item     自由階段用消耗品（藥片／酒／腎上腺素／回收機）
POST /api/games/rooms/:code/trade        自由階段發起交易（對 AI 立刻自動回覆）
POST /api/games/rooms/:code/trade/respond 自由階段回覆交易
```

錯誤碼與 Express 版一致：404 找不到房間、401 憑證無效、
403 只有房主可以開始、400 規則錯誤；未設定 `DATABASE_URL`／
`DATABASE_URL_NEON` 時一律 503。

## 規則移植（與單人版相同 vs. 為多人輪詢簡化）

相同：42 房地圖與全部連接（一般通道／繩索垂直通道／回收站直達／
傳送室／停機坪飛行）、9 樓層、6 回合、基因配點（人類總和 10）、
物資池抽取上限、毒氣投票加權與累積不消失、手術室（剛好 2 人各 +4 血
且不戰鬥）、戰鬥／亂鬥（持槍者優勢）、暗影吸血（max(1, 攻擊力)）與
復活（≥2 血）、水糧上繳（第 1 回合跳過、餐廳免繳、補給僅兩樣都缺時用）、
火箭筒（持有者指定房間扣 4、可重複用）、控制室（10 票或永久解毒）、
操作室重配、基因庫三項 +1、激光室、停機坪空投（每回合 1 張、最多帶 1 張）。

簡化（多人輪詢下不做互動選留，伺服器自動保留，見 game-engine.ts 檔頭）：
抽取不做「攤開選留」UI；金條攤開挑選不做（金條仍可抽取、終局仍折生命）；
交易仍是自由階段一物換一物，不在結算內重跑交易步驟；容量以剩餘負重計
（次元口袋在剩 ≥1 點額度時無限）；暗影死前生命取致死傷害前的值
（單人版 JS 在歸零後才記錄，實質永遠是 0）；AI 政策基因總和 11 點
（與單人版 startingGenes 一致，非人類的 10 點）。

未做（超出本次範圍）：登入牆、帳號系統、信譽分、觀戰、成就戰績、
行動順序卡（多人版全員提交後一次結算，不分先後）。

公開視圖新增欄位：`gassedFloors`、`poolCounts`（各房剩餘張數）、
`airdropCount`、`usedPileCount`、`discardCount`、`lastGasTally`；
舊的 `lootedRooms`／`morgueCount` 已移除（改由物資池呈現）。

## 為什麼需要惰性推進

serverless function 沒有長駐記憶體與計時器，原本由請求觸發的 AI 動作
（自由階段用藥＋準備、行動階段自動提交、全員到齊結算）改成每次請求
先跑一遍 `lazyAdvance`，全部做成冪等：

- `aiFreePhase` 只對尚未 ready 的 AI 用藥——Express 版只在自由階段入口
  呼叫它（此時 AI ready 皆為 false），用 `!ready` 守衛就能完全重現該語意，
  避免每次輪詢都重複消耗藥品。
- `maybeAdvanceToAction`／`autoAiActions`／`maybeSettle` 本來就是條件觸發，
  重複跑是 no-op；結算後進入新自由階段時同樣補跑一次 `aiFreePhase`。

## 並行安全

寫回用 `UPDATE ... WHERE code = $1 AND version = $3`，搶輸時重讀重試
（最多 3 次，否則回 409 請前端再試一次）。房間表：

```sql
facility_rooms(code TEXT PRIMARY KEY, state JSONB NOT NULL,
               version INT NOT NULL DEFAULT 1,
               updated_at TIMESTAMPTZ NOT NULL DEFAULT now())
```

資料表用 lazy 建立：查詢時若報 relation 不存在就建表後重試一次，
不需要手動建表，也不需要新增 cron（Vercel Hobby cron 名額已用完）。
過期房間：讀取時若建立超過 12 小時就刪除（與 Express 版相同規則），
建房時順手清掉 12 小時未更新的舊房間。

## 重建打包輸出

```sh
node facility-server/build.mjs
# → 產生 api/games/[...all].mjs（單一自包含檔案，要 check-in）
```

esbuild 取得順序：已安裝的 esbuild 套件 → `astro/node_modules/esbuild`
（astro 的 vite 會帶 esbuild，astro 依賴裝過就有）→ `ESBUILD_BIN` 環境變數。
改完 `facility-server/*.ts` 一定要重跑打包並把輸出一起 commit，
否則部署跑的還是舊版。

## 部署檢查清單

1. **Vercel 專案必須設定 `DATABASE_URL`**（Neon 連線字串，指向與 catchall
   相同的資料庫即可）。未設定時所有 /api/games/* 回 503。
2. **路由優先順序**：`api/games/[...all].mjs`（含靜態段 `games`）比
   `api/[...catchall].mjs`（全動態）更具體，依 Vercel filesystem 路由規則
   應優先匹配 /api/games/*，不需要動 catchall。**上線後第一件事就是驗證**：
   `POST /api/games/rooms` 應回 201 且回應含房間資料；若被 catchall 吃掉
   （回 catchall 的 not found），fallback 是在 catchall TABLE 加一支
   games row（當初就是為了這個才留 fallback 方案，不要硬改 vercel.json）。
3. **首跑建表**：第一次請求會自動建 `facility_rooms` 表，確認 Vercel 用的
   資料庫帳號有建表權限。
4. **冷啟動**：Neon compute 休眠喚醒＋function 冷啟動時，第一次請求可能
   較慢（數秒），前端輪詢會自動重試，屬正常現象。
5. **不要把連線字串寫進程式碼**：本目錄所有檔案都只讀
   `process.env.DATABASE_URL`，絕對不要學 catchall 的寫死 fallback。

## 驗證

```sh
# 打包測試 harness（假 Neon，不連真資料庫）
esbuild facility-server/test-harness.ts --bundle --platform=node --format=esm \
  --outfile=/tmp/facility-harness.mjs
node /tmp/facility-harness.mjs
# 預期：引擎單元檢查（傳送／繩索／停機坪）→建房→加入→配點→開始
# （AI 補滿 4 人、政策出生點、物資池）→並行準備→第 1 天結算
# （1F 中毒、房主扣毒氣 1 血）→第 2 天結算（水塔抽水、上繳、毒氣、
# 空投）→錯誤路徑、token 隔離、樂觀鎖、過期清理→跑滿 6 回合終局排名，
# 全部 PASS。
```
