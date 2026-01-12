---
name: release
description: Automate Windrose release - update version/changelog, compile via Obsidian, test the compiled artifact, and tag for release. Use when preparing a new version of Windrose.
---

# Release Windrose

Guides you through the complete release process for Windrose.

## Prerequisites

Before running this skill:
1. All source changes should be committed
2. Know the new version number
3. Changelog for this version should already be written in `DungeonMapTracker.md`

The Datacore Compiler command ID is already configured: `dc-compiler:compile-projects-dungeon-map-tracker--compilersettings`

## Release Process

### Step 1: Extract and Confirm Changelog

1. Read `DungeonMapTracker.md` in the source repo (`C:\Users\whipl\OneDrive\Documents\Absalom\Projects\dungeon-map-tracker`)
2. Find the changelog section for the version being released (under `# Changelog`, look for `## Version X.Y.Z` or similar header)
3. Extract the full changelog content for this version (everything from the version header until the next version header or end of changelog section)
4. Present the extracted changelog to the user and ask them to confirm it looks correct before proceeding

**Important:** The user writes changelogs manually in `DungeonMapTracker.md`. Do NOT generate or modify changelog content - only extract what's already there.

### Step 2: Update Version Files

Update these files in the source repo (`C:\Users\whipl\OneDrive\Documents\Absalom\Projects\dungeon-map-tracker`):

1. **`dist/VERSION`** - Single line with version number (e.g., `1.5.1`)

2. **`dist/CHANGELOG.md`** - Copy the changelog content (confirmed in Step 1) to the top of this file

3. **`.compilersettings`** - Update the `"version"` field to match

### Step 3: Commit Version Updates

```bash
cd "C:\Users\whipl\OneDrive\Documents\Absalom\Projects\dungeon-map-tracker"
git add dist/VERSION dist/CHANGELOG.md .compilersettings
git commit -m "Bump version to X.Y.Z"
```

### Step 4: Run Release Pipeline

From the dev harness directory:

```bash
cd "C:\Dev\windrose"

# Dry run first (compiles and tests, but doesn't tag)
npm run release:dry

# If dry run passes, do the real release
npm run release
```

**Available flags:**
- `--dry-run` - Compile and test, but don't create/push tag
- `--skip-compile` - Skip compilation (use existing compiled artifact)
- `--skip-tests` - Skip E2E tests
- `--command=<id>` - Override the Datacore Compiler command ID

**Environment variables:**
- `WINDROSE_COMPILER_COMMAND` - Datacore Compiler command ID

### Step 5: Verify Release

After `npm run release` succeeds:
1. Check GitHub Actions for release workflow status
2. Verify the release appears at: https://github.com/[your-repo]/releases
3. Test the released artifact in a fresh Obsidian vault

## Troubleshooting

### Compilation Fails

**"Command not found" error:**
- Check that Datacore Compiler plugin is enabled in Obsidian
- Verify the command ID is correct (check Obsidian command palette)
- Set the correct ID: `npm run release -- --command=datacore-compiler:your-command-id`

**Timeout error:**
- Obsidian may be slow to start - try increasing timeout
- Check if another Obsidian instance is blocking

### Tests Fail

Run tests in isolation to debug:
```bash
# Run just the compiled artifact tests
npm run test:release

# Check which test maps are being used
echo $WINDROSE_TEST_MODE  # Should be "compiled"
```

Common issues:
- Compiled artifact has different export (`{ View: DungeonMapTracker }` vs `{ DungeonMapTracker }`)
- Test maps not pointing to compiled output
- Compiled artifact is stale (re-run compilation)

### Tag Already Exists

```bash
# Delete local tag
git tag -d vX.Y.Z

# Delete remote tag (if pushed)
git push origin :refs/tags/vX.Y.Z

# Update VERSION to new number and retry
```

## Manual Fallback

If automation fails, you can release manually:

### 1. Compile Manually
1. Open Obsidian with the Absalom vault
2. Open Command Palette (Ctrl+P)
3. Run the Datacore Compiler command for Windrose
4. Wait for compilation to complete

### 2. Test Manually
```bash
cd "C:\Dev\windrose"
set WINDROSE_TEST_MODE=compiled
npm run test:e2e
```

### 3. Tag Manually
```bash
cd "C:\Users\whipl\OneDrive\Documents\Absalom\Projects\dungeon-map-tracker"
git tag -a vX.Y.Z -m "Release X.Y.Z"
git push origin vX.Y.Z
```

## Quick Commands

```bash
# Full release (compile + test + tag)
npm run release

# Dry run (compile + test, no tag)
npm run release:dry

# Just compile
npm run release:compile

# Just test compiled artifact
npm run test:release

# Skip compilation (test existing artifact)
npm run release -- --skip-compile --dry-run
```
