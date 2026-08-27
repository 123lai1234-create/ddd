Set-Location d:\project
vercel inspect https://donttalk-mn082ckrr-donttalk.vercel.app --logs 2>&1 | Out-String -Stream | Tee-Object -Variable log | Where-Object { $_ -match 'Unexpected|catchall' }
