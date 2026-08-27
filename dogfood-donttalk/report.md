# donttalk.vercel.app — Bug 報告

**測試時間:** 2026-06-10
**測試範圍:** 全站 22 個頁面 routes + 靜態資源 + sitemap/robots/manifest
**測試方法:** curl HTTP status、HTML body 對照、URL/route 矩陣比對

---

## 🚨 Executive Summary

| 嚴重度 | 數量 | 狀態 |
|---|---|---|
| **Critical** | 1 | 整站 22 個 page routes 全數回 404 |
| High | 3 | sitemap 與實際可用的 routes 不一致 / `index.html` redirect loop / manifest 指向不存在的 `.html` 連結 |
| Medium | 2 | sitemap 缺漏多個現有頁面 / robots Disallow 路徑與現況不符 |
| Low | 2 | _assets cache header 缺漏 / `<link rel="icon">` 與 sw.js cache 版本不齊 |

**整個 donttalk.vercel.app 在生產環境目前是壞的:** 打開 `https://donttalk.vercel.app/` 只看到 Vercel 預設 404 頁 (`"The page could not be found"`),22 條 page routes 全部回 404。**唯一能用**的是 `/games/xian/` 跟靜態資源 (`favicon.ico`、`styles/*.css`、`manifest.json` 等)。

---

## Critical Bug

### 🚨 BUG-001 — Production 上 22 個 page routes 全部 404

**URL:** `https://donttalk.vercel.app/` 與所有子頁面
**嚴重度:** Critical
**類別:** Functional / Deployment

#### 重現步驟

1. 在瀏覽器打開 `https://donttalk.vercel.app/`
2. 觀察到 Vercel 預設 404 頁面 (`"The page could not be found / NOT_FOUND / sin1::..."`)
3. 試任何 subpath:`/about_me`、`/works`、`/thesis`、`/gene-ai`、`/stem-cell`、`/music`、`/stock`、`/interview`、`/interactive-showcase`、`/video-gen`、`/seo-accessibility` 等 → 全部 404

#### 驗證資料 (curl 結果)

| URL | HTTP | size |
|---|---|---|
| `/` | **404** | 79 B |
| `/index.html` | 308 → `/` | 15 B → 404 |
| `/about_me` | **404** | 79 B |
| `/works` | **404** | 79 B |
| `/thesis` | **404** | 79 B |
| `/gene-ai` | **404** | 79 B |
| `/protein-mpnn` | **404** | 79 B |
| `/stem-cell` | **404** | 79 B |
| `/music` | **404** | 79 B |
| `/stock` | **404** | 79 B |
| `/interview` | **404** | 79 B |
| `/interactive-showcase` | **404** | 79 B |
| `/video-gen` | **404** | 79 B |
| `/seo-accessibility` | **404** | 79 B |
| `/xian-godot` | **404** | 79 B |
| `/games/xian/` | **200** ✅ | 15,411 B |
| `/favicon.ico` | 200 | 655 B |
| `/robots.txt` | 200 | 119 B |
| `/sitemap.xml` | 200 | 906 B |
| `/manifest.json` | 200 | 1,165 B |
| `/styles/polish.css` | 200 | 23,040 B |
| `/styles/shared.css` | 200 | 9,271 B |
| `/styles/dynamic.css` | 200 | 14,906 B |
| `/styles/index.css` | 200 | 29,934 B |
| `/styles/stem_cell.css` | 200 | 10,493 B |
| `/styles/works.css` | 200 | 13,965 B |
| `/styles/gene_ai.css` | 200 | 39,259 B |

#### 預期 vs 實際

- **預期:** Astro SSG 預渲染的 22 個頁面在 `/` 與各 cleanUrl 路徑回 200 + 完整 HTML
- **實際:** 22 個 page routes 全部走 Vercel 預設 404 fallback (`"The page could not be found"` body, 79 bytes)

#### 根因分析 (deployment pipeline 錯誤)

本地 build artifacts 完整:

