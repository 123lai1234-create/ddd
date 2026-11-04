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
| `accounts.ts` | 帳號服務（B 組）：註冊／訪客／恢復碼登入、信譽、戰績（見「帳號服務」） |
| `handler.ts` | 十二支 endpoint 的完整移植＋惰性推進（見下）＋帳號／觀戰／棄權 |
| `vercel-entry.ts` | Vercel function 入口（Web Request/Response，與 catchall 同簽名） |
| `test-harness.ts` | 本機端到端 harness（假 Neon，見「驗證」） |
| `../api/games/[...all].mjs` | 打包輸出（要 check-in，部署時直接用這支） |

## API（與 Express 版相同）

```
POST /api/games/rooms                    建房 → 201 { code, playerId, token, room }
POST /api/games/rooms/:code/join         加入（大廳階段）→ 201 { playerId, token, room }
GET  /api/games/rooms/:code?token=…      查狀態（前端每 2 秒輪詢）
POST /api/games/rooms/:code/setup        配點＋出生點
POST /api/games/rooms/:code/start        房主開始（AI 補滿 8 人）
POST /api/games/rooms/:code/ready        自由階段準備
POST /api/games/rooms/:code/action       行動階段提交路徑＋毒樓層投票＋控制室／操作室／火箭筒／結算用道具／結算內交易提案
POST /api/games/rooms/:code/keep         選留階段提交攤開選留（超量整筆拒絕，可重選）
POST /api/games/rooms/:code/gold-pick    自由階段金條攤開挑選（花 1 張金條換當前房物資一項）
POST /api/games/rooms/:code/use-item     自由階段用消耗品（藥片／酒／腎上腺素／回收機）
POST /api/games/rooms/:code/trade        自由階段發起交易（對 AI 立刻自動回覆）
POST /api/games/rooms/:code/trade/respond 自由階段回覆交易（含結算內交易轉成的待回覆）
POST /api/games/rooms/:code/spectate     觀戰加入（任何階段皆可，只讀，不佔玩家名額）
POST /api/games/rooms/:code/quit         棄權（大廳直接離開不扣分；對局中改 AI 託管並扣分）
POST /api/games/accounts/register        註冊（顯示名稱＋密碼，≥4 字元；回傳恢復碼一次）
POST /api/games/accounts/guest           訪客登入（顯示名稱可留空自動產生；亦回傳恢復碼一次）
POST /api/games/accounts/login           密碼登入（訪客帳號無密碼，請用恢復碼）
POST /api/games/accounts/recover         恢復碼登入（發新 session token）
GET  /api/games/accounts/me?accountToken=… 個人檔案＋戰績（只含公開欄位）
POST /api/games/accounts/logout          登出（刪 session 列）
GET  /api/games/accounts/google          Google 登入起始（未設憑證回 501；已設則 302 導向 Google 授權頁）
GET  /api/games/accounts/google/callback Google 登入回呼（授權碼換 token、取 userinfo、建／找帳號後導回遊戲頁）
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
操作室重配、基因庫三項 +1、激光室、停機坪空投（每回合 1 張、最多帶 1 張）、
抽取攤開選留（垃圾場垃圾強制帶走、非垃圾最多 2 件、停機坪最多 1 張）、
金條攤開挑選（花 1 張換當前房物資一項，不能挑金條、垃圾場禁用、
只剩金條空手不扣金條、終局仍 1:1 折生命）、行動順序（回合開始洗牌，
上繳／道具使用按順序跑，移動 log 也按順序）、結算內交易（見下）。

多人輪詢下的改寫（結算不能卡住等某人，見 game-engine.ts 檔頭）：
- 抽取選留是獨立 keep 階段：結算步驟 0 只移動＋攤開，有人類待選留時
  結算暫停在 keep 階段；人類在面板選留（超量整筆拒絕，可重選），
  AI 立刻用伺服器自動保留貪心規則解掉，60 秒逾時（KEEP_TIMEOUT_MS，
  每次請求惰性檢查）未選者也自動保留，之後才跑後續步驟。
  停機坪沒選的空投卡留在空投池（同回合後到的人還能挑）；一般房沒選
  的進棄置堆。選留期間抽到的道具尚未進背包，故不影響後續戰鬥／上繳。
- 金條挑選只在自由階段（對應單人版行動前在當前房換物）；AI 在自由
  階段持有金條且當前房有可換物時，換價值最高的一種（單人版 bots 按
  政策 KEEP_PRIORITY，這裡簡化為統一價值表）。
- 結算內交易（單人版 resolveTrades 確實有此步驟，結算第一步、按
  state.order 跑、趕在水糧上繳之前）：行動提交可附 trade，結算時按
  行動順序跑，AI 對象用 aiAcceptTrade 即判；人類對象無法在結算內
  等回覆，改轉成自由階段待回覆交易（下一自由階段用既有 trade/respond
  回覆，成交才轉移；跨日未回覆會在下一結算被清掉）。自由階段
  一物換一物交易仍保留（即時路徑）。
- 行動順序：單人版 startRound 洗牌（Fisher-Yates）移植為進行動階段時
  洗牌，log 公布順序卡，前端顯示順序；結算仍在一次請求內跑完（不是
  逐人分次請求），但各步驟按順序逐步記 log——戰鬥按房間跑，與單人版同。
- 容量以剩餘負重計（次元口袋在剩 ≥1 點額度時無限）；暗影死前生命取
  致死傷害前的值（單人版 JS 在歸零後才記錄，實質永遠是 0）；AI 政策
  基因總和 11 點（與單人版 startingGenes 一致，非人類的 10 點）；
  玩家上限 8 人，出生點只有 6 個，AI 出生點取人最少的（不足時循環共用）。

未做（超出本次範圍）：
AI 主動在行動階段提結算內交易（AI 只回覆，不主動提案）。

## 帳號服務（B 組，2026-11-03）

前端 `/facility-survival` 先出登入／註冊面板才顯示建房／加入：
顯示名稱帳號（密碼登入）＋訪客帳號（免密碼建立，訪客就是登入的一種）
＋恢復碼登入。恢復碼只在建立時回傳一次明文（前端只顯示一次並提示抄下），
伺服器只存 `鹽＋SHA-256 雜湊`（`salt$hash`），session token 也只存雜湊；
個人面板與房間內公開檔案只含信譽、場次、勝負、成就，絕不含雜湊與 token。

新表（皆 lazy 建表，與 `facility_rooms` 同一資料庫）：

```sql
facility_accounts(id TEXT PRIMARY KEY, display_name TEXT NOT NULL, kind TEXT NOT NULL,
  password_hash TEXT, recovery_hash TEXT, reputation INT DEFAULT 100,
  cooldown_until BIGINT DEFAULT 0, created_at BIGINT NOT NULL)
