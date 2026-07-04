# LINE Bot 設計文件 — ddd-src 作品集專屬

> 目的：把 `https://donttalk.vercel.app` 的 7 大核心主題做成可在 LINE 直接查詢的 bot，面試時展示「跨平台互動設計」能力。

---

## 1. 角色定位

**不像客服，像 demo 入口**：
- 訪客加 LINE → 看到作品集導覽選單
- 每個作品都有「互動 demo」入口（用 Flex Message 模擬網頁互動）
- 一鍵跳轉網頁看完整版

**面試展示價值**：
- 串接 `api-server-src` 既有 API（markets / stock / filters / rebalance）
- 新增「protein / gene / ngs / thesis」 4 個新 API
- 展示：Flex Message UX、webhook 安全、cache、rate limit、推播

---

## 2. 主選單（Flex Message 輪播）

用戶加好友 → 收到「作品集入口」Flex Carousel：

```
┌─────────────────────────┐
│ 🧬 蛋白質 AI 設計        │
│ ESM-2 + ProteinMPNN     │
│        [ 進入 ]          │
└─────────────────────────┘
┌─────────────────────────┐
│ 🔬 基因 AI 平台          │
│ CRISPR + 啟動子設計       │
│        [ 進入 ]          │
└─────────────────────────┘
┌─────────────────────────┐
│ 📊 NGS 定序工作站         │
│ QC + 深度估算             │
│        [ 進入 ]          │
└─────────────────────────┘
┌─────────────────────────┐
│ 📈 台股均線訊號            │  ← 既有
│ MA20/MA60 即時           │
│        [ 進入 ]          │
└─────────────────────────┘
┌─────────────────────────┐
│ 🧪 ProteinMPNN 互動      │
│ 即時序列設計              │
│        [ 進入 ]          │
└─────────────────────────┘
┌─────────────────────────┐
│ 📖 論文 / 部落格           │
│ 研究筆記                  │
│        [ 進入 ]          │
└─────────────────────────┘
```

每張卡片底部加：「完整版 👉 donttalk.vercel.app」

---

## 3. 指令系統

### 全域指令
| 指令 | 行為 |
|---|---|
| `help` / `說明` | 顯示所有指令（Carousel） |
| `menu` / `選單` | 回主選單 |
| `about` / `關於` | 開發者簡介 + 連結 |
| `works` / `作品` | 作品總覽（連結） |
| `interview` / `面試` | 模擬面試問答入口 |
| `contact` / `聯絡` | 寄信 / 加 LINE OA 連結 |
| `site` | 網站地圖 |

### 主題子指令

#### 🧬 蛋白質 AI（`protein`）
- `protein` → 摘要 + 連結
- `esm <seqA>` / `esm <seqA> vs <seqB>` → ESM-2 相似度（呼叫 HF Space）
- `mpnn <pdb_id>` → 取得 ProteinMPNN 設計序列
- `fitness <sequence>` → 簡易 fitness 估算

#### 🔬 基因 AI（`gene`）
- `gene` → 摘要
- `crispr <guide_seq>` → off-target 評分
- `promoter <seq>` → 啟動子強度預測
- `variant <gene> <mutation>` → 變異效應

#### 📊 NGS（`ngs`）
- `ngs` → 摘要
- `depth <samples> <coverage>` → 計算建議讀序數
- `qc <fastq_url>` → QC 摘要（呼叫既有 API）

#### 📈 台股（`stock`）← 既有
- `<4-6碼股號>` → 個股查詢（K線 + MA）
- `scan` → 全市場掃描
- `subscribe` / `unsubscribe` → 推播訂閱
- `watchlist` → 自選股
- `rebalance <portfolio>` → 投資組合再平衡建議

#### 🧪 ProteinMPNN 互動（`mpnn`）
- `mpnn` → 互動教學
- `mpnn demo <pdb>` → 取得序列設計回傳連結到互動頁

#### 📖 論文 / 部落格（`blog`）
- `blog` → 最新 3 篇標題 + 連結
- `blog <關鍵字>` → 搜尋部落格

#### 💼 面試（`interview`）
- `interview start` → 隨機出 1 題模擬面試
- `interview hint` → 提示
- `interview answer` → 看參考答案

---

## 4. 推播系統

### 既有（保留）
- `scan_and_push_line` 每日 09:00 推播台股掃描結果

### 新增
| Job | 時間 | 對象 |
|---|---|---|
| `protein_paper_push` | 週一 09:00 | 訂閱者：最新 arXiv 蛋白質 AI 論文摘要 |
| `ngs_best_practice` | 週三 09:00 | 訂閱者：NGS 最佳實務小知識 |
| `blog_weekly` | 週五 09:00 | 訂閱者：當週新文章 |
| `interview_daily` | 每日 20:00 | 訂閱者：每日一題面試 |

