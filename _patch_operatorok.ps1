$f = 'd:\project\astro\api\catchall.mjs'
$content = Get-Content $f -Raw
$new = $content -replace 'operatorOk\(body\?\.password\)', 'operatorOk(body?.password, request)'
if ($content -ne $new) {
  Set-Content -Path $f -Value $new -NoNewline
  Write-Output 'Replaced'
} else {
  Write-Output 'No change'
}
