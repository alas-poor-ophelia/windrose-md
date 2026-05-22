# E2E Testing Setup

## Status
**Phase 1 Complete** - Basic smoke tests operational

## Overview
Automated E2E testing using `obsidian-testing-framework` to catch compile/load errors and verify basic functionality without manual Obsidian testing.

## Philosophy & Decisions

### Staged Approach
1. **Phase 1 (Complete)**: Basic smoke tests - verify Windrose loads and renders
2. **Phase 2 (Future)**: Tool & UI tests - tool selection, basic interactions, overlay rendering
3. **Phase 3 (Future)**: Unit tests for pure TS functions (geometry, color ops, etc.)

### Test Isolation
- Dedicated test vault at `tests/fixtures/test-vault/` keeps main dev vault untouched
- Each test launches isolated Obsidian instance via `--user-data-dir`
- Tests can run while Obsidian is open (no single-instance conflicts)

### Source File Testing
- Tests run against source JSX files, not compiled output
- Project folder symlinked into test vault for live testing
- Changes immediately testable without build step

## Technical Implementation

### Files Created
```
tests/
├── e2e/
│   ├── setup.ts          # Creates symlinks before test suite
│   └── smoke.test.ts     # Smoke tests
└── fixtures/
    └── test-vault/
        ├── .obsidian/    # Isolated Obsidian config
        ├── Projects/     # Symlink → source files
        └── _testing/     # Test notes
```

### Framework Patches (`patches/obsidian-testing-framework+0.1.5.patch`)
1. **Windows path fix**: Corrected Obsidian executable location
2. **Isolated instances**: `--user-data-dir` flag prevents conflicts
3. **Vault config setup**: Pre-configures vault in temp directory
4. **Auto-enable plugins**: Clicks through safe mode prompt
5. **Auto-close settings**: Dismisses settings window with Escape
6. **Fast indexing check**: Skips wait if metadata cache already initialized

### Test Vault Setup (`tests/e2e/setup.ts`)
Runs before test suite via Vitest `globalSetup`:
- Symlinks `Projects/dungeon-map-tracker/` from main vault
- Symlinks `datacore` plugin from main vault
- Falls back to copying if symlinks fail (Windows permissions)

### Configuration
- `vitest.config.ts`: Test runner config with vault path injection
- `package.json`: Added `test:e2e` and `postinstall` (patch-package) scripts

## Current Tests

### `smoke.test.ts`
1. **Windrose loads without errors** (~1.5s)
   - Navigates to test map
   - Waits for `.dmt-container` and `.dmt-canvas-wrapper`
   - Verifies canvas has dimensions
   - Checks for Windrose-specific JS errors

2. **Windrose controls render** (~1.4s)
   - Navigates to test map
   - Verifies `.dmt-controls` and `.dmt-compass` visible

## Usage
```bash
npm run test:e2e
```

## Future Phases

### Phase 2: Tool & UI Tests
- Tool selection (paint, rectangle, circle, erase)
- Canvas click registration
- Undo/redo functionality
- Object overlay rendering
- Fog of war layer

### Phase 3: Unit Tests
Target pure functions that don't need Obsidian:
- `src/geometry/GridGeometry.ts`
- `src/geometry/HexGeometry.ts`
- `src/utils/colorOperations.ts`
- `src/utils/distanceOperations.ts`

## Performance
- Total test time: ~3.5s for 2 tests
- Per-test overhead: ~1.5s (Obsidian + Datacore startup)
- Optimized by checking `metadataCache.initialized` before waiting
