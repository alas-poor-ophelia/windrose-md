# Windrose Development Environment

This is the development root for Windrose. Source code lives in `src/` (symlinked to the Obsidian vault). See `src/CLAUDE.md` for project architecture and coding patterns.

## Structure

```
windrose/                     # Dev root (this directory)
├── src/ → symlink            # Actual source (in Obsidian vault)
├── types/                    # TypeScript definitions (#types/*)
├── tests/
│   ├── unit/                 # Unit tests (fast, no Obsidian)
│   │   ├── datacore-transformer.ts  # Vite plugin for Datacore→ESM
│   │   └── geometry/         # Geometry module tests
│   ├── e2e/smoke.test.ts     # E2E tests (require Obsidian)
│   └── fixtures/test-vault/  # Test vault with fixtures
├── node_modules/             # Dependencies (outside vault)
└── .claude/                  # Claude Code config & hooks
```

## Commands

```bash
npm run test:unit   # Run unit tests (~300ms)
npm run test:e2e    # Run E2E tests (~35-40s)
npm run check       # Typecheck + lint
```

## Unit Tests

Fast tests that run without Obsidian. Use for testing pure logic in geometry/, utils/, and some hooks/.

See `tests/unit/README.md` for:
- How the Datacore transformer works
- Adding new modules to MODULE_MAP
- Writing new unit tests

### Current Coverage
- `GridGeometry.ts` - Coordinate transforms, shape algorithms, distance
- `HexGeometry.ts` - Both flat-top and pointy-top orientations
- `cellAccessor.ts` - Cell type detection and manipulation

## E2E Tests

Full integration tests that launch real Obsidian instances via `obsidian-testing-framework`.

### Test Fixtures
- `tests/fixtures/test-vault/_testing/smoke-test-map.md` - Grid map
- `tests/fixtures/test-vault/_testing/smoke-test-hex.md` - Hex map
- `tests/fixtures/test-vault/Garden/90 - Data/12 - Meta/JSON/` - Data persistence

### Adding E2E Tests
1. Add tests to `tests/e2e/smoke.test.ts`
2. Use existing helpers: `navigateToMap()`, `waitForContainer()`, `setupErrorTracking()`
3. Tool buttons: `.dmt-tool-palette .dmt-tool-btn.nth(N)` (0=select, 1=draw, 2=erase, 3=rect, 4=circle)
4. Canvas: `.dmt-canvas-wrapper canvas`

## When to Run Tests

| Change Type | Unit Tests | E2E Tests |
|-------------|------------|-----------|
| Geometry math/algorithms | ✅ Required | Optional |
| Utils (pure functions) | ✅ Required | Optional |
| Component rendering | Optional | ✅ Required |
| Tool interactions | Optional | ✅ Required |
| Before committing | ✅ Required | ✅ Required |

## Git Commits

**No AI attribution in commits.** Do not include "Co-Authored-By: Claude", "Generated with Claude Code", "via Happy", or any other AI/LLM signatures. Keep commit messages clean and professional.
