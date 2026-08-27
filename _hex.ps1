$bytes = [System.IO.File]::ReadAllBytes('d:\project\astro\api\catchall.mjs')
$text = [System.Text.Encoding]::UTF8.GetString($bytes)
$lines = $text -split "`n"
$line = $lines[47]  # L48
Write-Output ('Length: ' + $line.Length)
$bytes2 = [System.Text.Encoding]::UTF8.GetBytes($line)
Write-Output ('Hex:')
[BitConverter]::ToString($bytes2) -replace '-', ' '
