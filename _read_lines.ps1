$lines = Get-Content 'd:\project\astro\api\catchall.mjs'
Write-Output ('Total lines: ' + $lines.Count)
for ($i = 40; $i -lt 110; $i++) {
  Write-Output ('L' + ($i+1) + ' : ' + $lines[$i])
}
