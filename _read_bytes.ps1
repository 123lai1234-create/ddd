$bytes = [System.IO.File]::ReadAllBytes('d:\project\astro\api\catchall.mjs')
$text = [System.Text.Encoding]::UTF8.GetString($bytes)
$lines = $text -split "`n"
for ($i = 45; $i -lt 50; $i++) {
  $line = $lines[$i]
  Write-Output ('--- L' + ($i+1) + ' (' + $line.Length + ' chars) ---')
  Write-Output $line
  Write-Output ''
}