facility_sessions(token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, created_at BIGINT NOT NULL)
facility_records(account_id TEXT PRIMARY KEY, games INT DEFAULT 0, wins INT DEFAULT 0,
  losses INT DEFAULT 0, best_final_hp INT DEFAULT 0, achievements JSONB DEFAULT '[]')
```

信譽與冷卻（具體數值，見 `accounts.ts` 常數）：
預設 100；對局中棄權 −10 分且改 AI 託管（房主棄權時房主轉給下一位非 AI 玩家），
每房第一位棄權者冷卻 15 分鐘（冷卻中不能建房／加入新房間）；大廳棄權不扣分。
逾時託管（輪詢惰性檢查，無長駐計時器）：選留逾時 60 秒自動保留、行動階段逾時 180 秒由 AI 代打；
行動與選留逾時共用累積次數，累積 2 次改 AI 託管並 −5 分。房型門檻：娛樂 80 分、競技 90 分，
建房時選房型（預設娛樂）；競技房必須有帳號（訪客亦可）且達門檻，
未達門檻建／加入皆回 403 並說明目前分數。

觀戰：房間碼＋觀戰模式加入，進 `room.spectators`（不佔 8 名玩家名額），
輪詢回只讀視圖（`isSpectator: true`，不含任何玩家背包）；觀戰 token 打
setup／start／ready／action／keep／gold-pick／use-item／trade／trade-respond
一律 403，觀戰 quit 只是離開觀戰。

成就與戰績：對局結束（`status` 變 `finished`）後，handler 在房間寫回成功後
才寫入帳號戰績（`recordsWritten` 防重複寫入；寫入失敗不擋遊戲回應，
但因旗標已寫入故不會重試——見下方簡化說明）：場次＋1、排名第 1 為勝、
成就 `finisher`（完賽）／`survivor`（存活到終局）／`champion`（冠軍）／
`first_game`（首場）／`veteran`（滿 5 場）。房間內公開檔案是 handler 每次請求
刷新的快照（`accountProfile`），只含公開欄位；個人面板（`/accounts/me`）為即時值。

Google OAuth（授權碼流程，不寫假憑證）：`GET /api/games/accounts/google`
未設定憑證時回 501；已設定時 302 導向 Google 授權頁（scope 只有
`openid email profile`），state 為隨機值存 `facility_oauth_states`
（10 分鐘過期、用完即刪）。`GET /api/games/accounts/google/callback`
用授權碼向 Google 換 token、取 userinfo（只要 email 與 name），依 email
找／建立帳號（display_name 取 Google name、kind 為 named、密碼留空、
新帳號恢復碼仍發一次、只存雜湊），建立 session 後導回
`/facility-survival?accountToken=…`（新帳號另帶 `googleRecoveryCode`，
前端顯示一次後清掉網址參數、不存 localStorage）；失敗時導回
`?google_error=denied|expired|invalid|token_failed|userinfo_failed|
account_failed|not_configured`，前端對照成中文訊息。
接通前站長需在 Google Cloud 建立 OAuth 憑證並設定環境變數
`GOOGLE_CLIENT_ID`／`GOOGLE_CLIENT_SECRET`（絕不寫進程式碼或 commit）；
redirect URI 必須登記為 `https://donttalk.vercel.app/api/games/accounts/google/callback`
（與程式預設值一致），JavaScript 來源為 `https://donttalk.vercel.app`。
Consent screen：測試模式只要把自己加進測試使用者即可先用；要公開給
所有人用才需要走 Google 審核（較久）。路由注意：callback 是三段路徑，
`api/games/accounts/google/callback.mjs` 由 build.mjs 明確輸出（不要動 catchall）。
測試用環境變數（正式環境不要設）：`GOOGLE_TOKEN_ENDPOINT`／
`GOOGLE_USERINFO_ENDPOINT`（harness 注入假端點用）、`GOOGLE_REDIRECT_URI`、
`GOOGLE_OAUTH_STATE_TTL_MS`（harness 測過期用）。