```
astro/dist/
├── index.html              (32,504 B, sha=236a8854…) ✅
├── about/index.html        ✅
├── about_me/index.html     ✅
├── works/index.html        ✅
├── thesis/index.html       ✅
├── gene-ai/index.html      ✅
├── stem-cell/index.html    ✅
├── music/index.html        ✅
├── ... 25 個子頁面都有 index.html
├── styles/                 ✅
├── scripts/                ✅
└── _assets/                ✅
```

`astro/.vercel/output/static/index.html` 跟 `astro/dist/index.html` **完全一致** (sha256 相同)。

**根因: `vercel.json` 把 `outputDirectory` 寫錯了。**

```json
// vercel.json (repo root) — 現況
{
  "outputDirectory": "astro/dist",   // ← 錯!直接指原始 dist
  "framework": "astro",
  ...
}
```

Astro 用 `@astrojs/vercel` adapter 時,build pipeline 會生成 **Vercel Build Output API v3 結構**:

```
astro/.vercel/output/
├── config.json          ← 必須要有這個,Vercel 才認得 routes
├── functions/           ← SSR serverless functions
└── static/              ← prerendered HTML + static assets
```

當 `outputDirectory: astro/dist` 直接指原始 dist,**沒有 `config.json`**,Vercel fallback 套用預設 routing:

- `cleanUrls: true` 只會處理 root-level 的 `index.html`(而它已被 `redirects: /index.html → /` 帶走,變成 308 → `/` → 404)
- 子目錄的 `about/index.html`、`works/index.html` 等因為沒 config 指引,**Vercel 不知道要把 `/about_me` 對應到 `about_me/index.html`**
- 唯一例外:`/games/xian/` 是 Vercel 透過遊戲 SPA 機制處理(或者是 pages router 撿到的)

**驗證 `config.json` 內容(本地有正確版本):**

```json
{
  "version": 3,
  "routes": [
    { "handle": "filesystem" },
    { "src": "^/_assets/(.*)$", "headers": {"cache-control": "..."}, "continue": true },
    { "src": "^/.*$", "dest": "/404.html", "status": 404 }  ← 全 fallback 到 404
  ]
}
```

問題是這份 `config.json` 在 `astro/.vercel/output/`,**Vercel 沒採到**,因為 `outputDirectory` 設定把 Vercel 導向 `astro/dist/`。

#### 修法 (兩種)

**選項 A — 修正 `outputDirectory`(推薦)**

```json
// vercel.json
{
  "outputDirectory": "astro/.vercel/output",
  ...
}
```

讓 Vercel 採到正確的 Build Output v3 artifacts(含 `config.json` + `static/` + `functions/`)。這對齊 Astro+Vercel adapter 的官方規範。

**選項 B — 改成純靜態 SPA hosting**

如果只想 host 預渲染頁面,把 `astro/vercel.json` 的 `outputDirectory` 拿掉,改成 `outputDirectory: "dist"`,並移除 `framework: "astro"`,讓 Vercel 走靜態模式。但這樣 SSR pages(/ingest、/api/og)會失效。

---

## High Severity Bugs

### ⚠️ BUG-002 — sitemap.xml 與 manifest.json 指向不存在的 URL

**URL:** `/sitemap.xml`、`/manifest.json`
**嚴重度:** High
**類別:** SEO / Functional

#### 重現

1. `curl https://donttalk.vercel.app/sitemap.xml` → 200 但內容是過期的
2. `curl https://donttalk.vercel.app/manifest.json` → 200,但 shortcuts 指向的 URL 都 404

#### 證據

**sitemap.xml 內容(摘錄):**
```xml
<url><loc>https://donttalk.vercel.app/</loc><priority>1.0</priority></url>
<url><loc>https://donttalk.vercel.app/about_me.html</loc><priority>0.9</priority></url>
<url><loc>https://donttalk.vercel.app/works.html</loc><priority>0.9</priority></url>
<url><loc>https://donttalk.vercel.app/gene_ai.html</loc><priority>0.8</priority></url>
<url><loc>https://donttalk.vercel.app/protein_mpnn.html</loc><priority>0.8</priority></url>
```

