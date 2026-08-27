git -C d:\project diff-tree --no-commit-id --name-only -r HEAD | ForEach-Object { Write-Output $_ }
