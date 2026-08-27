$lines = Get-Content 'd:\project\astro\api\catchall.mjs'
for ($i = 50; $i -lt 57; $i++) {
  $line = $lines[$i]
  Write-Output ('--- L' + ($i+1) + ' (' + $line.Length + ') ---')
  Write-Output $line
}
