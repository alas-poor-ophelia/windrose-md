# Windrose Development Environment

## Critical Rules

**DO NOT:**
- Read or write `compiled-windrose-md.md` - This is a generated artifact. Modify source files instead.
- Include AI attribution in commits (no "Co-Authored-By: Claude", "Generated with Claude Code", etc.)

**Two-repo structure:**
- **Source repo:** `C:\Users\whipl\OneDrive\Documents\Absalom\Projects\dungeon-map-tracker`
- **Dev harness:** `C:\Dev\windrose` (this directory)

The `src/` directory is a symlink to the source repo. Edit files via `src/` but understand they live in the Obsidian vault.

## Structure

```
windrose/                     # Dev root (this directory)
├── src/ → symlink            # Actual source (in Obsidian vault)
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
npm run test:unit   # Unit tests (~300ms)
npm run test:e2e    # E2E tests (~35-40s)
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

## Git Commits

**No AI attribution in commits.** Keep commit messages clean and professional.
