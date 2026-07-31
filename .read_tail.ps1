$path = $args[0]
$len = (Get-Item $path).Length
$take = [Math]::Min(8000, $len)
$stream = [System.IO.File]::OpenRead($path)
$stream.Position = $len - $take
$reader = New-Object System.IO.StreamReader($stream)
$reader.ReadToEnd() | Out-String
