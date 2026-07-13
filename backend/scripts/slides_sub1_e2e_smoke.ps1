param(
    [string]$BaseUrl = "http://127.0.0.1:5009"
)

$ErrorActionPreference = "Stop"

Write-Host "[1/5] Checking themes..."
$themes = Invoke-RestMethod -Method GET -Uri "$BaseUrl/api/slides/get_themes"
if (-not $themes -or $themes.Count -lt 1) {
    throw "No themes returned from /api/slides/get_themes"
}
$themeName = $themes[0].name
Write-Host "  themes_count=$($themes.Count), first_theme=$themeName"

Write-Host "[2/5] Checking placeholders for first theme..."
$placeholders = Invoke-RestMethod -Method GET -Uri "$BaseUrl/api/slides/get_placeholders/$themeName"
Write-Host "  placeholders_count=$($placeholders.Count)"

Write-Host "[3/5] Generating PPT from minimal schema..."
$schema = @{
    presentation_title = "Smoke Test"
    slides = @(
        @{
            title = "Slide 1"
            content = @("Point A", "Point B")
            layout = @{
                name = "Content"
                placeholders = @()
            }
        }
    )
    metadata = @{}
}

$body = @{ ppt_schema = $schema } | ConvertTo-Json -Depth 12
$generate = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/slides/generate_ppt" -ContentType "application/json" -Body $body
if ($generate.status -ne "success") {
    throw "PPT generation failed"
}
Write-Host "  generated_file=$($generate.filename)"

Write-Host "[4/5] Downloading generated PPT..."
$download = Invoke-WebRequest -Method GET -Uri "$BaseUrl/api/slides/download_ppt/$($generate.filename)" -UseBasicParsing
if ($download.StatusCode -ne 200) {
    throw "Download failed for generated PPT"
}
Write-Host "  download_status=$($download.StatusCode)"

Write-Host "[5/5] Probing delivery route auth behavior..."
$deliveryPayload = @{
    title = "Delivery Smoke"
    ppt_schema = @{ slides = @(@{ title = "S1"; content = @("A") }) }
    script_style = "classroom"
    locale = "en"
} | ConvertTo-Json -Depth 8

try {
    Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/slides/delivery/jobs" -ContentType "application/json" -Body $deliveryPayload | Out-Null
    Write-Host "  delivery_route=unexpected_success (check auth config)"
} catch {
    if ($_.Exception.Response) {
        $statusCode = [int]$_.Exception.Response.StatusCode
        Write-Host "  delivery_http_status=$statusCode"
    } else {
        Write-Host "  delivery_error=$($_.Exception.Message)"
    }
}

Write-Host "Smoke test finished successfully."
