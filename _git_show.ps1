$bytes = git -C d:\project show HEAD:astro/api/catchall.mjs | Out-String | %{ $bytes = $_ }
$content = $bytes -join "`n"
$lines = $content -split "`n"
$line = $lines[47]  # L48
Write-Output ('Length: ' + $line.Length)
Write-Output 'Content:'
Write-Output $line
