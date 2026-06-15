$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONUTF8 = '1'
Set-Location 'D:\project\astro'
$log = 'D:\project\astro\scripts\_align_log.txt'
$done = 'D:\project\astro\scripts\_align_done.txt'
if (Test-Path $log) { Clear-Content $log }
if (Test-Path $done) { Remove-Item $done }
python .\scripts\align_lyrics.py *> $log
"exit=$LASTEXITCODE $(Get-Date -Format o)" | Out-File $done -Encoding utf8
