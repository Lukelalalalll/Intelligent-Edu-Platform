$ErrorActionPreference = "Stop"

$runtimeDir = Join-Path $PSScriptRoot "runtime"
$pidFile = Join-Path $runtimeDir "opensearch.pid"

if (-not (Test-Path $pidFile)) {
    Write-Host "No PID file found. OpenSearch may already be stopped."
    exit 0
}

$pidValue = (Get-Content $pidFile -Raw).Trim()
if (-not $pidValue) {
    Remove-Item $pidFile -Force
    Write-Host "PID file was empty and has been cleaned up."
    exit 0
}

$process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
if (-not $process) {
    Remove-Item $pidFile -Force
    Write-Host "Process $pidValue is not running. PID file removed."
    exit 0
}

Stop-Process -Id $pidValue -Force
Remove-Item $pidFile -Force
Write-Host "Stopped OpenSearch. PID: $pidValue"
