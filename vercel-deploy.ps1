#!/usr/bin/env pwsh
# Auto-source VERCEL_TOKEN from user-level .env, then run `npx vercel <args>`.
# Usage:
#   .\vercel-deploy.ps1 ls
#   .\vercel-deploy.ps1 alias <preview-url> donttalk.vercel.app
#   .\vercel-deploy.ps1 whoami
$ErrorActionPreference = 'Stop'

# 1. Source VERCEL_TOKEN from ~/.mavis/agents/mavis/.env if not already set
if (-not $env:VERCEL_TOKEN -and (Test-Path "$env:USERPROFILE\.mavis\agents\mavis\.env")) {
    Get-Content "$env:USERPROFILE\.mavis\agents\mavis\.env" | ForEach-Object {
        if ($_ -match '^VERCEL_TOKEN=(.+)$') {
            $env:VERCEL_TOKEN = $matches[1].Trim()
        }
    }
}
if (-not $env:VERCEL_TOKEN) {
    Write-Error "VERCEL_TOKEN not set. Please add `VERCEL_TOKEN=vcp_xxx` to $env:USERPROFILE\.mavis\agents\mavis\.env"
    exit 1
}

# 2. Force always --scope donttalk for project isolation
$argList = @('--scope', 'donttalk') + @($args)
& npx vercel @argList