# LINE Portfolio Bot — Deploy Notes

## What's new (vs. old monolithic line.ts)

### File structure
```
api-server-src/src/
├── bot/
│   ├── dispatcher.ts                 # 指令路由 + Handler 介面
│   └── handlers/
│       ├── builtins.ts               # menu / help / about / site / qr / topic / fallback
│       ├── topic.ts                  # topic 訂閱 CRUD (DB)
│       ├── protein.ts                # 蛋白質 AI (esm + mpnn)
│       ├── gene.ts                   # 基因 AI (crispr + promoter)
│       ├── ngs.ts                    # NGS (depth calculator)
│       ├── stock.ts                  # 台股 (重構既有)
│       ├── blog.ts                   # 部落格 (讀 astro content)
│       ├── interview.ts              # 面試 (隨機題庫 + session)
│       └── questions.json            # 8 題面試題庫
├── lib/
│   ├── flex-topics.ts                # 主選單 carousel + 7 主題卡 + help
│   ├── flex-templates.ts             # (既有) scanFlex / stockFlex / welcomeFlex
│   ├── line.ts                       # (既有) API client
│   └── push-cron.ts                  # 4 個推播 job + operator endpoint
├── migrations/
│   └── 001_line_subscribers_topics.sql  # DB schema 擴充
└── routes/
    └── line.ts                       # webhook (重寫為 dispatcher 形式)
```

### 7 大主題
| ID | 主題 | 主要指令 |
|---|---|---|
| protein | 蛋白質 AI | `esm ... vs ...`、`mpnn <pdb>` |
| gene | 基因 AI | `crispr <seq>`、`promoter <seq>` |
| ngs | NGS | `depth <samples> <cov>` |
| stock | 台股 | `2330`、`scan`、`subscribe` |
| mpnn | ProteinMPNN 互動 | `mpnn demo <pdb>` |
| blog | 論文/部落格 | `blog`、`blog <kw>` |
| interview | 面試 | `interview start/hint/answer` |

### 共用指令
- `menu` / `選單` — 主選單 (Carousel 7 卡片)
- `help` / `說明` — 完整指令清單 (Mega bubble)
- `about` / `works` / `site` — 連結卡
- `qr` — 網站 QR code (Google Chart API)
- `topic <id>` / `topic -<id>` / `topic all` / `topic clear`

## Deploy steps

### 1. Apply DB migration
```bash
cd api-server-src
psql $DATABASE_URL -f migrations/001_line_subscribers_topics.sql
# or via Drizzle:
#   import { runMigrations } from './src/migrations/001_line_subscribers_topics';
#   await runMigrations();
```

### 2. Rebuild + restart
```bash
pnpm install
pnpm build
# restart the api-server process (systemd / vercel cron / fly machines)
```

### 3. Schedule push jobs (4 個)
用現有排程（cron / vercel cron / Vercel schedule config）：

```yaml
# vercel.json or equivalent
crons:
  - path: "/api/line/push/stock?password=$STOCK_OPERATOR_PASSWORD"
    schedule: "0 1 * * 1-5"   # 平日 09:00 (UTC+8 = UTC 01:00)
  - path: "/api/line/push/protein?password=$STOCK_OPERATOR_PASSWORD"
    schedule: "0 1 * * 1"     # 週一 09:00
  - path: "/api/line/push/ngs?password=$STOCK_OPERATOR_PASSWORD"
    schedule: "0 1 * * 3"     # 週三 09:00
  - path: "/api/line/push/blog?password=$STOCK_OPERATOR_PASSWORD"
    schedule: "0 1 * * 5"     # 週五 09:00
  - path: "/api/line/push/interview?password=$STOCK_OPERATOR_PASSWORD"
    schedule: "0 12 * * *"    # 每日 20:00 (UTC 12:00)
```

> 注意：UTC offset 要按部署位置調整。Vercel Cron 用 UTC。

