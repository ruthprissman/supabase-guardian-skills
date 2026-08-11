# install.ps1 — Supabase Guardian Skills installer (Windows)
# Copies the three skills into every detected agent's skills folder
# (Claude Code: %USERPROFILE%\.claude\skills, Codex CLI: %USERPROFILE%\.codex\skills
# — both read the same open SKILL.md format).
$ErrorActionPreference = "Stop"

$skillsSource = Join-Path $PSScriptRoot "skills"

if (-not (Test-Path $skillsSource)) {
    Write-Host "ERROR: skills folder not found next to this script." -ForegroundColor Red
    exit 1
}

$targets = @()
if (Test-Path (Join-Path $env:USERPROFILE ".claude")) {
    $targets += Join-Path $env:USERPROFILE ".claude\skills"
}
if (Test-Path (Join-Path $env:USERPROFILE ".codex")) {
    $targets += Join-Path $env:USERPROFILE ".codex\skills"
}
if ($targets.Count -eq 0) {
    Write-Host "No existing .claude or .codex folder found - defaulting to Claude Code." -ForegroundColor Yellow
    $targets += Join-Path $env:USERPROFILE ".claude\skills"
}

Write-Host ""
Write-Host "Installing Supabase Guardian skills..." -ForegroundColor Cyan
Write-Host "  From: $skillsSource"
Write-Host ""

foreach ($target in $targets) {
    Write-Host "  To:   $target"
    if (-not (Test-Path $target)) {
        New-Item -ItemType Directory -Path $target -Force | Out-Null
    }
    Get-ChildItem -Path $skillsSource -Directory | ForEach-Object {
        $dest = Join-Path $target $_.Name
        if (Test-Path $dest) {
            Write-Host "    ~ $($_.Name) already exists - overwriting" -ForegroundColor Yellow
            Remove-Item -Recurse -Force $dest
        }
        Copy-Item -Recurse -Path $_.FullName -Destination $dest
        Write-Host "    + $($_.Name)" -ForegroundColor Green
    }
    Write-Host ""
}

Write-Host "Done. Restart your agent (Claude Code / Codex) to load the new skills." -ForegroundColor Cyan
Write-Host ""
