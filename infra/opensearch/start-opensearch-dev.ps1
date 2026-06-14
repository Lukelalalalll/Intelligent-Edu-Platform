$ErrorActionPreference = "Stop"

$installDir = Join-Path $PSScriptRoot "opensearch-3.7.0"
$runtimeDir = Join-Path $PSScriptRoot "runtime"
$dataDir = Join-Path $runtimeDir "data"
$logsDir = Join-Path $runtimeDir "logs"
$pidFile = Join-Path $runtimeDir "opensearch.pid"
$exePath = Join-Path $installDir "bin\\opensearch.bat"

foreach ($dir in @($runtimeDir, $dataDir, $logsDir)) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir | Out-Null
    }
}

if (-not (Test-Path $exePath)) {
    throw "OpenSearch executable not found: $exePath"
}

if (Test-Path $pidFile) {
    $existingPid = (Get-Content $pidFile -Raw).Trim()
    if ($existingPid) {
        $existingProcess = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
        if ($existingProcess) {
            Write-Host "OpenSearch is already running. PID: $existingPid"
            exit 0
        }
    }
    Remove-Item $pidFile -Force
}

$health = $null
try {
    $health = Invoke-RestMethod "http://127.0.0.1:9200" -TimeoutSec 2
} catch {
}

if ($health) {
    Write-Host "OpenSearch is already responding on http://127.0.0.1:9200"
    exit 0
}

$env:OPENSEARCH_JAVA_OPTS = "-Xms1g -Xmx1g"

$process = Start-Process `
    -FilePath "cmd.exe" `
    -ArgumentList "/c", "`"$exePath`"" `
    -WorkingDirectory $installDir `
    -WindowStyle Hidden `
    -PassThru

$process.Id | Set-Content $pidFile

Write-Host "Starting OpenSearch. PID: $($process.Id)"
Write-Host "Waiting for http://127.0.0.1:9200 ..."

for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 2
    try {
        $response = Invoke-RestMethod "http://127.0.0.1:9200" -TimeoutSec 2
        Write-Host "OpenSearch is healthy."
        $response | ConvertTo-Json -Depth 4
        exit 0
    } catch {
        $process.Refresh()
        if ($process.HasExited) {
            Write-Host "OpenSearch exited during startup. Check logs in $logsDir"
            exit 1
        }
    }
}

Write-Host "OpenSearch did not become healthy in time. Check logs in $logsDir"
exit 1
