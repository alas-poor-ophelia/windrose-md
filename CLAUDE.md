# Windrose Development Environment

This is the development root for Windrose. Source code lives in `src/` (symlinked to the Obsidian vault). See `src/CLAUDE.md` for project architecture and coding patterns.

## Structure

```
windrose/                     # Dev root (this directory)
├── src/ → symlink            # Actual source (in Obsidian vault)
├── types/                    # TypeScript definitions (#types/*)
├── tests/                    # E2E tests
│   ├── e2e/smoke.test.ts
│   └── fixtures/test-vault/  # Test vault with fixtures
├── node_modules/             # Dependencies (outside vault)
└── .claude/                  # Claude Code config & hooks
```

## E2E Tests

```bash
npm run test:e2e    # Run all E2E tests (~35-40s)
npm run check       # Typecheck + lint
```

Tests use `obsidian-testing-framework` which launches real Obsidian instances.

### Test Fixtures
- `tests/fixtures/test-vault/_testing/smoke-test-map.md` - Grid map
- `tests/fixtures/test-vault/_testing/smoke-test-hex.md` - Hex map
- `tests/fixtures/test-vault/Garden/90 - Data/12 - Meta/JSON/` - Data persistence

### Adding Tests
1. Add tests to `tests/e2e/smoke.test.ts`
2. Use existing helpers: `navigateToMap()`, `waitForContainer()`, `setupErrorTracking()`
3. Tool buttons: `.dmt-tool-palette .dmt-tool-btn.nth(N)` (0=select, 1=draw, 2=erase, 3=rect, 4=circle)
4. Canvas: `.dmt-canvas-wrapper canvas`

## When to Run Tests

- After modifying source files in `src/`
- After changing test fixtures
- Before committing changes that affect map rendering or tools
