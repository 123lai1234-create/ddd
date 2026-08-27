$lines = Get-Content 'd:\project\astro\api\catchall.mjs'
for ($i = 50; $i -lt 60; $i++) {
  Write-Output ('L' + ($i+1) + ': ' + $lines[$i])
}
