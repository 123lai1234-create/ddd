$lines = Get-Content 'd:\project\astro\api\catchall.mjs'
for ($i = 75; $i -lt 102; $i++) {
  Write-Output ('L' + ($i+1) + ': ' + $lines[$i])
}
