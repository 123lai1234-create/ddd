$content = Get-Content 'd:\project\astro\api\catchall.mjs' -Raw
$col100 = $content.Substring(85, 30)
Write-Output ('Around col 100: [' + $col100 + ']')
