$ErrorActionPreference = 'Stop'
$mavisPath = 'C:\Users\User\.mavis\bin\mavis.cmd'
$json = '{"url":"https://donttalk.vercel.app/music"}'
$process = Start-Process -FilePath $mavisPath -ArgumentList 'browser','tool','navigate' -RedirectStandardInput -NoNewWindow -PassThru
$process.StandardInput.Write($json)
$process.StandardInput.Close()
$process.WaitForExit()
Write-Output "Exit code: $($process.ExitCode)"
