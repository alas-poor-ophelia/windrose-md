# E2E Testing for Windrose

End-to-end tests that launch real Obsidian instances via `obsidian-testing-framework` + Vitest + Playwright.

## Quick Start

```bash
npm run build                 # Build the plugin first
npm run test:e2e              # Run all E2E tests
npm run test:e2e -- --watch   # Watch mode
```

The plugin must be built before running E2E tests. The test setup copies `main.js`, `styles.css`, and `manifest.json` into the test vault's plugin directory.

## How It Works

1. `setup.ts` copies the built plugin into `test-vault/.obsidian/plugins/windrose-md/`
2. Each test launches a fresh Obsidian instance with the test vault
3. Tests navigate to fixture `.md` files containing `windrose-map` code blocks
4. The plugin renders maps, and tests interact via Playwright selectors
5. Data assertions read the JSON data file via Obsidian's vault API

## Test Files

| File | Purpose |
|------|---------|
| `smoke.test.ts` | Grid/hex map loading, canvas rendering, controls, transparency |
| `drawing-tools.test.ts` | Paint tool, cell filling, drawing operations |
| `undo-redo.test.ts` | History controls, undo/redo button state |
| `objects.test.ts` | Object sidebar, object placement |
| `object-placement.test.ts` | Object placement with data verification |
| `overlays.test.ts` | SVG overlay positioning alignment |
| `keyboard.test.ts` | Keyboard shortcuts (D=draw, E=erase, etc.) |
| `keyboard-integration.test.ts` | Keyboard shortcuts with data verification |
| `measurement.test.ts` | Measurement tool activation |
| `layers.test.ts` | Layer panel, adding/switching layers |
| `layer-management.test.ts` | Layer CRUD with data verification |
| `settings.test.ts` | Settings modal accessibility |
| `settings-persistence.test.ts` | Settings save/cancel with data verification |
| `persistence.test.ts` | Data persistence after drawing and navigation |
| `save-on-unmount.test.ts` | Save-on-unmount behavior |
| `text-labels.test.ts` | Text label tool and editor |
| `freehand-drawing.test.ts` | Freehand draw sub-tool |
| `circle-tool.test.ts` | Circle fill tool |
| `edge-drawing.test.ts` | Edge draw sub-tool |
| `hex-drawing.test.ts` | Hex map drawing and persistence |
| `fog-of-war.test.ts` | Fog of war painting |
| `visibility.test.ts` | Visibility toolbar toggles |
| `dungeon-generation.test.ts` | Dungeon generation and reroll |

### Supporting Files

| File | Purpose |
|------|---------|
| `helpers.ts` | Shared test utilities and constants |
| `setup.ts` | Plugin installation and fixture reset |
| `debug-launch.ts` | Manual Obsidian launch for debugging |

## Writing New Tests

### Basic Structure

```typescript
import {
  test, expect, navigateToMap, waitForContainer,
  setupErrorTracking, TEST_MAPS
} from "./helpers";

test("does something expected", async ({ page }) => {
  const errors = setupErrorTracking(page);
  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Test logic here
  const element = page.locator(".windrose-some-element");
  await expect(element).toBeVisible();

  expect(errors).toHaveLength(0);
});
```

### Common Helpers

```typescript
// Navigation
await navigateToMap(page, TEST_MAPS.grid);
await waitForContainer(page);  // Waits for .windrose-container

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
| Container | `.windrose-container` |
| Canvas | `.windrose-canvas-wrapper canvas` |
| Tool palette | `.windrose-tool-palette` |
| Tool button | `.windrose-tool-palette .windrose-tool-btn` |
| History controls | `.windrose-history-controls` |
| Settings button | `.windrose-expand-btn[title="Map Settings"]` |
| Layer panel | `.windrose-layer-panel` |
| Object sidebar | `.windrose-object-sidebar` |

## Test Fixtures

Located in `tests/fixtures/test-vault/`:

| Path | Purpose |
|------|---------|
| `_testing/smoke-test-map.md` | Grid map fixture (`windrose-map` code block) |
| `_testing/smoke-test-hex.md` | Hex map fixture |
| `_testing/dungeon-test-map.md` | Dungeon reroll test fixture |
| `_testing/dungeon-generation-test.md` | Generation test fixture (gets mutated) |
| `_test-data/dungeon-maps-data.json` | Data file (reset before each run) |
| `WINDROSE-DEBUG.json` | Redirects plugin data path for test isolation |

### Fixture Reset

The `setup.ts` script runs before tests:
- Copies clean JSON data from `fixtures/dungeon-maps-data.clean.json`
- Resets `dungeon-generation-test.md` from clean fixture
- Installs the built plugin (`main.js`, `styles.css`, `manifest.json`) into the test vault

## Debugging

### Debug Screenshots

On timeout, `waitForContainer()` saves screenshots to `tests/e2e/screenshots/`.

### Manual Obsidian Launch

```bash
npx ts-node tests/e2e/debug-launch.ts
```

Opens Obsidian with the test vault for manual inspection.

### Enable Verbose Logging

```typescript
page.on("console", msg => console.log("PAGE:", msg.text()));
```

## Configuration

E2E tests are configured in `vitest.config.ts`:

| Setting | Value |
|---------|-------|
| Test timeout | 60s |
| Hook timeout | 60s |
| Retry | 1 (flaky test recovery) |
| Pool | forks (singleFork, sequential) |
| Container timeout | 10s |
| Autosave wait | 3s |
