$content = git -C d:\project show HEAD:astro/api/catchall.mjs | Out-String
$lines = $content -split "`n"
for ($i = 45; $i -lt 50; $i++) {
  $line = $lines[$i]
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($line)
  Write-Output ('--- L' + ($i+1) + ' (' + $bytes.Length + ' bytes) ---')
  # 顯示最後 5 個 byte 的 hex
  $tail = if ($bytes.Length -ge 5) { $bytes[($bytes.Length-5)..($bytes.Length-1)] } else { $bytes }
  $hex = ($tail | ForEach-Object { $_.ToString('X2') }) -join ' '
  Write-Output ('Tail hex: ' + $hex)
}
