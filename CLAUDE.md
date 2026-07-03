# Windrose Development Environment

## Critical Rules

**DO NOT:**
- Read or write `compiled-windrose-md.md` - This is a generated artifact. Modify source files instead.
- Include AI attribution in commits (no "Co-Authored-By: Claude", "Generated with Claude Code", etc.)
- **NEVER blame OneDrive for anything.** The vault path contains the folder name `OneDrive` (`C:\Users\whipl\OneDrive\...`), but **OneDrive sync is DISABLED at the system level** — it is off, it does not sync this vault, and it never will. The path string is a historical folder name, nothing more. Do not attribute file I/O slowness, lag, file locks, sync storms, or any other behavior to OneDrive. It is never the cause. (The user has corrected this dozens of times.)

**Single-repo standalone structure:**
- `src/` is a **real, tracked directory** in this repo (≈264 source files) — the actual plugin source. It is **NOT a symlink**; the source was migrated out of the Obsidian vault into the repo (single-repo unification).
- Build here; `npm run deploy` copies `main.js`/`styles.css`/`manifest.json` into the vault plugin folder for live testing.
- An old copy still exists at `C:\Users\whipl\OneDrive\Documents\Absalom\Projects\dungeon-map-tracker` as a **preserved backup, pending deletion** — it is stale; do not read or edit it.

## Structure

```
windrose/                     # Dev root (this directory)
├── src/                      # Plugin source (real tracked directory, ~264 files)
├── types/                    # TypeScript definitions (#types/*)
├── tests/
│   ├── unit/                 # Unit tests (fast, no Obsidian)
│   ├── e2e/                  # E2E tests (11 test files)
│   └── fixtures/test-vault/  # Test vault with fixtures
├── node_modules/             # Dependencies (outside vault)
└── .claude/                  # Claude Code config & skills
```

## Commands

```bash
npm run build       # Build main.js with esbuild
npm run deploy      # Build + copy main.js/styles.css/manifest.json to vault
npm run build:watch # Watch mode (rebuilds on file change)
npm run test:unit   # Unit tests (~4s)
npm run test:e2e    # E2E tests (FULL SUITE ~15 MIN — see Test Output Capture below)
npm run check       # Typecheck + lint
```

## Documentation

| Topic | Location |
|-------|----------|
| Architecture & coding patterns | `src/CLAUDE.md` |
| Adding features | `docs/CONTRIBUTING.md` |
| Unit testing | `tests/unit/README.md` |
| E2E testing | `tests/e2e/README.md` |
| Release automation | `.claude/skills/release/SKILL.md` |

## When to Run Tests

| Change Type | Unit Tests | E2E Tests |
|-------------|------------|-----------|
| Geometry math/algorithms | Required | Optional |
| Utils (pure functions) | Required | Optional |
| Component rendering | Optional | Required |
| Tool interactions | Optional | Required |
| Before committing | Required | Required |

## Test Output Capture (E2E)

The full E2E suite takes ~15 minutes. **NEVER truncate its live output** (`| Select-Object -Last N`, `| Select-String`, `| tail`) — a truncated failing run loses the failure list and costs a full re-run just to learn which tests failed. This has happened repeatedly.

- Every `npm run test:e2e` run automatically writes full machine-readable results to `test-results.json` (vitest `json` reporter, gitignored). Read failures from there after the run — the console can be truncated with impunity, the JSON cannot be lost.
- PowerShell one-liner to list failures from the last run:
  ```powershell
  $r = Get-Content test-results.json -Raw | ConvertFrom-Json
  $r.testResults | Where-Object { $_.status -ne 'passed' } | ForEach-Object { $f = $_.name; $_.assertionResults | Where-Object { $_.status -eq 'failed' } | ForEach-Object { "$f :: $($_.fullName)" } }
  ```
- If you must pipe console output, `Tee-Object` to a file first and filter the file afterward.

## Documentation Maintenance

After structural changes (moving files, adding directories, renaming modules), check whether any `CLAUDE.md` files need updating. Each major directory has its own:

| File | Covers |
|------|--------|
| `src/CLAUDE.md` | Architecture, file organization, coding patterns |
| `src/geometry/CLAUDE.md` | Geometry system, coordinate spaces, IGeometry |
| `src/hooks/CLAUDE.md` | Hook directory structure, patterns, composition |
| `src/context/CLAUDE.md` | React contexts, provider pattern |
| `src/components/mapcanvas/CLAUDE.md` | Layer components, canvas architecture |
| `src/components/settings/CLAUDE.md` | Settings modal, tabs, reducer |
| `src/settingsplugin/CLAUDE.md` | Settings plugin assembly, template strings |

Keep these accurate — they're the first thing an agent reads when working in that area.

## Git Commits

**No AI attribution in commits.** Keep commit messages clean and professional.
