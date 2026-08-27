$lines = Get-Content 'd:\project\astro\api\catchall.mjs'
$line54 = $lines[53]  # 0-indexed
Write-Output ('L54: ' + $line54)
$bytes = [System.Text.Encoding]::UTF8.GetBytes($line54)
Write-Output ('Length: ' + $bytes.Length)
Write-Output 'Hex:'
$hex = ($bytes | ForEach-Object { $_.ToString('X2') }) -join ' '
Write-Output $hex