### 訂閱分類
- 沿用 `lineSubscribersTable`，加 `topics text[]` 欄位（Postgres array / JSON 序列化）
- 預設全訂閱，可輸入 `topic stock` / `topic protein` 等開關

---

## 5. 技術架構

```
LINE Webhook (POST /line/webhook)
    ↓
[existing router] 簽章驗證 → rate limit → 派發
    ↓
┌─────────────────────────────────────┐
│  handlers/                          │
│    ├─ menu.ts          (主選單)     │
│    ├─ protein.ts       (蛋白質 AI)  │
│    ├─ gene.ts          (基因 AI)    │
│    ├─ ngs.ts           (NGS)        │
│    ├─ stock.ts         (台股, 既有) │
│    ├─ mpnn.ts          (互動)       │
│    ├─ blog.ts          (部落格)     │
│    ├─ interview.ts     (面試)       │
│    └─ help.ts          (說明)       │
│                                     │
│  flex/                              │
│    ├─ menuCarousel.ts              │
│    ├─ topicCard.ts                 │
│    ├─ stockCard.ts (既有)          │
│    └─ ...                          │
│                                     │
│  api/                              │
│    ├─ protein.ts   (新)            │
│    ├─ gene.ts      (新)            │
│    ├─ ngs.ts       (新)            │
│    └─ blog.ts      (新)            │
│                                     │
│  push/                              │
│    ├─ cron.ts       (排程)         │
│    └─ subscribers.ts (訂閱 CRUD)   │
└─────────────────────────────────────┘
```

### 檔案重構
- `line.ts` 拆成：
  - `routes/line.ts`（webhook 入口，目前那個）
  - `lib/line/`（client、signature、types）
  - `handlers/`（每個主題一個檔）
  - `flex/`（Flex Message templates）
  - `api/`（後端服務呼叫）

### 新增 API routes
- `routes/protein.ts`：包 HF Space API + 本地 ESM-2 推論
- `routes/gene.ts`：CRISPR + promoter + variant 查詢
- `routes/ngs.ts`：depth calculator + QC
- `routes/blog.ts`：從 Astro content collection 拿文章
- `routes/interview.ts`：隨機題庫（JSON file）+ 提示 + 答案

### DB schema 加欄位
```sql
ALTER TABLE line_subscribers ADD COLUMN topics TEXT NOT NULL DEFAULT '["stock"]';
ALTER TABLE line_subscribers ADD COLUMN display_name TEXT;
ALTER TABLE line_subscribers ADD COLUMN push_quiet_hours TEXT; -- "22:00-08:00"
```

---

## 6. 開發時程

**Phase 1 — 框架（1 天）**
- [ ] 拆 line.ts → handlers + flex + lib
- [ ] menuCarousel（主選單）
- [ ] help 指令（所有指令列表）
- [ ] 既有 stock 指令重構成 handler 形式

**Phase 2 — 主題子指令（2 天）**
- [ ] protein handler + 3 個子指令
- [ ] gene handler + 3 個子指令
- [ ] ngs handler + 2 個子指令
- [ ] mpnn / blog / interview handler 各 2 個子指令

**Phase 3 — 推播系統（1 天）**
- [ ] topics 欄位 migration
- [ ] push/subscribers.ts CRUD
- [ ] 4 個 cron job（protein_paper / ngs_tip / blog / interview）

**Phase 4 — 測試 + 上線（1 天）**
- [ ] vitest unit tests（handlers）
- [ ] webhook signature + rate limit integration test
- [ ] curl 跑全部指令
- [ ] deploy

---

## 7. 面試展示腳本（5 分鐘版）

1. **加好友** → 看到主選單 Carousel（6 張卡片）
2. **點「蛋白質 AI」** → 顯示摘要 + 「輸入 `esm MKTIIALSY vs MRIIALSY` 試試」
3. **輸入** → 即時 ESM-2 相似度（呼叫 HF Space）
4. **點「基因 AI」** → CRISPR guide 評分
5. **輸入 4 碼股號** → 個股 K 線 + MA20/MA60
6. **訂閱** → cron 隔天 09:00 自動推播
7. **進階**：展示 `interview start` 隨機出模擬面試題

**面試官會看到的能力**：
- Webhook 安全（簽章驗證、rate limit）
- Flex Message UX（carousel、button、postback）
- 多主題路由（dispatcher pattern）
- 排程推播（cron + topic-based 訂閱）
- 跨平台整合（LINE + HF Space + 內部 API）
- TypeScript 型別嚴謹度
- 測試覆蓋

---

## 8. 待你確認

1. **題庫來源**：`interview` 指令的題庫要用既有 `/interview` 頁面內容，還是另寫一份？
2. **blog 來源**：從 `astro/src/content/blog/` 拉，還是另外放？
3. **protein / gene / ngs API**：你已有 backend 嗎？還是要我用 mock 先跑通？
4. **推播時間**：可以預設 09:00，要改嗎？
5. **語言**：bot 全中文？部分英文（例如 `help` 保留英文）？