$lines = Get-Content 'd:\project\astro\api\catchall.mjs'
for ($i = 49; $i -lt 54; $i++) {
  Write-Output ('L' + ($i+1) + ': ' + $lines[$i])
}
