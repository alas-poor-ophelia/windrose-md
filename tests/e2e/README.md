# E2E Testing for Windrose

End-to-end tests that launch real Obsidian instances via `obsidian-testing-framework` + Vitest + Playwright.

## Quick Start

```bash
npm run test:e2e              # Run all E2E tests (~35-40s)
npm run test:e2e -- --watch   # Watch mode
```

## Test Modes

Tests can run against uncompiled source or the compiled artifact, controlled by `WINDROSE_TEST_MODE`:

### Dev Mode (Default)

```bash
npm run test:e2e
```

- Uses source files from `src/` (via symlink)
- Fixtures: `_testing/smoke-test-map.md`, `_testing/smoke-test-hex.md`
- Data file: `_test-data/dungeon-maps-data.json`
- Container timeout: 10s

### Compiled Mode

```bash
# Windows (cmd)
set WINDROSE_TEST_MODE=compiled && npm run test:e2e

# Windows (PowerShell)
$env:WINDROSE_TEST_MODE="compiled"; npm run test:e2e

# Unix/macOS
WINDROSE_TEST_MODE=compiled npm run test:e2e
```

- Uses compiled artifact (`dist/compiled-windrose-md.md`)
- Data file: `windrose-md-data.json` (vault root)
- Container timeout: 60s (Datacore indexes entire ~15k line bundle)
- **Use for:** Pre-release validation, debugging release-specific issues

### Why Compiled Mode is Slower

Datacore must parse and index the entire bundled artifact before the component can render. In dev mode, it only loads the specific modules needed.

## Test Files

| File | Purpose |
|------|---------|
| `smoke.test.ts` | Grid/hex map loading, canvas rendering, controls init |
| `drawing-tools.test.ts` | Paint tool, cell filling, drawing operations |
| `undo-redo.test.ts` | History controls, undo/redo button state |
| `objects.test.ts` | Object placement on grid and hex maps |
| `overlays.test.ts` | SVG overlay positioning alignment |
| `keyboard.test.ts` | Keyboard shortcuts (D=draw, E=erase, etc.) |
| `measurement.test.ts` | Measurement tool activation |
| `layers.test.ts` | Layer panel, adding layers |
| `settings.test.ts` | Settings modal accessibility |
| `persistence.test.ts` | Data persistence after drawing |
| `dungeon-generation.test.ts` | Dungeon generation functionality |

### Supporting Files

| File | Purpose |
|------|---------|
| `helpers.ts` | Shared test utilities and constants |
| `setup.ts` | Test vault symlinks and fixture reset |
| `debug-launch.ts` | Manual Obsidian launch for debugging |

## Writing New Tests

### Basic Structure

```typescript
import { describe, beforeAll, afterAll, beforeEach } from "vitest";
import {
  test, expect, navigateToMap, waitForContainer,
  setupErrorTracking, TEST_MAPS
} from "./helpers";

describe("My Feature", () => {
  let errors: string[] = [];

  beforeAll(async ({ browser }) => {
    // Setup if needed
  });

  test("does something expected", async ({ page }) => {
    errors = setupErrorTracking(page);
    await navigateToMap(page, TEST_MAPS.grid);
    await waitForContainer(page);

    // Test logic here
    const element = page.locator(".dmt-some-element");
    await expect(element).toBeVisible();

    expect(errors).toHaveLength(0);
  });
});
```

### Common Helpers

```typescript
// Navigation
await navigateToMap(page, "_testing/smoke-test-map.md");
await waitForContainer(page);  // Waits for .dmt-container

// Tools
await selectToolByIndex(page, 1);  // 0=select, 1=draw, 2=erase, 3=rect, 4=circle
await selectToolByTitle(page, "Draw");
await selectSubTool(page, "Draw", "Freehand");

// Canvas
const center = await getCanvasCenter(page);
await focusCanvas(page);

// UI Panels
await openSettingsModal(page);
await closeSettingsModal(page);
await openLayerPanel(page);
await expandObjectSidebarIfNeeded(page);

// Data verification
const cellCount = await getLayerCellCount(page, mapId, layerId);
const totalCells = await getTotalCellCount(page, mapId);
```

### Selectors

| Element | Selector |
|---------|----------|
| Container | `.dmt-container` |
| Canvas | `.dmt-canvas-wrapper canvas` |
| Tool palette | `.dmt-tool-palette` |
| Tool button | `.dmt-tool-palette .dmt-tool-btn` |
| History controls | `.dmt-history-controls` |
| Settings button | `.dmt-expand-btn[title="Map Settings"]` |
| Layer panel | `.dmt-layer-panel` |
| Object sidebar | `.dmt-object-sidebar` |

## Test Fixtures

Located in `tests/fixtures/test-vault/`:

| Path | Purpose |
|------|---------|
| `_testing/smoke-test-map.md` | Grid map fixture |
| `_testing/smoke-test-hex.md` | Hex map fixture |
| `_testing/dungeon-generation-test.md` | Generation test fixture |
| `_test-data/dungeon-maps-data.json` | Dev mode data file |

### Fixture Reset

The `setup.ts` script resets fixtures before each test run:
- Copies clean JSON data from `fixtures/*.clean.json`
- Creates symlinks to main vault (Datacore, source files)
- For compiled mode, copies and patches the compiled artifact

## Debugging

### Debug Screenshots

On timeout, `waitForContainer()` saves screenshots to `tests/e2e/screenshots/`.

### Manual Obsidian Launch

```bash
npx ts-node tests/e2e/debug-launch.ts
```

Opens Obsidian with the test vault for manual inspection.

### Enable Verbose Logging

Add `console.log()` in helpers or use:

```typescript
page.on("console", msg => console.log("PAGE:", msg.text()));
```

## Configuration

E2E tests are configured in `vitest.e2e.config.ts`:

```typescript
export default defineConfig({
  test: {
    include: ["tests/e2e/**/*.test.ts"],
    testTimeout: 120000,
    hookTimeout: 60000,
    globalSetup: "./tests/e2e/setup.ts",
  },
});
```

## Timeouts

| Operation | Dev Mode | Compiled Mode |
|-----------|----------|---------------|
| Container ready | 10s | 60s |
| Autosave wait | 3s | 4s |
| Test timeout | 120s | 120s |

Compiled mode timeouts are longer because Datacore must index the entire bundled artifact on first load.
