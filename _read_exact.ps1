$lines = Get-Content 'd:\project\astro\api\catchall.mjs'
for ($i = 45; $i -lt 65; $i++) {
  $line = $lines[$i]
  Write-Output ('L' + ($i+1) + ' [' + $line.Length + ']: ' + $line)
}
