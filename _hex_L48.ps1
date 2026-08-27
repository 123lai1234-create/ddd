$content = git -C d:\project show HEAD:astro/api/catchall.mjs | Out-String
$lines = $content -split "`n"
$line48 = $lines[47]
$bytes = [System.Text.Encoding]::UTF8.GetBytes($line48)
Write-Output ('L48 length: ' + $line48.Length + ' chars, ' + $bytes.Length + ' bytes')
Write-Output 'Hex:'
$hex = ($bytes | ForEach-Object { $_.ToString('X2') }) -join ' '
Write-Output $hex
