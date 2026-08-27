$content = Get-Content 'd:\project\astro\api\catchall.mjs' -Raw
# Save to one-line
Set-Content -Path 'd:\project\_check2.mjs' -Value $content -NoNewline
$output = node --check 'd:\project\_check2.mjs' 2>&1 | Out-String
Write-Output $output
