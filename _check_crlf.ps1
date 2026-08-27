$bytes = [System.IO.File]::ReadAllBytes('d:\project\astro\api\catchall.mjs')
$content = [System.Text.Encoding]::UTF8.GetString($bytes)
$lines = $content -split "`n"
for ($i = 45; $i -lt 50; $i++) {
  $line = $lines[$i]
  $lineBytes = [System.Text.Encoding]::UTF8.GetBytes($line)
  Write-Output ('--- L' + ($i+1) + ' (' + $lineBytes.Length + ' bytes) ---')
  if ($lineBytes.Length -ge 3) {
    $tail = $lineBytes[($lineBytes.Length-3)..($lineBytes.Length-1)]
    $hex = ($tail | ForEach-Object { $_.ToString('X2') }) -join ' '
    Write-Output ('Tail: ' + $hex)
  }
}