舊版相容（不要讓舊版前端直接 401 死掉）：只有房間 token、沒有帳號的舊流程
仍可建房／加入娛樂房／輪詢／行動（房間 token 驗證完全不動）；競技房才要求帳號。
建房／加入時若帶了已失效的 `accountToken`，不回 401，改以未登入身分繼續並在
回應附 `accountNote`，指引重新登入（訪客亦可）以保留戰績。未登入者走新版前端時
只能先以訪客帳號登入進遊戲，登入面板就是唯一入口。

簡化與未完成（不要假裝全做完）：
- 行動階段逾時以輪詢惰性檢查實作（180 秒，見 ACTION_TIMEOUT_MS）：只有玩家輪詢／操作時才會觸發代打，
  不是真正的即時計時器；自由階段目前沒有逾時計時器（全員按準備才進行動階段）。
- 世界列表 `GET /api/games/world` 只列大廳／進行中房間公開摘要；回顧頁顯示帳號累計戰績（非逐局重播）；
  Google 新帳號首次回呼即登入、恢復碼另外顯示一次（不再要第二點才登入）。
- 即時通訊仍是 2 秒輪詢，不是 socket.io：Vercel serverless 無長駐連線，換 socket 需另架即時伺服器，
  本次未改架構。
- 棄權冷卻只給每房第一位棄權者；第二位起只扣分不冷卻。
- 戰績／懲罰寫入在房間寫回成功後才跑（避免樂觀鎖重試重複扣分），若當次帳號表
  寫入失敗，該筆戰績／懲罰不會重試（房間旗標已寫入）。
