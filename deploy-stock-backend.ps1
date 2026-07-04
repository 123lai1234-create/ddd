<#
.SYNOPSIS
    Deploy stock-app-backend to Railway + rewire Vercel rewrite.

.DESCRIPTION
    One-shot deployment script. Assumes:
    - railway CLI and vercel CLI are authed (railway login + vercel login already done)
    - $env:RAILWAY_API_TOKEN, $env:VERCEL_TOKEN, $env:NEON_DATABASE_URL are set
    - You're at D:\project

    Steps:
      1. railway init (skipped if project already exists)
      2. Create service 'stock-app-backend' if not exists
      3. Deploy using artifacts/api-server/deploy/Dockerfile
      4. Set env vars (DATABASE_URL, STOCK_OPERATOR_PASSWORD, NODE_ENV, LOG_LEVEL)
      5. Get Railway public domain
      6. Push DB schema (drizzle-kit push)
      7. Smoke test /healthz
      8. Update D:\project\vercel.json rewrite to point at Railway
      9. Vercel deploy --prod
     10. Final smoke test from production URL

.PARAMETER OperatorPassword
    STOCK_OPERATOR_PASSWORD to set on the Railway service. Auto-generated if omitted.

.EXAMPLE
    $env:RAILWAY_API_TOKEN="..."
    $env:VERCEL_TOKEN="..."
    $env:NEON_DATABASE_URL="postgresql://..."
    .\deploy-stock-backend.ps1
#>

