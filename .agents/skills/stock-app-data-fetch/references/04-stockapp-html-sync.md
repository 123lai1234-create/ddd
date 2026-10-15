# stock-app HTML 同步 SOP

## 結構

```
D:\project\astro\public\stock-app\          # Vercel serve（canonical for deploy）
├── index.html                                # JT 會直接編，可能比 source 新
├── etf.html
├── warming.html
├── macro.html
├── signal-filter.html
├── etf-filter.html
├── etf_holdings.html
├── etf_holdings_pivot.html
├── etf_holdings_v2.html
├── sold-too-early.html
├── uptrend-watch.html
├── heatmap.html
├── price-compare.html
├── rebalance.html
├── ai-capex.html
├── revenue.html
├── conference.html
├── admin_logs.html
├── marker_history.html
├── stock-damo-filter.html
├── sitemap.html                              # 跳過同步
├── static\                                   # 子資料夾（要一起搬）
│   ├── css\
│   ├── js\
│   └── img\
└── data\                                     # JSON cache（可選）

D:\project\dontalk-import\artifacts\portfolio\public\stock-app\   # source of truth
```

**任何一個 nav 連結的 HTML 缺，nav click → 404**。

## 同步 SOP

```powershell
# 1. 比較兩個目錄
$src = Get-ChildItem "D:\project\dontalk-import\artifacts\portfolio\public\stock-app" -File -Recurse | Select -ExpandProperty FullName
$dst = Get-ChildItem "D:\project\astro\public\stock-app" -File -Recurse | Select -ExpandProperty FullName
Compare-Object $src $dst | Format-Table -AutoSize
# 看到 <=' 開頭的是 source 有但 dest 沒（要加）
# 看到 '=>' 開頭的是 dest 有但 source 沒（可能要刪或留）
```

```powershell
# 2. 同步（跳過 index.html / sitemap.html）
$sourceRoot = "D:\project\dontalk-import\artifacts\portfolio\public\stock-app"
$destRoot = "D:\project\astro\public\stock-app"
Get-ChildItem $sourceRoot -File -Recurse | ForEach-Object {
    $rel = $_.FullName.Substring($sourceRoot.Length)
    if ($rel -match '\\index\.html$' -or $rel -match '\\sitemap\.html$') { return }
    $dest = Join-Path $destRoot $rel
    $destDir = Split-Path $dest -Parent
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
    Copy-Item $_.FullName $dest -Force
}
```

跳過 `index.html` / `sitemap.html` 因為：
- `astro/public/stock-app/index.html` JT 會直接編，可能比較新
- `sitemap.html` 是 build artifact，從 source 同步會蓋掉本地 edit

## 子資料夾

別忘了 `static/` 子資料夾。`-Recurse` 會包進去，但手動 cp 不要漏。

## 改 nav 連結時的對應修改

`index.html` 上 16+ 個 nav 按鈕：

```html
<a href="etf.html">0050 ETF</a>
<a href="warming.html">熱度排行</a>
<a href="macro.html">總體經濟</a>
<!-- ... -->
```

每個 nav 對應一個 `*.html` 檔。新增 nav 連結時：
1. 確認 `*.html` 存在
2. 確認它有相同的側邊 nav 結構（不然使用者會卡死）
3. 加進 `sitemap.html` 跟 nav 兩處

## 改 bot 邏輯時的同步

- 改 fetch URL → 全 16 個頁面都要 update（共用同一段 inline JS 或引用 shared helper）
- 改 data shape → `index.html` 的 render 跟其他頁的 chart init 都會受影響
- 改 cache 策略 → 重新檢視 50 檔個股的 ticker 列表有沒有進 universe

**建議**：把共用 JS 抽到 `static/js/stock-app-helpers.js`，每頁用 `<script src="static/js/stock-app-helpers.js?v=N">` 引入。

## 部署驗證

部署後：

```powershell
# 全部 nav 連結實打
$urls = @("etf.html","warming.html","macro.html","signal-filter.html","etf-filter.html","etf_holdings.html","sold-too-early.html","uptrend-watch.html","heatmap.html","price-compare.html","rebalance.html","ai-capex.html","revenue.html","conference.html","admin_logs.html","marker_history.html","etf_holdings_pivot.html","stock-damo-filter.html")
foreach ($u in $urls) {
  $code = (Invoke-WebRequest -Uri "https://donttalk.vercel.app/stock-app/$u/" -Method Head).StatusCode
  if ($code -ne 200) { Write-Warning "$u → $code" }
}
```

預期全部 200，看到 404 → 那個 HTML 沒 deploy 成功，看 `astro/public/stock-app/<file>` 是否存在。
