$content = git -C d:\project show HEAD:astro/api/catchall.mjs | Out-String
$lines = $content -split "`n"
$line = $lines[47]
Write-Output ('Length: ' + $line.Length)
Write-Output 'Content:'
Write-Output $line
