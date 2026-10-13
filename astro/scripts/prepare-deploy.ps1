# prepare-deploy.ps1 - Build the .vercel/output tree that Vercel CLI 58 prebuilt can deploy.
#
# Why this exists: Vercel CLI 59 spawn cmd.exe ENOENT blocks prebuilt deploys in Windows,
# so we cannot let `vercel build` produce the .vercel/output/. We construct it manually:
#   1. .vercel/output/static/   <- mirror of astro/dist/ (built locally)
#   2. .vercel/output/config.json + builds.json (cleaned: target=production, no cached errors)
#   3. .vercel/output/functions/api/catchall.func/ <- edge function copied from cache
#   4. config.json `routes` field rewrites /api/* to /api/catchall (the dispatch happens inside)
#
# The catchall.mjs source is the August 2026 edge-runtime version that was successfully
# deployed to production. It's kept under .vercel/.vercel/output/ as Vercel CLI's cache;
# we copy it into .vercel/output/functions/api/catchall.func/ before deploying.
#
# Usage: after `npm run build`, run this from astro/:
#   powershell -ExecutionPolicy Bypass -File scripts/prepare-deploy.ps1
#   & node_modules\.bin\vercel.cmd deploy --prebuilt --prod --yes --archive tgz

$ErrorActionPreference = 'Stop'

$astroDir = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $astroDir

# 1. mirror astro/dist to .vercel/output/static (only if dist is newer / empty .vercel/output/static)
$distPath = Join-Path $astroDir 'dist'
$staticOut = Join-Path $astroDir '.vercel\output\static'

if (Test-Path $distPath) {
    Write-Host "[1/5] Mirroring dist -> .vercel/output/static ..." -ForegroundColor Cyan
    if (-not (Test-Path $staticOut)) { New-Item -ItemType Directory -Force -Path $staticOut | Out-Null }
    # Use Python for reliable cross-volume copy (robocopy hangs on some paths)
    python -c "import shutil, os; src=r'$distPath'.replace('\\','\\\\'); dst=r'$staticOut'.replace('\\','\\\\'); [shutil.copy2(os.path.join(r,f), os.path.join(dst,f)) for r,_,fs in os.walk(src) for f in fs]" 2>&1 | Out-Null
    $count = (Get-ChildItem -Recurse $staticOut -File).Count
    $size = [math]::Round((Get-ChildItem -Recurse $staticOut -File | Measure-Object Length -Sum).Sum / 1MB, 1)
    Write-Host "       $count files, $size MB" -ForegroundColor Green
} else {
    Write-Host "WARN: dist/ not found, run 'npm run build' first" -ForegroundColor Yellow
}

# 2. config.json: version 3 + routes for catchall
Write-Host "[2/5] Writing config.json with catchall routes ..." -ForegroundColor Cyan
$configJson = @'
{
  "version": 3,
  "routes": [
    { "src": "/api/(.*)", "dest": "/api/catchall" },
    { "src": "/healthz",  "dest": "/api/catchall/healthz" },
    { "src": "/og",       "dest": "/api/catchall/og" }
  ]
}
'@
Set-Content -Path '.vercel\output\config.json' -Value $configJson -Encoding UTF8

# 3. Copy catchall function from Vercel CLI cache
#    Note: Vercel CLI keeps its build cache at <project-root>/.vercel/.vercel/,
#    which is D:\project\.vercel\.vercel\ (NOT astro/.vercel/.vercel/).
Write-Host "[3/5] Copying catchall.func from cache ..." -ForegroundColor Cyan
$projectRoot = Split-Path $astroDir -Parent
$cacheFunc = Join-Path $projectRoot '.vercel\.vercel\output\functions\api\catchall.func'
$outFunc = '.vercel\output\functions\api\catchall.func'
if (Test-Path $cacheFunc) {
    New-Item -ItemType Directory -Force -Path $outFunc | Out-Null
    Copy-Item "$cacheFunc\catchall.mjs" "$outFunc\catchall.mjs" -Force
    Copy-Item "$cacheFunc\.vc-config.json" "$outFunc\.vc-config.json" -Force
    $size = (Get-Item "$outFunc\catchall.mjs").Length
    Write-Host "       $outFunc\catchall.mjs ($size bytes from $cacheFunc)" -ForegroundColor Green
} else {
    Write-Host "ERROR: catchall func source not found at $cacheFunc" -ForegroundColor Red
    Write-Host "       Re-link via: npx vercel link --yes --project donttalk" -ForegroundColor Red
    exit 1
}

# 4. builds.json: target=production, no cached errors, no zzz-invalidate-cache
Write-Host "[4/5] Cleaning builds.json ..." -ForegroundColor Cyan
python -c @"
import json
p='.vercel/output/builds.json'
d=json.load(open(p))
d['target']='production'
d.pop('error',None)
d['builds']=[b for b in d['builds'] if 'zzz-invalidate-cache' not in b.get('src','')]
for b in d['builds']:
    if 'catchall' in b.get('src',''):
        b['src']='.vercel/output/functions/api/catchall.func/catchall.mjs'
        b['use']='@vercel/edge'
        b.pop('require',None)
        b.pop('requirePath',None)
        b['config']={}
d['//']='manual prebuilt + catchall.func (edge runtime)'
json.dump(d, open(p,'w'), indent=2)
"@

# 5. Verify OIDC token is set
Write-Host "[5/5] Checking Vercel OIDC token ..." -ForegroundColor Cyan
if (-not $env:VERCEL_OIDC_TOKEN) {
    $envFile = '.vercel\.env.development.local'
    if (Test-Path $envFile) {
        $env:VERCEL_OIDC_TOKEN = (Select-String -Path $envFile -Pattern 'VERCEL_OIDC_TOKEN').Line -replace '^VERCEL_OIDC_TOKEN="|"$',''
        Write-Host "       loaded from $envFile (length=$($env:VERCEL_OIDC_TOKEN.Length))" -ForegroundColor Green
    } else {
        Write-Host "ERROR: VERCEL_OIDC_TOKEN not set and $envFile not found" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "       VERCEL_OIDC_TOKEN already set (length=$($env:VERCEL_OIDC_TOKEN.Length))" -ForegroundColor Green
}

Write-Host ""
Write-Host "Ready to deploy. Next command:" -ForegroundColor Green
Write-Host "  & node_modules\.bin\vercel.cmd deploy --prebuilt --prod --yes --archive tgz" -ForegroundColor Yellow
