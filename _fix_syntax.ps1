$f = 'd:\project\astro\api\catchall.mjs'
$content = Get-Content $f -Raw
$fixed = $content -replace 'if \(ip && _ipInList\(ip, ipList\)\) return true;', 'if (ip && _ipInList(ip, ipList)) {' -replace "    return true;\n  }", "      return true;\n    }"
if ($content -ne $fixed) {
  Set-Content -Path $f -Value $fixed -NoNewline
  Write-Output 'fixed'
} else {
  Write-Output 'no change'
}