**問題:**
- sitemap 副檔名是 `.html`,但 `cleanUrls: true` + `redirects: /index.html → / (308)` 表示 `.html` URL 會被 rewrite 到無副檔名 → **目前全部 404**
- **缺漏** 16 個存在的頁面:`/thesis.html`(有列但壞)、`/firmware.html`(有列但壞)、`/ngs.html`(有列但壞)、`/interview_prep.html`(有列但壞)
- **更嚴重缺漏**:`/gene-ai.html`、`/protein-mpnn.html`、`/stem-cell.html`、`/interactive-showcase.html`、`/music.html`、`/stock.html`、`/video-gen.html`、`/xian-godot.html`、`/seo-accessibility.html`、`/interview.html`、`/report.html`、`/ingest.html` — **這 12 個新頁面都不在 sitemap 裡**
- 整個 sitemap 只有 9 條 URL,但 `astro/src/pages/` 有 22 個 .astro 檔案

**manifest.json shortcuts 指向死連結:**
```json
"shortcuts": [
  { "name": "仙俠傳 RPG", "url": "/games/xian/" },      ← 200 ✅
  { "name": "蛋白質 AI", "url": "/report.html" },       ← 308 → /report → 404 ❌
  { "name": "基因 AI 平台", "url": "/gene_ai.html" }     ← 308 → /gene_ai → 404 ❌
]
```

#### 預期 vs 實際

- **預期:** sitemap 列出所有現存頁面,使用最終對外 URL(無 `.html` 副檔名);manifest shortcuts 全部 200
- **實際:** sitemap 只有 9 條且全部 404,manifest shortcuts 中 2/3 是死連結

#### 修法

`astro/dist/sitemap.xml` 是 4 月 15 日 build,從未隨新頁面更新。`astro/dist/manifest.json` 是 6 月 5 日更新但 URL 沒對齊 cleanUrls。需在 build pipeline 加 sitemap generation (`@astrojs/sitemap` 或 pagefind 之外另寫),manifest 改用無副檔名 URL。

---

### ⚠️ BUG-003 — `redirects: /index.html → / (308)` 造成首頁 404 redirect loop

**URL:** `/index.html`
**嚴重度:** High
**類別:** Functional / Routing

#### 重現

```bash
curl -iL https://donttalk.vercel.app/index.html
```

輸出:
```
GET /index.html → 308 Location: /
GET / → 404 size=79
```

#### 根因

vercel.json 設了:
```json
"redirects": [
  { "source": "/index.html", "destination": "/", "permanent": true }
]
```

但 Vercel 部署時 `outputDirectory` 錯誤,**`/` 對應的 `index.html` 沒被採到**(應該在 `static/index.html` 但 Vercel 不知道),所以 redirect 目的地 404。修正 BUG-001 後這個 redirect 就會正常運作。

---

### ⚠️ BUG-004 — `/api/:path*` rewrite 指向 Railway 但首頁被 404 阻擋

**URL:** `https://donttalk.vercel.app/api/...`
**嚴重度:** High
**類別:** Functional / Integration

`vercel.json`:
```json
"rewrites": [
  { "source": "/api/:path*", "destination": "https://donttalk-api-production.up.railway.app/api/:path*" }
]
```

由於 BUG-001,首頁跟所有 page route 都 404。Rewrite 本身可能正常,但 **使用者連網站根本看不到任何 UI**,`/api/...` 是給前端 fetch 用的,前端現在連 HTML 都拿不到,自然所有 AJAX 都會失敗。

---

## Medium Severity Bugs

### ⚡ BUG-005 — robots.txt Disallow 路徑對應不到實際頁面

**URL:** `/robots.txt`
**嚴重度:** Medium
**類別:** SEO

```text
User-agent: *
Allow: /
Disallow: /ingest.html
Disallow: /report.html
```

