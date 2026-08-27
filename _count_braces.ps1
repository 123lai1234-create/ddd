$content = Get-Content 'd:\project\astro\api\catchall.mjs' -Raw
# Find operatorOk function
$startIdx = $content.IndexOf('function operatorOk')
Write-Output ('function operatorOk at index: ' + $startIdx)
# From there count { and }
$snippet = $content.Substring($startIdx, 600)
$openBraces = ($snippet.ToCharArray() | Where-Object { $_ -eq '{' }).Count
$closeBraces = ($snippet.ToCharArray() | Where-Object { $_ -eq '}' }).Count
Write-Output ('Open {: ' + $openBraces + ', Close }: ' + $closeBraces)
Write-Output ('Snippet:')
Write-Output $snippet