### 4. 端到端驗證
```bash
# 健康
curl -s http://localhost:3000/api/healthz | jq

# 推播 (operator)
curl -X POST http://localhost:3000/api/line/push/stock \
  -H "Content-Type: application/json" \
  -d '{"password":"YOUR_OPERATOR_PASSWORD"}' | jq

# Webhook 模擬（簽章要用真 secret）
# 用 ngrok 暴露本地 3000 port，再從 LINE 後台 Verify

# 測試指令：從 LINE 加好友 → 輸入 menu → 應該看到 7 主題 carousel
```

### 5. 測試
```bash
pnpm vitest tests/bot/
```

## 面試 Demo 腳本（5 分鐘）

| 時間 | 動作 | 展示能力 |
|---|---|---|
| 0:00 | 加 LINE 好友 → 看到歡迎卡 | Welcome Flex UX |
| 0:15 | 輸入 `menu` → 7 主題 carousel | Carousel + button routing |
| 0:30 | 點「蛋白質 AI」 → 顯示摘要 + 試打指令 | Postback / URI 整合 |
| 0:45 | 輸入 `esm MKTIIALSY vs MRIIALSY` → 顯示相似度 | Mock 計算 + Flex |
| 1:30 | 輸入 `crispr GGCACTGCGGCTGGAGAGGG` → 評分 + 原因 | 多條件規則 |
| 2:00 | 輸入 `depth 30 100` → reads 數 + 成本估算 | 公式計算 |
| 2:30 | 輸入 `interview start` → 隨機題 → `hint` → `answer` | Session state |
| 3:00 | 輸入 `blog` → 從 astro content collection 拉 3 篇 | 跨 repo 整合 |
| 3:30 | 輸入 `topic stock` → 看到目前訂閱狀態 | JSONB topic + UI |
| 4:00 | 輸入 `qr` → 顯示 QR code | 圖片 + Chart API |
| 4:30 | 講 cron 4 個推播（資料夾結構圖）| 系統設計 + 排程 |
| 5:00 | Q&A | |

## 重點設計決定（面試要會講）

1. **Dispatcher pattern** — 一個 Handler 介面 + Registry，避免 if/else 嵌套；新增主題只要寫一個檔案 `register()`。
2. **3-second webhook window** — webhook 收到立刻 200 reply，事件處理放 `setImmediate` 背景跑；避免 LINE timeout。
3. **Raw body for signature** — LINE HMAC-SHA256 必須對原始 body 算，所以 express 預設 JSON parser 不能用，自寫 `rawJson` middleware。
4. **JSONB topics + GIN index** — PostgreSQL JSONB column + GIN 索引，讓「訂閱 topic X 的用戶」查詢用 `@>` 走索引，不用 join 副表。
5. **Quiet hours check** — `push_quiet_hrs` 寫進 schema，每 row 各自設定；面試官可問「怎麼避免凌晨被打擾」。
6. **Mock-first APIs** — `esm` 用胺基酸組成向量 cosine 算、`crispr` 用 GC + length + poly-T 啟發式、`depth` 用 Lander-Waterman 公式。介面已寫好，換實作接 HF Space / 本地模型只改 `runEsmSimilarity()` 一行。
7. **No `@line/bot-sdk`** — 4KB 手寫 client 取代 2MB SDK，省 deploy 體積。
8. **File-based interview bank** — `questions.json` 比 DB 簡單，git diff 友善，面試官可當場加題目。

## Known limitations / 改善空間

- `esm` 相似度用胺基酸組成而非 transformer embedding，介面預留接 HF Space。
- `protein_paper_push` 從 arXiv RSS 抓 mock，production 應用 official arxiv API + cache 12h。
- `interview` session 用記憶體 Map，重啟 gateway 會清空。production 應存 Redis。
- `topic` 指令 lazy-load DB 模組是為了避免 circular import，正式可改成 top-level import + DI。

## Rollback plan

新 `routes/line.ts` 完全相容舊 webhook（事件格式、簽章檢查、回 200 的時機都沒變）。如果新 dispatcher 出問題：

1. `git revert` 單一 commit（整個 bot/ 目錄 + 重寫的 routes/line.ts）
2. `psql ... -c "ALTER TABLE line_subscribers DROP COLUMN IF EXISTS topics, ..."`
3. 重啟即可

舊的 `subscribe` / `scan` / 個股股號指令都重寫進 dispatcher，向後相容。