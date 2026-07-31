# deploy-no-music.ps1
# 1. Backup MP3s from astro/dist/music/ to .vercel/output/static/music_backup/
# 2. Deploy (astro/dist/ now has no MP3s -> ~55MB upload vs 196MB)
# 3. Restore MP3s to both locations
# 4. .vercel/output/static/music/ serves the CDN for OLD deployments
#    astro/dist/music/ serves if anyone does a local build

param(
    [string]$Token = $env:VERCEL_TOKEN
)

$projRoot = "D:\project"
Set-Location $projRoot

$distMusic = "astro\dist\music"
$outputMusic = ".vercel\output\static\music"
$backupDir = ".vercel\output\static\music_backup"

Write-Host "Step 1: Backup MP3s from dist..."
if (Test-Path $backupDir) { Remove-Item $backupDir -Recurse -Force }
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
Get-ChildItem "$distMusic\*.mp3" | Move-Item -Destination $backupDir -Force
Get-ChildItem "$outputMusic\*.mp3" | Move-Item -Destination $backupDir -Force
Write-Host "Backed up. Upload will be ~55MB (vs 196MB)."

Write-Host "Step 2: Deploying..."
$env:VERCEL_TOKEN = $Token
Set-Location "$projRoot\astro"
npx vercel deploy --prebuilt --prod --yes --archive tgz 2>&1 | Out-Null
$deployOk = $LASTEXITCODE -eq 0

Set-Location $projRoot
Write-Host "Step 3: Restoring MP3s..."
Get-ChildItem $backupDir | Move-Item -Destination $distMusic -Force
Get-ChildItem $backupDir | Move-Item -Destination $outputMusic -Force
Remove-Item $backupDir -Recurse -Force
Write-Host "Restored."

if (-not $deployOk) {
    Write-Host "Deploy may have failed, check Vercel dashboard."
}
Write-Host "Done!"