- 訪客帳號無密碼，只能用恢復碼找回；恢復碼遺失即無法找回該訪客帳號（與
  顯示名稱帳號相同，伺服器沒有明文可查）。
- 前端帳號面板、房型選擇、觀戰、棄權按鈕只通過 `astro build`（34 頁），
  未在本機實機點按驗證（無真實 Neon 與瀏覽器實測）；後端行為以假 Neon harness 為準。
- Google OAuth 流程已實作，但真實憑證與 Vercel 環境變數尚未設定（見上）；上線後需實測一次真實 Google 登入。

公開視圖新增欄位：`gassedFloors`、`poolCounts`（各房剩餘張數）、
`airdropCount`、`usedPileCount`、`discardCount`、`lastGasTally`、
`settlementOrder`（本回合行動順序卡）、`pendingDrawPlayerIds`（待選留玩家）、
`pendingDraw`（只有自己的待選留內容＋選項與規則）、`goldOptions`
（自由階段自己持有金條時，當前房可換的非金條種類）；
舊的 `lootedRooms`／`morgueCount` 已移除（改由物資池呈現）。

## 為什麼需要惰性推進

serverless function 沒有長駐記憶體與計時器，原本由請求觸發的 AI 動作
（自由階段用藥＋準備、行動階段自動提交、全員到齊結算）改成每次請求
先跑一遍 `lazyAdvance`，全部做成冪等：

- `aiFreePhase` 只對尚未 ready 的 AI 用藥——Express 版只在自由階段入口
  呼叫它（此時 AI ready 皆為 false），用 `!ready` 守衛就能完全重現該語意，
  避免每次輪詢都重複消耗藥品。AI 金條換物也在同一次 pass 內做一次。
- `maybeAdvanceToAction`／`autoAiActions`／`maybeSettle` 本來就是條件觸發，
  重複跑是 no-op；結算後進入新自由階段時同樣補跑一次 `aiFreePhase`。
- `maybeResolveKeepTimeout`：每次請求先檢查 keep 階段是否逾時（60 秒），
  逾時就自動保留全部待選留並跑完後半段結算；未逾時則什麼都不做，
  結算繼續停在 keep 階段等玩家選留。

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
# → 產生 api/games/[...all].mjs 並複製到 rooms 各深度檔與
#   api/games/accounts/[action].mjs（帳號路由 2 段，同理需要明確檔案路由）
#  （單一自包含檔案，要 check-in）
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
# （AI 補滿 8 人、政策出生點＋循環共用、物資池）→並行準備→行動順序
# （8 張順序卡、移動 log 按順序）→第 1 天結算（1F 中毒 4 票、房主
# 落地戰鬥 1 血＋毒氣 1 血）→第 2 天（空房＋停機坪選留：超量被拒、
# 選留成功、上繳）→錯誤路徑、token 隔離、樂觀鎖、過期清理→跑滿
# 6 回合終局排名（8 人）→垃圾場選留＋逾時自動保留→大倉庫選留
# （超量被拒、選留成功）→金條挑選（不能挑金條、只剩金條空手、
# 挑中、垃圾場禁用）→8 名真人房（第 9 名被拒、開局無 AI）
# →帳號服務（註冊／登入／恢復碼／訪客／Google OAuth／me 不洩雜湊）
# →信譽門檻（競技 90／娛樂 80）→觀戰（只讀、行動 403、不佔名額）
# →棄權與冷卻（對局棄權 AI 託管 −10、首位冷卻 15 分鐘、大廳不扣分）
# →戰績寫入與同房公開顯示＋舊 token 相容（不 401 死路）
# →多次選留逾時託管（第 2 次改 AI、−5 分），共 138 項全部 PASS。
```
