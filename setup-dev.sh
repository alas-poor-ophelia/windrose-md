#!/bin/bash
# ============================================================================
# setup-dev.sh - Set up external dev environment for Windrose
# 
# This script creates a dev folder OUTSIDE your vault with all tooling,
# and symlinks src/ back to your vault's source files.
#
# Usage: ./setup-dev.sh [DEV_FOLDER]
#   DEV_FOLDER - Where to create dev environment (default: ~/Dev/windrose)
# ============================================================================

set -e

# === CONFIGURATION ===
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VAULT_SOURCE="$SCRIPT_DIR"
DEV_FOLDER="${1:-$HOME/Dev/windrose}"

echo ""
echo "Windrose Dev Environment Setup"
echo "==============================="
echo "Vault source:  $VAULT_SOURCE"
echo "Dev folder:    $DEV_FOLDER"
echo ""

# === CREATE DEV FOLDER ===
echo "[1/5] Creating dev folder..."
mkdir -p "$DEV_FOLDER"
echo "       Done."

# === COPY TOOLING FILES ===
echo "[2/5] Copying tooling files..."

# Copy config files if they exist
[ -f "$VAULT_SOURCE/package.json" ] && cp "$VAULT_SOURCE/package.json" "$DEV_FOLDER/"
[ -f "$VAULT_SOURCE/package-lock.json" ] && cp "$VAULT_SOURCE/package-lock.json" "$DEV_FOLDER/"
[ -f "$VAULT_SOURCE/tsconfig.json" ] && cp "$VAULT_SOURCE/tsconfig.json" "$DEV_FOLDER/"
[ -f "$VAULT_SOURCE/eslint.config.mjs" ] && cp "$VAULT_SOURCE/eslint.config.mjs" "$DEV_FOLDER/"
[ -f "$VAULT_SOURCE/manifest.json" ] && cp "$VAULT_SOURCE/manifest.json" "$DEV_FOLDER/"

# Copy ts-plugin-datacore folder
if [ -d "$VAULT_SOURCE/ts-plugin-datacore" ]; then
    mkdir -p "$DEV_FOLDER/ts-plugin-datacore"
    cp "$VAULT_SOURCE/ts-plugin-datacore/"* "$DEV_FOLDER/ts-plugin-datacore/"
fi

# Copy types folder
if [ -d "$VAULT_SOURCE/types" ]; then
    cp -r "$VAULT_SOURCE/types" "$DEV_FOLDER/"
fi

# Copy .vscode folder
if [ -d "$VAULT_SOURCE/.vscode" ]; then
    mkdir -p "$DEV_FOLDER/.vscode"
    cp "$VAULT_SOURCE/.vscode/"* "$DEV_FOLDER/.vscode/"
fi

echo "       Done."

# === INSTALL DEPENDENCIES ===
echo "[3/5] Installing dependencies..."
cd "$DEV_FOLDER"
npm install
cd "$VAULT_SOURCE"
echo "       Done."

# === CREATE SYMLINK ===
echo "[4/5] Creating src symlink to vault..."
if [ -e "$DEV_FOLDER/src" ]; then
    if [ -L "$DEV_FOLDER/src" ]; then
        echo "       Symlink already exists."
    else
        echo "       ERROR: src exists but is not a symlink."
        echo "       Please delete $DEV_FOLDER/src and run again."
        exit 1
    fi
else
    ln -s "$VAULT_SOURCE" "$DEV_FOLDER/src"
    echo "       Done."
fi

# === CLEANUP INSTRUCTIONS ===
echo "[5/5] Setup complete!"
echo ""
echo "==============================="
echo "NEXT STEPS:"
echo "==============================="
echo ""
echo "1. Open VS Code from the dev folder:"
echo "   code \"$DEV_FOLDER\""
echo ""
echo "2. Remove tooling files from your vault (optional but recommended):"
echo "   - package.json"
echo "   - package-lock.json"
echo "   - tsconfig.json"
echo "   - eslint.config.mjs"
echo "   - ts-plugin-datacore/"
echo "   - types/"
echo "   - .vscode/"
echo "   - node_modules/ (if present)"
echo ""
echo "3. Keep in vault (Datacore needs these):"
echo "   - All .js/.ts/.jsx/.tsx source files"
echo "   - manifest.json (if Datacore uses it)"
echo ""
echo "Your vault stays clean, VS Code works from $DEV_FOLDER"
echo ""