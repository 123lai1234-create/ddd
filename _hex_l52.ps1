$content = Get-Content 'd:\project\astro\api\catchall.mjs' -Raw
# Find the substring around L53
$lines = $content -split "`n"
$line53 = $lines[52]
$bytes = [System.Text.Encoding]::UTF8.GetBytes($line53)
Write-Output ('L53 bytes:')
$hex = ($bytes | ForEach-Object { $_.ToString('X2') }) -join ' '
Write-Output $hex
Write-Output ('Length: ' + $bytes.Length)
