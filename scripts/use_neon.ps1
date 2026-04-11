param(
    [string]$DatabaseUrl = "",
    [switch]$Save,
    [switch]$StartApi,
    [string]$ApiHost = "127.0.0.1",
    [int]$ApiPort = 8000
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$envFilePath = Join-Path $repoRoot ".env.neon.local"
$pythonExe = Join-Path $repoRoot ".venv\Scripts\python.exe"

function Read-EnvFileValue {
    param(
        [string]$Path,
        [string]$Key
    )

    if (-not (Test-Path $Path)) {
        return ""
    }

    foreach ($line in [System.IO.File]::ReadAllLines($Path, [System.Text.Encoding]::UTF8)) {
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }

        $trimmed = $line.Trim()
        if ($trimmed.StartsWith("#")) {
            continue
        }

        if (-not $trimmed.StartsWith("$Key=")) {
            continue
        }

        return $trimmed.Substring($Key.Length + 1).Trim()
    }

    return ""
}

function Write-EnvFileValue {
    param(
        [string]$Path,
        [string]$Key,
        [string]$Value
    )

    $content = "$Key=$Value`r`n"
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $content, $utf8NoBom)
}

function Resolve-DatabaseUrl {
    param(
        [string]$ExplicitValue
    )

    if (-not [string]::IsNullOrWhiteSpace($ExplicitValue)) {
        return $ExplicitValue.Trim()
    }

    $fromFile = Read-EnvFileValue -Path $envFilePath -Key "DATABASE_URL_NEON"
    if (-not [string]::IsNullOrWhiteSpace($fromFile)) {
        return $fromFile
    }

    $entered = Read-Host "Paste your Neon pooled connection string"
    if ([string]::IsNullOrWhiteSpace($entered)) {
        throw "DATABASE_URL_NEON was not provided."
    }

    return $entered.Trim()
}

if (-not (Test-Path $pythonExe)) {
    throw "Python executable not found at $pythonExe. Activate or create .venv first."
}

$resolvedDatabaseUrl = Resolve-DatabaseUrl -ExplicitValue $DatabaseUrl

if ($Save) {
    Write-EnvFileValue -Path $envFilePath -Key "DATABASE_URL_NEON" -Value $resolvedDatabaseUrl
    Write-Host "Saved DATABASE_URL_NEON to $envFilePath"
}

$env:DATABASE_URL_NEON = $resolvedDatabaseUrl

Write-Host "DATABASE_URL_NEON loaded for this session."
Write-Host "Running database validation..."
& $pythonExe (Join-Path $repoRoot "scripts\check_api_db.py")

if ($LASTEXITCODE -ne 0) {
    throw "Database validation failed. Fix the connection string or network access, then try again."
}

if ($StartApi) {
    Write-Host "Starting API at http://${ApiHost}:${ApiPort} ..."
    & $pythonExe -m uvicorn site_api.main:app --host $ApiHost --port $ApiPort
}