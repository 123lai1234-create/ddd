# Project Skills Mirror

這資料夾是 `C:\Users\User\.minimax\skills\` 的 mirror。User-level skill 自動載入，這裡是純 git-tracked 備份（換機器能 clone 帶走）。

## 同步方式

從 user-level mirror 過來：

```powershell
$skills = @('deploy-vercel-prebuilt','glb-asset-pipeline','astro-build-clean','stock-app-data-fetch','pagefind-static-index','utf8-safe-write-windows')
$srcRoot = "$env:USERPROFILE\.minimax\skills"
foreach ($s in $skills) {
  $dst = Join-Path "D:\project\.agents\skills" $s
  if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
  Copy-Item (Join-Path $srcRoot $s) $dst -Recurse -Force
}
```

或 Python 寫法見 `scripts/sync_skills.py`（未寫，先用 PowerShell 範例）。

## Skill 列表

| Skill | 觸發 |
|---|---|
| deploy-vercel-prebuilt | 部署 / 404 / token 過期 / framework 設定 |
| astro-build-clean | build 壞 / dist 沒更新 / stale / catchall 404 |
| glb-asset-pipeline | 3D mascot / GLB 壞 / model-viewer / chibi 3D / meshy |
| stock-app-data-fetch | 個股 / 2330 / ETF / cache / symbol 對不上 |
| pagefind-static-index | pagefind 索引 / 搜尋 / 多語言 / 排除 |
| utf8-safe-write-windows | UTF-8 壞 / CJK 亂碼 / BOM / PowerShell 寫檔 |

每個 skill 的 `SKILL.md` 是入口，`references/` 子資料夾放細節。

## 編輯流程

1. 改 `C:\Users\User\.minimax\skills\<skill>/SKILL.md`（user-level 是 source of truth）
2. 跑上面的 sync 鏡像到這
3. commit 進 D:\project git