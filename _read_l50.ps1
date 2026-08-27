$lines = Get-Content 'd:\project\astro\api\catchall.mjs'
for ($i = 49; $i -lt 53; $i++) {
  $line = $lines[$i]
  Write-Output ('L' + ($i+1) + ' [' + $line.Length + ']: ' + $line)
}
