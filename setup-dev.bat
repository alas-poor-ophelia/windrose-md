@echo off
REM ============================================================================
REM setup-dev.bat - Set up external dev environment for Windrose
REM 
REM This script creates a dev folder OUTSIDE your vault with all tooling,
REM and symlinks src/ back to your vault's source files.
REM
REM Usage: setup-dev.bat [DEV_FOLDER]
REM   DEV_FOLDER - Where to create dev environment (default: C:\Dev\windrose)
REM
REM Requires: Developer Mode enabled OR run as Administrator for symlinks
REM ============================================================================

setlocal EnableDelayedExpansion

REM === CONFIGURATION ===
set "VAULT_SOURCE=%~dp0"
set "DEV_FOLDER=%~1"
if "%DEV_FOLDER%"=="" set "DEV_FOLDER=C:\Dev\windrose"

REM Remove trailing backslash if present
if "%VAULT_SOURCE:~-1%"=="\" set "VAULT_SOURCE=%VAULT_SOURCE:~0,-1%"

echo.
echo Windrose Dev Environment Setup
echo ===============================
echo Vault source:  %VAULT_SOURCE%
echo Dev folder:    %DEV_FOLDER%
echo.

REM === CREATE DEV FOLDER ===
echo [1/5] Creating dev folder...
if not exist "%DEV_FOLDER%" (
    mkdir "%DEV_FOLDER%"
    echo       Created: %DEV_FOLDER%
) else (
    echo       Already exists: %DEV_FOLDER%
)

REM === COPY TOOLING FILES ===
echo [2/5] Copying tooling files...

REM These files should exist in vault during initial setup, then get removed
if exist "%VAULT_SOURCE%\package.json" (
    copy /Y "%VAULT_SOURCE%\package.json" "%DEV_FOLDER%\" >nul
)
if exist "%VAULT_SOURCE%\package-lock.json" (
    copy /Y "%VAULT_SOURCE%\package-lock.json" "%DEV_FOLDER%\" >nul
)
if exist "%VAULT_SOURCE%\tsconfig.json" (
    copy /Y "%VAULT_SOURCE%\tsconfig.json" "%DEV_FOLDER%\" >nul
)
if exist "%VAULT_SOURCE%\eslint.config.mjs" (
    copy /Y "%VAULT_SOURCE%\eslint.config.mjs" "%DEV_FOLDER%\" >nul
)
if exist "%VAULT_SOURCE%\manifest.json" (
    copy /Y "%VAULT_SOURCE%\manifest.json" "%DEV_FOLDER%\" >nul
)

REM Copy ts-plugin-datacore folder
if exist "%VAULT_SOURCE%\ts-plugin-datacore" (
    if not exist "%DEV_FOLDER%\ts-plugin-datacore" mkdir "%DEV_FOLDER%\ts-plugin-datacore"
    copy /Y "%VAULT_SOURCE%\ts-plugin-datacore\*" "%DEV_FOLDER%\ts-plugin-datacore\" >nul
)

REM Copy types folder
if exist "%VAULT_SOURCE%\types" (
    xcopy /Y /E /I "%VAULT_SOURCE%\types" "%DEV_FOLDER%\types" >nul
)

REM Copy .vscode folder
if exist "%VAULT_SOURCE%\.vscode" (
    if not exist "%DEV_FOLDER%\.vscode" mkdir "%DEV_FOLDER%\.vscode"
    copy /Y "%VAULT_SOURCE%\.vscode\*" "%DEV_FOLDER%\.vscode\" >nul
)

echo       Done.

REM === INSTALL DEPENDENCIES ===
echo [3/5] Installing dependencies...
pushd "%DEV_FOLDER%"
call npm install
popd
echo       Done.

REM === CREATE SYMLINK ===
echo [4/5] Creating src symlink to vault...
if exist "%DEV_FOLDER%\src" (
    fsutil reparsepoint query "%DEV_FOLDER%\src" >nul 2>nul
    if !errorlevel! equ 0 (
        echo       Symlink already exists.
    ) else (
        echo       ERROR: src exists but is not a symlink.
        echo       Please delete %DEV_FOLDER%\src and run again.
        exit /b 1
    )
) else (
    mklink /D "%DEV_FOLDER%\src" "%VAULT_SOURCE%"
    if !errorlevel! neq 0 (
        echo.
        echo       ERROR: Failed to create symlink.
        echo       Make sure Developer Mode is enabled, or run as Administrator.
        exit /b 1
    )
    echo       Done.
)

REM === CLEANUP INSTRUCTIONS ===
echo [5/5] Setup complete!
echo.
echo ===============================
echo NEXT STEPS:
echo ===============================
echo.
echo 1. Open VS Code from the dev folder:
echo    code "%DEV_FOLDER%"
echo.
echo 2. Remove tooling files from your vault (optional but recommended):
echo    - package.json
echo    - package-lock.json
echo    - tsconfig.json
echo    - eslint.config.mjs
echo    - ts-plugin-datacore\
echo    - types\
echo    - .vscode\
echo    - node_modules\ (if present)
echo.
echo 3. Keep in vault (Datacore needs these):
echo    - All .js/.ts/.jsx/.tsx source files
echo    - manifest.json (if Datacore uses it)
echo.
echo Your vault stays clean, VS Code works from %DEV_FOLDER%
echo.

endlocal