$ErrorActionPreference = "Stop"

$runtimeDir = Join-Path $PSScriptRoot "runtime"
$pidFile = Join-Path $runtimeDir "opensearch.pid"

$pidValue = $null
if (Test-Path $pidFile) {
    $pidValue = (Get-Content $pidFile -Raw).Trim()
}

$process = $null
if ($pidValue) {
    $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
}

try {
    $response = Invoke-RestMethod "http://127.0.0.1:9200" -TimeoutSec 2
    Write-Host "Status: healthy"
    if ($process) {
        Write-Host "PID: $pidValue"
    }
    $response | ConvertTo-Json -Depth 4
    exit 0
} catch {
    if ($process) {
        Write-Host "Status: process running but HTTP not ready"
        Write-Host "PID: $pidValue"
        exit 1
    }

    Write-Host "Status: stopped"
    exit 1
}
