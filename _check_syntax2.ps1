Set-Location d:\project
$content = Get-Content 'd:\project\astro\api\catchall.mjs' -Raw
Set-Content -Path 'd:\project\_syntax_check.mjs' -Value $content -NoNewline
$output = node --check 'd:\project\_syntax_check.mjs' 2>&1
Write-Output $output
if ($LASTEXITCODE -eq 0) { Write-Output 'OK' }
Remove-Item 'd:\project\_syntax_check.mjs' -ErrorAction SilentlyContinue
