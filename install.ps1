# install.ps1 — Supabase Guardian Skills installer (Windows)
# Copies the three skills into your Claude Code skills folder.
$ErrorActionPreference = "Stop"

$skillsSource = Join-Path $PSScriptRoot "skills"
$target = Join-Path $env:USERPROFILE ".claude\skills"

Write-Host ""
Write-Host "Installing Supabase Guardian skills..." -ForegroundColor Cyan
Write-Host "  From: $skillsSource"
Write-Host "  To:   $target"
Write-Host ""

if (-not (Test-Path $skillsSource)) {
    Write-Host "ERROR: skills folder not found next to this script." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $target)) {
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    Write-Host "Created skills directory: $target" -ForegroundColor Yellow
}

Get-ChildItem -Path $skillsSource -Directory | ForEach-Object {
    $dest = Join-Path $target $_.Name
    if (Test-Path $dest) {
        Write-Host "  ~ $($_.Name) already exists - overwriting" -ForegroundColor Yellow
        Remove-Item -Recurse -Force $dest
    }
    Copy-Item -Recurse -Path $_.FullName -Destination $dest
    Write-Host "  + $($_.Name)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done. Restart Claude Code to load the new skills." -ForegroundColor Cyan
Write-Host ""
