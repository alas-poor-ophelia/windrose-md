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
3. Changelog for this version should already be written in `Windrose Changelogs.md`

The Datacore Compiler command ID is already configured: `dc-compiler:compile-projects-dungeon-map-tracker--compilersettings`

## Release Process

### Step 1: Extract and Confirm Changelog

1. Read `Windrose Changelogs.md` in the source repo (`C:\Users\whipl\OneDrive\Documents\Absalom\Projects\dungeon-map-tracker`)
2. Find the changelog section for the version being released (under `# Changelog`, look for `## Version X.Y.Z` or similar header)
3. Extract the full changelog content for this version - **IMPORTANT: Stop at the next `## Version` header**. Only include content from the target version's header until (but not including) the next version header.
4. Present the extracted changelog to the user in a markdown code block (triple backticks) so they can preview the exact formatting that will be used
5. Ask them to confirm it looks correct before proceeding

**Important:** The user writes changelogs manually in `Windrose Changelogs.md`. Do NOT generate or modify changelog content - only extract what's already there. Be strict about version boundaries - each version section ends where the next one begins.

## Commit Messages

**CRITICAL:** Do NOT include any AI/LLM attribution in commit messages. No "Co-Authored-By: Claude", no "Generated with Claude Code", no "via Happy", nothing. Keep commit messages clean and professional - just describe what the commit does.

### Step 2: Update Version Files

Update these files in the source repo (`C:\Users\whipl\OneDrive\Documents\Absalom\Projects\dungeon-map-tracker`):

1. **`dist/VERSION`** - Single line with version number (e.g., `1.5.1`)

2. **`dist/CHANGELOG.md`** - **REPLACE** the entire file contents with ONLY the changelog for this version. Do NOT append or prepend - the file should contain ONLY the current version's changelog. Previous version notes are NOT preserved.

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

The release pipeline performs these steps:
1. Compile via Obsidian's Datacore Compiler
2. Run E2E tests against compiled artifact
3. Commit the compiled artifact (if changed)
4. Push the branch to origin and **verify** the push succeeded (always runs, even with `--skip-compile`)
5. Create and push version tag (triggers GitHub Actions release)
6. Wait for GitHub release, download the zip, and **verify** the artifact matches local

**CRITICAL: The pipeline has safeguards to prevent tagging the wrong commit:**
- Verifies push completed before tagging
- Verifies HEAD hasn't changed between commit and tag
- Warns if the compiled artifact wasn't modified in the current commit

**Always use `npm run release`** - never manually create tags or run steps out of order.

**Available flags:**
- `--dry-run` - Compile and test, but don't commit/tag
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

### Step 6: Merge Release Branch to Main

After the release is verified, merge the release branch back into main and push:

```bash
cd "C:\Users\whipl\OneDrive\Documents\Absalom\Projects\dungeon-map-tracker"
git checkout main
git merge release/vX.Y.Z --no-edit
git push origin main
```

This ensures main has the compiled artifact commit, version bump, and any fixes made during the release process (e.g. NativeModalPortal fix in v1.6.0). Without this step, the README, docs, and other files pushed on the release branch won't be visible on the main branch on GitHub.

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

### Tag Points to Wrong Commit

If a release was created but the zip contains wrong/stale code, the tag was likely created before the artifact commit was pushed:

```bash
cd "C:\Users\whipl\OneDrive\Documents\Absalom\Projects\dungeon-map-tracker"

# Check what commit the tag points to vs HEAD
git show vX.Y.Z --quiet  # Shows tagged commit
git log -1 --oneline     # Shows current HEAD

# If they differ and HEAD has the correct artifact:
git push origin :refs/tags/vX.Y.Z  # Delete remote tag
git tag -d vX.Y.Z                   # Delete local tag
git tag -a vX.Y.Z -m "Release X.Y.Z"  # Recreate on HEAD
git push origin vX.Y.Z             # Push new tag
```

This will trigger GitHub Actions to create a new release with the correct artifact.

## Manual Fallback

**⚠️ WARNING:** Only use manual steps if `npm run release` fails and you understand why. Manual releases are error-prone - the v1.5.5 release bug was caused by tagging before the artifact commit was pushed.

If automation fails, you can release manually, but **follow this order exactly**:

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

### 3. Commit and Push Artifact (MUST complete before tagging!)
```bash
cd "C:\Users\whipl\OneDrive\Documents\Absalom\Projects\dungeon-map-tracker"
git add dist/compiled-windrose-md.md dist/VERSION
git commit -m "Release X.Y.Z: compiled artifact"
git push

# CRITICAL: Verify the push succeeded before proceeding!
git fetch origin main
git log -1 --oneline origin/main  # Should show "Release X.Y.Z: compiled artifact"
```

### 4. Tag Manually (ONLY after push is verified!)
```bash
cd "C:\Users\whipl\OneDrive\Documents\Absalom\Projects\dungeon-map-tracker"
# Verify you're on the right commit
git log -1 --oneline  # Should show "Release X.Y.Z: compiled artifact"

git tag -a vX.Y.Z -m "Release X.Y.Z"
git push origin vX.Y.Z
```

**Common mistake:** Creating the tag before the artifact commit is pushed. This causes GitHub Actions to build a release from the wrong commit (missing the compiled artifact).

## Quick Commands

```bash
# Full release (compile + test + commit + tag)
npm run release

# Dry run (compile + test, no commit/tag)
npm run release:dry

# Just compile
npm run release:compile

# Just test compiled artifact
npm run test:release

# Skip compilation (test existing artifact)
npm run release -- --skip-compile --dry-run
```
