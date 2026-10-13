# deploy.ps1 - One-shot production deploy for donttalk Astro site.
#
# Why this exists: Vercel CLI 59 has spawn cmd.exe ENOENT bug on Windows that breaks
# prebuilt deploys. We pin vercel@58.11.0 locally and use the prepare-deploy script
# to manually assemble the .vercel/output/ tree.
#
# Usage from astro/:
#   powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
#
# It runs: build -> prepare-deploy -> vercel deploy

$ErrorActionPreference = 'Stop'
$astroDir = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $astroDir

# 1. Build
Write-Host "=== build ===" -ForegroundColor Magenta
npm run build 2>&1 | Select-String -Pattern "page|complete|error|Error" | Select-Object -Last 5

# 2. Prepare prebuilt output tree
Write-Host "=== prepare deploy ===" -ForegroundColor Magenta
& "$PSScriptRoot\prepare-deploy.ps1"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 3. Deploy
Write-Host "=== deploy ===" -ForegroundColor Magenta
& node_modules\.bin\vercel.cmd deploy --prebuilt --prod --yes --archive tgz 2>&1 | Select-Object -First 30
