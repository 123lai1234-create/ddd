$code = Get-Content 'd:\project\astro\api\catchall.mjs' -Raw
# Save to temp file
$tmp = 'd:\project\_syntax_check.mjs'
Set-Content -Path $tmp -Value $code -NoNewline
# Run node to check syntax
$output = node --check $tmp 2>&1
Write-Output $output
Remove-Item $tmp