[CmdletBinding()]
param(
    [string]$OperatorPassword = $env:STOCK_OPERATOR_PASSWORD,
    [string]$RailwayProject = "donttalk-stock-app",
    [string]$ServiceName = "stock-app-backend",
    [switch]$SkipDbPush,
    [switch]$SkipVercelDeploy,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Step($msg) {
    Write-Host ""
    Write-Host "=== $msg ===" -ForegroundColor Cyan
}

function Ok($msg) { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "  [!] $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "  [X] $msg" -ForegroundColor Red; exit 1 }

# ─── Pre-flight checks ────────────────────────────────────────────────────
Step "Pre-flight"

if (-not $env:RAILWAY_API_TOKEN) {
    Fail "RAILWAY_API_TOKEN not set. Get one at https://railway.app/account/tokens"
}
if (-not $env:VERCEL_TOKEN) {
    Warn "VERCEL_TOKEN not set — Vercel deploy step will be skipped unless --SkipVercelDeploy"
    $SkipVercelDeploy = $true
}
if (-not $env:NEON_DATABASE_URL) {
    Fail "NEON_DATABASE_URL not set. Create a free DB at https://console.neon.tech"
}
if (-not $OperatorPassword) {
    $OperatorPassword = -join ((48..57 + 65..90 + 97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
    Warn "No STOCK_OPERATOR_PASSWORD provided — generated random: $OperatorPassword"
}

# Move to repo root for relative paths in commands
Set-Location "D:\project"
Ok "Pre-flight done"

# ─── Step 1: railway init (idempotent) ────────────────────────────────────
Step "Railway project setup"

$existingProject = railway project list 2>&1 | Select-String -Pattern $RailwayProject -SimpleMatch -Quiet
if (-not $existingProject) {
    if ($DryRun) { Write-Host "  [DRY] railway init --name $RailwayProject" }
    else {
        railway init --name $RailwayProject 2>&1 | Out-Null
        Ok "Created Railway project: $RailwayProject"
    }
} else {
    Ok "Railway project already exists: $RailwayProject"
}

# ─── Step 2: Service ──────────────────────────────────────────────────────
Step "Railway service setup"

if (-not $existingProject) { railway link --project $RailwayProject | Out-Null }

$svcList = railway service list 2>&1
if ($svcList -match [regex]::Escape($ServiceName)) {
    Ok "Service '$ServiceName' already exists"
} else {
    if ($DryRun) { Write-Host "  [DRY] railway service create $ServiceName" }
    else {
        railway service create $ServiceName 2>&1 | Out-Null
        Ok "Created service: $ServiceName"
    }
}

# ─── Step 3: Deploy ───────────────────────────────────────────────────────
Step "Deploy to Railway (multi-stage Docker build, ~5 min first time)"

if ($DryRun) {
    Write-Host "  [DRY] railway up --service $ServiceName --detach"
} else {
    # railway up reads railway.toml at the deploy/ directory automatically
    Set-Location "D:\project\dontalk-import"
    railway up --service $ServiceName --detach 2>&1 | Tee-Object -Variable deployOut | Out-Null
    Set-Location "D:\project"
    Ok "Deploy submitted"
    Write-Host $deployOut
}

# ─── Step 4: Env vars ──────────────────────────────────────────────────────
Step "Set env vars"

if ($DryRun) {
    Write-Host "  [DRY] railway variables --service $ServiceName set DATABASE_URL=... STOCK_OPERATOR_PASSWORD=..."
} else {
    railway variables --service $ServiceName set `
        DATABASE_URL="$env:NEON_DATABASE_URL" `
        STOCK_OPERATOR_PASSWORD="$OperatorPassword" `
        NODE_ENV="production" `
        LOG_LEVEL="info" 2>&1 | Out-Null
    Ok "Env vars set"
}

# ─── Step 5: Get domain ────────────────────────────────────────────────────
Step "Get Railway public domain"

if ($DryRun) {
    $RailwayDomain = "REPLACE.up.railway.app"
    Warn "Dry-run: using placeholder domain $RailwayDomain"
} else {
    # Wait briefly for service to come up
    $attempt = 0
    do {
        Start-Sleep 5
        $attempt++
        $domainOut = railway domain --service $ServiceName 2>&1
    } while (($domainOut -notmatch '\.up\.railway\.app$') -and $attempt -lt 12)

    if ($domainOut -notmatch '\.up\.railway\.app$') {
        Fail "Couldn't get Railway domain after 60s. Last output: $domainOut"
    }
    $RailwayDomain = ($domainOut | Select-String -Pattern '\S+\.up\.railway\.app' | Select-Object -First 1).Matches[0].Value
    Ok "Railway domain: $RailwayDomain"
}

# ─── Step 6: DB push ───────────────────────────────────────────────────────
if (-not $SkipDbPush) {
    Step "Drizzle schema push"
    if ($DryRun) {
        Write-Host "  [DRY] railway run --service $ServiceName pnpm --filter @workspace/db run push"
    } else {
        Write-Host "You'll be prompted to confirm CREATE TABLE for 5 tables."
        Write-Host "Type 'y' when asked."
        railway run --service $ServiceName pnpm --filter @workspace/db run push 2>&1
        Ok "Schema push done"
    }
} else {
    Warn "Skipping DB push (--SkipDbPush)"
}

# ─── Step 7: Smoke test /healthz ──────────────────────────────────────────
Step "Smoke test /healthz"

if (-not $DryRun) {
    $attempt = 0
    $ok = $false
    do {
        $attempt++
        Start-Sleep 3
        try {
            $r = Invoke-WebRequest -Uri "https://$RailwayDomain/healthz" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
            if ($r.Content -match '"status"\s*:\s*"ok"') { $ok = $true; break }
        } catch {
            Write-Host "  attempt $attempt : $($_.Exception.Message.Substring(0, [Math]::Min(80, $_.Exception.Message.Length)))"
        }
    } while ($attempt -lt 20)

    if ($ok) {
        Ok "/healthz returns 200 OK"
    } else {
        Warn '/healthz not responding after 60s — check `railway logs --service $ServiceName`'
    }
}

# ─── Step 8: Update vercel.json ────────────────────────────────────────────
Step "Update D:\project\vercel.json rewrite"

$vercelJsonPath = "D:\project\vercel.json"
$vercelJson = Get-Content $vercelJsonPath -Raw

if ($DryRun) {
    Write-Host "  [DRY] would write destination: https://$RailwayDomain/api/:path*"
} else {
    $newDest = "https://$RailwayDomain/api/:path*"
    $vercelJsonNew = $vercelJson -replace '"destination":\s*"[^"]*"', "`"destination`": `"$newDest`""

    if ($vercelJsonNew -eq $vercelJson) {
        Warn "vercel.json rewrite line didn't change — pattern may differ. Inspect manually."
    } else {
        Set-Content -Path $vercelJsonPath -Value $vercelJsonNew -Encoding UTF8
        Ok "Updated vercel.json rewrite → $newDest"
    }
}

# ─── Step 9: Vercel deploy ────────────────────────────────────────────────
if (-not $SkipVercelDeploy) {
    Step "Vercel deploy --prod"

    if ($DryRun) {
        Write-Host "  [DRY] vercel deploy --prod --yes --token `$env:VERCEL_TOKEN"
    } else {
        # Pre-clean stale cache per memory notes
        if (Test-Path "D:\project\astro\.vercel\output") {
            Remove-Item -Recurse -Force "D:\project\astro\.vercel\output" -ErrorAction SilentlyContinue
        }

        # Build astro
        Push-Location "D:\project\astro"
        npm run build 2>&1 | Select-Object -Last 5 | Write-Host
        Pop-Location

        # Deploy
        vercel deploy --prebuilt --prod --yes --archive tgz --token $env:VERCEL_TOKEN 2>&1 | Tee-Object -Variable vercelOut | Out-Null
        Ok "Vercel deploy submitted"
        Write-Host $vercelOut
    }
} else {
    Warn "Skipping Vercel deploy (no VERCEL_TOKEN or --SkipVercelDeploy)"
}

# ─── Step 10: Final smoke test ────────────────────────────────────────────
Step "Final smoke test from production URL"

if (-not $DryRun) {
    $testUrls = @(
        "https://dontalk.vercel.app/api/etf_holdings/snapshots/0050?limit=30",
        "https://dontalk.vercel.app/api/etf_holdings/diff/0050",
        "https://dontalk.vercel.app/api/stocks"
    )
    foreach ($u in $testUrls) {
        try {
            $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
            $body = $r.Content.Substring(0, [Math]::Min(80, $r.Content.Length))
            Write-Host "  $($r.StatusCode)  $u  $body"
        } catch {
            Write-Host "  ERR $u  $($_.Exception.Message)"
        }
    }
}

# ─── Summary ──────────────────────────────────────────────────────────────
Step "Done"

$summary = @"

  Railway backend:  https://$RailwayDomain
  Production URL:   https://donttalk.vercel.app/stock-app/etf_holdings_tracker.html

  Operator password (for privileged actions like batch snapshot):
    $OperatorPassword

  Useful commands:
    railway logs --service $ServiceName --tail
    railway run --service $ServiceName pnpm --filter @workspace/db run push
    cd D:\project; vercel logs --token `$env:VERCEL_TOKEN

  See D:\project\dontalk-import\artifacts\api-server\deploy\RUNBOOK.md for follow-up steps
  (seed watchlist, GitHub Actions, snapshot persistence).

"@

Write-Host $summary -ForegroundColor Cyan