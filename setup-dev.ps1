# ============================================================================
# setup-dev.ps1 - Set up external dev environment for Windrose
# 
# This script creates a dev folder OUTSIDE your vault with all tooling,
# and symlinks src/ back to your vault's source files.
#
# Usage: .\setup-dev.ps1 [-DevFolder <path>]
#   -DevFolder  Where to create dev environment (default: C:\Dev\windrose)
#
# Requires: Developer Mode enabled OR run as Administrator for symlinks
# ============================================================================

param(
    [string]$DevFolder = "C:\Dev\windrose"
)

$ErrorActionPreference = "Stop"

# === CONFIGURATION ===
$VaultSource = $PSScriptRoot

Write-Host ""
Write-Host "Windrose Dev Environment Setup" -ForegroundColor Cyan
Write-Host "===============================" -ForegroundColor Cyan
Write-Host "Vault source:  $VaultSource"
Write-Host "Dev folder:    $DevFolder"
Write-Host ""

# === CREATE DEV FOLDER ===
Write-Host "[1/5] Creating dev folder..." -ForegroundColor Yellow
if (-not (Test-Path $DevFolder)) {
    New-Item -ItemType Directory -Path $DevFolder -Force | Out-Null
    Write-Host "       Created: $DevFolder" -ForegroundColor Green
} else {
    Write-Host "       Already exists: $DevFolder" -ForegroundColor Gray
}

# === COPY TOOLING FILES ===
Write-Host "[2/5] Copying tooling files..." -ForegroundColor Yellow

$filesToCopy = @(
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "eslint.config.mjs",
    "manifest.json"
)

foreach ($file in $filesToCopy) {
    $sourcePath = Join-Path $VaultSource $file
    if (Test-Path $sourcePath) {
        Copy-Item $sourcePath -Destination $DevFolder -Force
    }
}

# Copy ts-plugin-datacore folder
$pluginSource = Join-Path $VaultSource "ts-plugin-datacore"
if (Test-Path $pluginSource) {
    $pluginDest = Join-Path $DevFolder "ts-plugin-datacore"
    if (-not (Test-Path $pluginDest)) {
        New-Item -ItemType Directory -Path $pluginDest -Force | Out-Null
    }
    Copy-Item "$pluginSource\*" -Destination $pluginDest -Force
}

# Copy types folder
$typesSource = Join-Path $VaultSource "types"
if (Test-Path $typesSource) {
    Copy-Item $typesSource -Destination $DevFolder -Recurse -Force
}

# Copy .vscode folder
$vscodeSource = Join-Path $VaultSource ".vscode"
if (Test-Path $vscodeSource) {
    $vscodeDest = Join-Path $DevFolder ".vscode"
    if (-not (Test-Path $vscodeDest)) {
        New-Item -ItemType Directory -Path $vscodeDest -Force | Out-Null
    }
    Copy-Item "$vscodeSource\*" -Destination $vscodeDest -Force
}

Write-Host "       Done." -ForegroundColor Green

# === INSTALL DEPENDENCIES ===
Write-Host "[3/5] Installing dependencies..." -ForegroundColor Yellow
Push-Location $DevFolder
try {
    npm install
} finally {
    Pop-Location
}
Write-Host "       Done." -ForegroundColor Green

# === CREATE SYMLINK ===
Write-Host "[4/5] Creating src symlink to vault..." -ForegroundColor Yellow
$symlinkPath = Join-Path $DevFolder "src"

if (Test-Path $symlinkPath) {
    $item = Get-Item $symlinkPath -Force
    if ($item.LinkType -eq "SymbolicLink") {
        Write-Host "       Symlink already exists." -ForegroundColor Gray
    } else {
        Write-Host "       ERROR: src exists but is not a symlink." -ForegroundColor Red
        Write-Host "       Please delete $symlinkPath and run again." -ForegroundColor Red
        exit 1
    }
} else {
    try {
        New-Item -ItemType SymbolicLink -Path $symlinkPath -Target $VaultSource | Out-Null
        Write-Host "       Done." -ForegroundColor Green
    } catch {
        Write-Host ""
        Write-Host "       ERROR: Failed to create symlink." -ForegroundColor Red
        Write-Host "       Make sure Developer Mode is enabled, or run as Administrator." -ForegroundColor Red
        Write-Host "       Error: $_" -ForegroundColor Red
        exit 1
    }
}

# === CLEANUP INSTRUCTIONS ===
Write-Host "[5/5] Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "===============================" -ForegroundColor Cyan
Write-Host "NEXT STEPS:" -ForegroundColor Cyan
Write-Host "===============================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Open VS Code from the dev folder:" -ForegroundColor White
Write-Host "   code `"$DevFolder`"" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Remove tooling files from your vault (optional but recommended):" -ForegroundColor White
Write-Host "   - package.json" -ForegroundColor Gray
Write-Host "   - package-lock.json" -ForegroundColor Gray
Write-Host "   - tsconfig.json" -ForegroundColor Gray
Write-Host "   - eslint.config.mjs" -ForegroundColor Gray
Write-Host "   - ts-plugin-datacore\" -ForegroundColor Gray
Write-Host "   - types\" -ForegroundColor Gray
Write-Host "   - .vscode\" -ForegroundColor Gray
Write-Host "   - node_modules\ (if present)" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Keep in vault (Datacore needs these):" -ForegroundColor White
Write-Host "   - All .js/.ts/.jsx/.tsx source files" -ForegroundColor Gray
Write-Host ""
Write-Host "Your vault stays clean, VS Code works from $DevFolder" -ForegroundColor Green
Write-Host ""