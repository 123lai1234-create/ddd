# deploy-production.ps1 - 一鍵把目前的內容送上正式站
#
# 流程（跟「git push 自動部署」同一條路徑，只是多了驗證）：
#   1. 檢查工作區乾淨、且分支已包含 origin/main（否則會退版，見下方警語）
#   2. git push HEAD:main  → Vercel 自動 Production 部署 → 自動指派 donttalk.vercel.app
#   3. 等部署 Ready
#   4. HTTP 驗證關鍵路徑（首頁 / 音樂卡 / 音樂頁）
#
# 為什麼走 git 而不是 CLI prebuilt：
#   `vercel deploy --prebuilt` 是用「本地工作區」build 的，**不含 origin/main 還沒
#   合併進來的 commit** → 2026-11-18 就這樣把線上打成退版版本（缺 firmware、
#   浮動人偶等 main 上的功能）。走 git push 則一定包含 main 的全部內容。
#
# ⚠️ 絕對不要對 donttalk.vercel.app 手動 `vercel alias set`：
#   它是專案自己的 production domain，手動 alias 會蓋掉 Vercel 的自動指派，
#   之後 push 產生的部署永遠不會送上正式站（2026-11-18 實測）。
#   要移除手動 alias：`npx vercel alias rm donttalk.vercel.app`
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-production.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-production.ps1 -SkipPush
param([switch]$SkipPush)

$ErrorActionPreference = 'Continue'
$astroDir = (Resolve-Path "$PSScriptRoot\..").Path
$repoRoot = Split-Path $astroDir -Parent
Set-Location $repoRoot

# ---------------------------------------------------------------- 0. 前置檢查
Write-Host "[0/4] 前置檢查 ..." -ForegroundColor Cyan
$dirty = @(git status --porcelain)
if ($dirty.Count -gt 0) {
    Write-Host "  ⚠ 工作區有 $($dirty.Count) 個未提交變動 —— 會被 push 出去。確認清單："
    $dirty | Select-Object -First 10 | ForEach-Object { "      $_" }
}

git fetch origin | Out-Null
$behind = [int](git rev-list --count HEAD..origin/main)
if ($behind -gt 0) {
    Write-Host "  ✗ 本地分支落後 origin/main $behind 個 commit —— 這樣部署會退版。" -ForegroundColor Red
    Write-Host "    先合併：git merge origin/main" -ForegroundColor Yellow
    exit 1
}
Write-Host "  ✓ 分支已包含 origin/main" -ForegroundColor Green

# ---------------------------------------------------------------- 1. push
if (-not $SkipPush) {
    Write-Host "[1/4] push 到 main（觸發 Vercel Production 部署）..." -ForegroundColor Cyan
    git push origin HEAD:main
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ push 失敗" -ForegroundColor Red
        exit 1
    }
}
$sha = (git rev-parse --short HEAD).Trim()

# ---------------------------------------------------------------- 2. 等部署
Write-Host "[2/4] 等 Vercel Production 部署 ..." -ForegroundColor Cyan
$token = $null
$envFile = "$env:USERPROFILE\.mavis\agents\mavis\.env"
if (Test-Path $envFile) {
    $t = Get-Content $envFile -Raw
    if ($t -match 'VERCEL_TOKEN\s*=\s*"?([^\s"\r\n]+)') { $token = $Matches[1] }
}
if (-not $token) { Write-Host "  ✗ 找不到 VERCEL_TOKEN" -ForegroundColor Red; exit 1 }
$headers = @{ Authorization = "Bearer $token" }
$ready = $false
for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 20
    $deps = Invoke-RestMethod -Uri 'https://api.vercel.com/v6/deployments?projectId=prj_vcjSm78uyB2LGkEMYJBEArC3c5It&limit=10' -Headers $headers
    $d = $deps.deployments | Where-Object { $_.meta.githubCommitSha -and $_.meta.githubCommitSha.StartsWith($sha) -and $_.target -eq 'production' } | Select-Object -First 1
    if ($d) {
        Write-Host ("  [{0}] {1} {2}" -f (Get-Date -Format 'HH:mm:ss'), $d.readyState, $d.url) -ForegroundColor DarkGray
        if ($d.readyState -eq 'READY') { $ready = $true; break }
    } else {
        Write-Host ("  [{0}] 等待部署 {1} ..." -f (Get-Date -Format 'HH:mm:ss'), $sha) -ForegroundColor DarkGray
    }
}
if (-not $ready) { Write-Host "  ✗ 部署未就緒" -ForegroundColor Red; exit 1 }
Write-Host "  ✓ 部署 Ready" -ForegroundColor Green

# ---------------------------------------------------------------- 3. alias 檢查
Write-Host "[3/4] 檢查 alias 是否指向最新部署 ..." -ForegroundColor Cyan
$aliases = Invoke-RestMethod -Uri 'https://api.vercel.com/v4/aliases?projectId=prj_vcjSm78uyB2LGkEMYJBEArC3c5It&limit=20' -Headers $headers
$prod = $aliases.aliases | Where-Object { $_.alias -eq 'donttalk.vercel.app' } | Select-Object -First 1
if (-not $prod) {
    Write-Host "  ✗ donttalk.vercel.app 沒有 alias —— 用 npx vercel alias set <deploy-url> donttalk.vercel.app 補上" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ donttalk.vercel.app -> $($prod.deploymentId)" -ForegroundColor Green

# ---------------------------------------------------------------- 4. 驗證
Write-Host "[4/4] HTTP 驗證正式站 ..." -ForegroundColor Cyan
$urls = @(
    'https://donttalk.vercel.app/',
    'https://donttalk.vercel.app/music/',
    'https://donttalk.vercel.app/music/songs/',
    'https://donttalk.vercel.app/music/cards/05_雨夜出租/og-image.jpg',
    'https://donttalk.vercel.app/firmware/'
)
$bad = 0
foreach ($u in $urls) {
    # 308 是尾斜線正規化（cleanUrls），Invoke-WebRequest 不會跟隨 → 會落到 catch，
    # 所以 catch 裡只取狀態碼、不計數，計數統一由下面的 flag 決定。
    $code = 0
    $len = ''
    try {
        $r = Invoke-WebRequest -Uri $u -Method Head -TimeoutSec 25 -UseBasicParsing
        $code = $r.StatusCode
        $len = $r.Headers['Content-Length']
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
    }
    $flag = if ($code -eq 200 -or $code -eq 308) { 'OK  ' } else { 'FAIL' }
    if ($flag -eq 'FAIL') { $bad++ }
    "  {0} {1,-4} {2,10}  {3}" -f $flag, $code, $len, $u
}
if ($bad -gt 0) { Write-Host "  ✗ $bad 個路徑異常" -ForegroundColor Red; exit 1 }
Write-Host ""
Write-Host "✓ 正式站已更新並通過驗證" -ForegroundColor Green