`Disallow: /ingest.html` 跟 `Disallow: /report.html` 因為 cleanUrls + 308 redirect,實際上 crawler 會打到 `/ingest` 跟 `/report`,這兩個路徑 robots 沒擋到。

**修法:** `Disallow: /ingest` 跟 `Disallow: /report`(或兩個都寫,保險)。

---

### ⚡ BUG-006 — `/games/xian/` 是唯一活著的路徑但沒被 sitemap 收錄

**URL:** `https://donttalk.vercel.app/games/xian/`
**嚴重度:** Medium
**類別:** SEO / Functional

`/games/xian/` 回 200(15,411 bytes),但 `sitemap.xml` 完全沒列它。Google 找不到這個頁面入口,只能透過手動 URL。

**修法:** 加進 sitemap,priority 0.6 左右。

---

## Low Severity Bugs

### ℹ️ BUG-007 — `/_assets/(.*)` cache header 在 production 沒生效

**URL:** `/_assets/...`
**嚴重度:** Low
**類別:** Performance

`astro/.vercel/output/config.json` 裡有正確的 cache header 設定:
```json
{ "src": "^/_assets/(.*)$", "headers": {"cache-control": "public, max-age=31536000, immutable"}, "continue": true }
```

但因為 `outputDirectory` 錯,Vercel 沒採到這份 config,**所有 `_assets/*.js` 跟 `*.css` 都沒 immutable cache**,每次 deploy 後 user 端可能拿到舊 bundle。

驗證:
```
/styles/polish.css  cache: public, max-age=0, must-revalidate  ← 沒 immutable
```

預期是 `public, max-age=31536000, immutable`(1 年)。

---

### ℹ️ BUG-008 — sw.js cache 版本字串 `portfolio-v1` 過時

**URL:** `/sw.js`
**嚴重度:** Low
**類別:** PWA

```js
const CACHE_NAME = 'portfolio-v1';
const STATIC_ASSETS = [
  '/',                       ← 404
  '/index.html',             ← 308 → / → 404
  '/styles/shared.css',
  '/styles/polish.css',
  '/styles/dynamic.css',
  '/styles/index.css',
  '/manifest.json',
];
```

Service Worker 在 `install` 階段 `cache.addAll(STATIC_ASSETS)` 會試圖 fetch `/` 跟 `/index.html`,這兩個目前 404 → **PWA 安裝一定 fail**,使用者看不到「Add to Home Screen」提示,且未來即使 BUG-001 修了,sw.js 也會把 404 response 寫進 cache,離線模式下回空白頁。

**修法:** 修完 BUG-001 後 bump `CACHE_NAME = 'portfolio-v2'` 強迫 client 重新 install,並檢查 `STATIC_ASSETS` 改用 `/<page>/`(directory index)而非 `/<page>.html`。

---

## Testing Notes

**測了什麼:**
- 22 個 page routes(cleanUrl + `.html` 兩種格式 + directory index)
- 7 個靜態資源 (favicon, robots, sitemap, manifest, og-image, sw, _vercel/*)
- 7 個 CSS bundles (polish/shared/dynamic/index/stem_cell/works/gene_ai)
- sitemap.xml / robots.txt / manifest.json / sw.js 內容對照本地 build
- vercel.json / astro/vercel.json / astro.config.mjs / package.json / .vercel/output/config.json 比對

**沒測什麼:**
- 頁面內部的 JS / console errors(因為根本進不去頁面)
- 表單互動 / API endpoints(需要頁面先能載入)
- Mobile responsive(同上)
- A11y / ARIA(同上)
- 真實 Astro SSR function(因為 server/ 是空的)

**為什麼 ground-truth 用 curl 而不是 browser:**
Browser service 在本次測試中回 502 (`CDP WebSocket connect failed: HTTP error: 502 Bad Gateway`),改用 curl + http.client 直接驗證 HTTP status、body size、headers、redirect chain。curl 結果已經足以確認問題。