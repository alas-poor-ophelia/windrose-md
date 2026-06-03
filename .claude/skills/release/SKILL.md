---
name: release
description: Automate Windrose standalone plugin release - bump version, build, test, tag, and publish via GitHub Actions. Use when preparing a new version of Windrose.
---

# Release Windrose

Guides you through the complete release process for the Windrose standalone Obsidian plugin.

## Prerequisites

Before running this skill:
1. All source changes should be committed
2. Know the new version number (semver; BRAT allows suffixes like `2.0.0-preview`)
3. Changelog for this version should already be written in `src/Windrose Changelogs.md`

## Commit Messages

**CRITICAL:** Do NOT include any AI/LLM attribution in commit messages. No "Co-Authored-By: Claude", no "Generated with Claude Code", nothing. Keep commit messages clean and professional.

## Release Process

### Step 1: Extract and Confirm Changelog

1. Read `src/Windrose Changelogs.md`
2. Find the changelog section for the version being released
3. Present the extracted changelog to the user for confirmation
4. **Do NOT generate or modify changelog content** - only extract what's already there

### Step 2: Run Release Pipeline

From the dev root (`C:\Dev\windrose`):

```bash
# Dry run first (builds and tests, but doesn't tag/push)
npm run release:dry

# With version bump:
npm run release -- --bump 2.1.0 --dry-run

# If dry run passes, do the real release:
npm run release

# From a non-main branch (e.g. standalone-conversion):
npm run release -- --allow-branch
```

The release pipeline (`scripts/release/index.ts`) performs these steps:

1. **Bump version** (if `--bump` provided) - updates `manifest.json`, `package.json`, `versions.json` atomically
2. **Check prerequisites** - correct branch, no existing tag, verify gitignore
3. **Build production** - `npm run build:prod` (esbuild minified + SCSS compilation)
4. **Run tests** - unit tests always run; E2E optional via `--include-e2e`
5. **Commit version bump** - only if files changed (manifest.json, package.json, versions.json)
6. **Tag and push** - creates annotated `vX.Y.Z` tag, pushes branch + tag to origin
7. **Verify release** - polls GitHub for release with correct assets (main.js, styles.css, manifest.json)

### Step 3: Verify Release

After `npm run release` succeeds:
1. Check GitHub Actions for release workflow status
2. Verify the release appears at: https://github.com/alas-poor-ophelia/windrose-md/releases
3. For BRAT users: the release is automatically available once GitHub Actions completes
4. For manual install: download `main.js`, `styles.css`, `manifest.json` from the release

### Step 4: Merge to Main (when ready)

After the release is verified and any beta testing is complete:

```bash
git checkout main
git merge standalone-conversion --no-edit
git push origin main
```

## Available Flags

| Flag | Effect |
|------|--------|
| `--dry-run` | Build + test only, no commit/tag/push |
| `--bump X.Y.Z` | Bump version in manifest.json, package.json, versions.json before building |
| `--skip-tests` | Skip the test step entirely |
| `--skip-e2e` | Skip E2E tests (unit tests only) |
| `--allow-branch` | Allow release from any branch (default: main or release/*) |

## GitHub Actions Workflow

`.github/workflows/release.yml` triggers on:
- **Tag push** matching `v*` (normal flow from `npm run release`)
- **Manual dispatch** with a tag input (fallback)

The workflow:
1. Checks out the tagged commit
2. Installs dependencies (`npm ci`)
3. Builds production bundle (`npm run build:prod`)
4. Verifies `main.js`, `styles.css`, `manifest.json` exist
5. Creates a GitHub Release with those three files attached
6. Auto-marks as prerelease if version contains `-` (e.g. `2.0.0-preview`)

## Release Artifacts

Obsidian Community Plugins require exactly three files:

| File | Source |
|------|--------|
| `main.js` | esbuild production bundle (minified, single file) |
| `styles.css` | SCSS compilation (`sass scss/main.scss styles.css`) |
| `manifest.json` | Plugin metadata (id, version, minAppVersion, author) |

Additionally, `versions.json` maps plugin versions to minimum Obsidian versions for compatibility checking.

## Troubleshooting

### Build Fails

```bash
# Test build independently
npm run build:prod

# Check SCSS compilation
npm run build:css

# Verify outputs
ls -la main.js styles.css
```

### Tag Already Exists

```bash
# Delete local tag
git tag -d vX.Y.Z

# Delete remote tag (if pushed)
git push origin :refs/tags/vX.Y.Z

# Bump to new version and retry
npm run release -- --bump X.Y.Z+1
```

### GitHub Actions Didn't Trigger

```bash
# Manual dispatch as fallback
gh workflow run release.yml -f tag=vX.Y.Z
```

### Tests Fail During Release

Run tests in isolation:
```bash
npm run test:unit                    # Unit tests only
npm run test:e2e                     # E2E tests only
npx vitest run tests/unit/path.ts --config vitest.unit.config.ts  # Single file
```

## Quick Commands

```bash
# Full release
npm run release

# Dry run
npm run release:dry

# Bump + release
npm run release -- --bump 2.1.0

# Release from feature branch
npm run release -- --allow-branch

# Skip tests (use sparingly)
npm run release -- --skip-tests

# Build only (no release)
npm run build:prod
```
