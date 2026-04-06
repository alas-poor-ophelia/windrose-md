#!/bin/bash
# Dev Loop: compile -> reload -> screenshot -> error check
# Gives Claude a single command for visual verification of UI changes.
#
# Usage:
#   bash scripts/dev-loop.sh                    # Full compile + reload + screenshot + errors
#   bash scripts/dev-loop.sh --no-compile       # Reload + screenshot + errors (skip compile)
#   bash scripts/dev-loop.sh --note "path/note" # Navigate to note before screenshot

set -euo pipefail

OBSIDIAN_CLI="$LOCALAPPDATA/Programs/obsidian/Obsidian.com"
VAULT="Absalom"
PLUGIN_ID="dungeon-map-tracker-settings"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SCREENSHOT_DIR="$PROJECT_ROOT/tests/e2e/screenshots"
SCREENSHOT_PATH="$SCREENSHOT_DIR/dev-loop-latest.png"

NO_COMPILE=false
NOTE=""

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-compile) NO_COMPILE=true; shift ;;
    --note) NOTE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# Ensure screenshot dir exists
mkdir -p "$SCREENSHOT_DIR"

# Step 1: Compile + reload (unless --no-compile)
if [[ "$NO_COMPILE" == "false" ]]; then
  echo "=== Compiling & reloading ==="
  npx tsx scripts/release/cli-compile.ts 2>&1 || echo "(compile exited non-zero, continuing to screenshot)"
else
  echo "=== Skipping compile, reloading plugin ==="
  "$OBSIDIAN_CLI" "vault=$VAULT" plugin:reload "id=$PLUGIN_ID"
fi

# Step 2: Brief pause for plugin to initialize
sleep 2

# Step 3: Navigate to note if specified
if [[ -n "$NOTE" ]]; then
  echo "=== Navigating to: $NOTE ==="
  "$OBSIDIAN_CLI" "vault=$VAULT" open "path=$NOTE"
  sleep 1
fi

# Step 4: Screenshot
echo "=== Taking screenshot ==="
"$OBSIDIAN_CLI" "vault=$VAULT" dev:screenshot "path=$(cygpath -w "$SCREENSHOT_PATH")"

# Step 5: Error check — filter known Datacore indexing noise
echo "=== Error check ==="
RAW_ERRORS=$("$OBSIDIAN_CLI" "vault=$VAULT" dev:errors 2>&1) || true

# Filter out known-noisy Datacore errors (indexing compiled output, null frontmatter)
FILTERED_ERRORS=$(echo "$RAW_ERRORS" | grep -v "Failed to index file:.*compiled-windrose-md\.md" \
  | grep -v "Cannot read properties of null (reading 'frontmatter')" \
  | grep -v "^$" || true)

if [[ -n "$FILTERED_ERRORS" ]]; then
  echo "$FILTERED_ERRORS"
else
  echo "No errors (filtered Datacore indexing noise)"
fi

echo "=== Screenshot saved: $SCREENSHOT_PATH ==="

# Exit non-zero only if real errors remain after filtering
if [[ -n "$FILTERED_ERRORS" ]]; then
  echo "WARNING: Errors detected"
  exit 1
fi
