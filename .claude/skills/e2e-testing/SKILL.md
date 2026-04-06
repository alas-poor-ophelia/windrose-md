# E2E Testing Patterns

Reference this skill when writing, debugging, or modifying E2E tests for Windrose. E2E tests launch real Obsidian instances via Playwright and interact with the Dungeon Map Tools component.

## Stack & Configuration

- **obsidian-testing-framework** — manages Obsidian instance lifecycle
- **Playwright** — automates Obsidian UI (Electron app)
- **Vitest** — test runner with retry support

```typescript
// vitest.config.ts (E2E)
pool: "forks",
poolOptions: { forks: { singleFork: true } },  // Sequential, NOT parallel
testTimeout: 60000,
hookTimeout: 60000,
retry: 1  // Retry flaky tests once
```

Unit tests (`vitest.unit.config.ts`) use parallel threads with 5s timeout — completely different config.

## Two Test Modes

| | Dev Mode (default) | Compiled Mode |
|---|---|---|
| Command | `npm run test:e2e` | `WINDROSE_TEST_MODE=compiled npm run test:e2e` |
| Source | `src/` symlinked files | `dist/compiled-windrose-md.md` |
| Container timeout | 10s | 60s |
| Autosave wait | 3s | 4s |
| Data file | `_test-data/dungeon-maps-data.json` | `windrose-md-data.json` |
| Fixtures | `smoke-test-map.md` | `smoke-test-compiled.md` |

Compiled mode is 6x slower because Datacore must index the entire ~15k line bundle. Don't reduce the 60s timeout.

## Essential Helpers

### waitForContainer(page, timeout?)

**Always call this after navigation.** It handles:
1. Waiting for markdown view to load
2. Dismissing plugin installer modal if it appears
3. Polling for `.dmt-container` visibility
4. Detecting Datacore errors vs "getting ready" state
5. Auto-screenshot to `tests/e2e/screenshots/` on timeout

```typescript
await navigateToMap(page, TEST_MAPS.grid);
await waitForContainer(page);  // REQUIRED — never skip
```

### waitForToolPalette(page)

**Always call after `waitForContainer` before any tool interaction.** Waits for the tool palette to render. Without this, tool button clicks fail silently.

```typescript
await waitForContainer(page);
await waitForToolPalette(page);  // REQUIRED before tool clicks
```

### setupErrorTracking(page)

Captures Windrose-specific console errors (matching `windrose`, `dmt`, `dungeon`):

```typescript
const errors = setupErrorTracking(page);
// ... test logic ...
expect(errors).toHaveLength(0);  // Always verify at end
```

### getCanvasCenter(page)

Returns absolute page coordinates of canvas geometric center. **Does NOT account for the object sidebar overlap** — you must offset manually if clicking near the left edge:

```typescript
const center = await getCanvasCenter(page);
// Offset to avoid sidebar overlap area
await page.mouse.click(center.x - 150, center.y - 150);
```

### focusCanvas(page)

Clicks canvas and waits 100ms — required before keyboard shortcuts.

### selectToolByTitle(page, titlePattern)

Select a tool button by its title attribute (preferred over index — robust to toolbar changes):

```typescript
await selectToolByTitle(page, "Rectangle");  // Matches title*="Rectangle"
```

### selectToolByIndex(page, index)

Select a tool by position. More brittle — use `selectToolByTitle` when possible.

### selectSubTool(page, parentToolTitle, subToolLabel)

Open a tool's subtool menu and select a sub-option.

### openLayerPanel(page) / openSettingsModal(page)

**These are toggles.** Calling `openLayerPanel` twice will close it. The layer panel and controls are revealed by hovering `.dmt-controls` first.

**Important:** The layer panel intercepts mouse events. Close it before canvas interactions:
```typescript
await openLayerPanel(page);
// ... layer operations ...
await openLayerPanel(page);  // Close it — otherwise canvas clicks won't work
```

### Complete Helper Reference

| Helper | Purpose |
|--------|---------|
| `waitForContainer(page, timeout?)` | Wait for DMT component to load |
| `waitForToolPalette(page)` | Wait for tool buttons to render |
| `setupErrorTracking(page)` | Capture console errors |
| `navigateToMap(page, path)` | Navigate to a test map file |
| `getCanvasCenter(page)` | Get canvas center coordinates (raw, no sidebar offset) |
| `focusCanvas(page)` | Click canvas for keyboard focus |
| `selectToolByIndex(page, n)` | Select tool by toolbar position |
| `selectToolByTitle(page, title)` | Select tool by title attribute (preferred) |
| `selectSubTool(page, parent, sub)` | Select a subtool from menu |
| `getHistoryButtons(page)` | Get undo/redo button locators |
| `openSettingsModal(page)` / `closeSettingsModal(page)` | Toggle settings modal |
| `openLayerPanel(page)` | Toggle layer panel (hover + click) |
| `openLayerContextMenu(page, index)` | Right-click a layer row |
| `clickTransparencyToggle(page, index)` | Toggle layer transparency |
| `isTransparencyToggleActive(page, index)` | Check transparency state |
| `expandObjectSidebarIfNeeded(page)` | Ensure object sidebar is open |
| `doWithApp(page, callback, data?)` | Run code in Obsidian's JS context |

### Constants

| Constant | Purpose |
|----------|---------|
| `TEST_MAPS.grid` / `TEST_MAPS.hex` | Map fixture paths (mode-aware) |
| `MAP_IDS.grid` / `MAP_IDS.dungeonTest` | Map IDs for data file lookups |
| `DATA_FILE_PATH` | Path to data JSON (mode-aware) |
| `AUTOSAVE_WAIT` | Delay after drawing before reading data (3s dev / 4s compiled) |

## DMT Selectors

All component elements use the `.dmt-` prefix:

| Element | Selector |
|---------|----------|
| Container | `.dmt-container` |
| Canvas | `.dmt-canvas-wrapper canvas` |
| Tool palette | `.dmt-tool-palette` |
| Tool buttons | `.dmt-tool-btn` |
| Active tool | `.dmt-tool-btn-active` |
| History controls | `.dmt-history-controls` |
| History buttons | `.dmt-history-btn` |
| Layer panel | `.dmt-layer-panel` |
| Layer controls | `.dmt-layer-controls` |
| Layer buttons | `.dmt-layer-btn` |
| Layer active | `.dmt-layer-btn-active` |
| Layer add | `.dmt-layer-add-btn` |
| Layer wrapper | `.dmt-layer-btn-wrapper` |
| Transparency toggle | `.dmt-layer-option-btn.transparency` |
| Controls area | `.dmt-controls` (hover to reveal panel buttons) |
| Object sidebar | `.dmt-object-sidebar` |
| Sidebar toggle | `.dmt-sidebar-toggle` |
| Object items | `.dmt-object-item` |
| Settings button | `.dmt-expand-btn[title="Map Settings"]` |
| Subtool menu | `.dmt-subtool-menu` |
| Plugin installer | `.dmt-plugin-installer` |

**Tool button selection:** Prefer `selectToolByTitle(page, "Rectangle")` over `.nth(3)` — tool indices shift when new tools are added.

## Fixture Structure

```
tests/fixtures/test-vault/
├── _testing/
│   ├── smoke-test-map.md           # Grid map fixture
│   └── smoke-test-hex.md           # Hex map fixture
├── _test-data/
│   └── dungeon-maps-data.json      # Dev mode data
└── windrose-md-data.json           # Compiled mode data
```

- Fixtures reset from `.clean.json` files before each test run
- Source files are **symlinked**, not copied — changes appear immediately
- Use `TEST_MAPS.grid` / `TEST_MAPS.hex` constants, not hardcoded paths

## Canvas Interaction Patterns

### Click to Paint/Erase

```typescript
await selectToolByTitle(page, "Draw");
await page.waitForTimeout(100);

const center = await getCanvasCenter(page);
await page.mouse.click(center.x - 150, center.y - 150);  // Offset from sidebar
await page.waitForTimeout(200);  // Wait for render
```

### Drag for Rectangle/Circle

```typescript
const canvas = page.locator(".dmt-canvas-wrapper canvas").first();
const box = await canvas.boundingBox();

const startX = box!.x + box!.width * 0.3;
const startY = box!.y + box!.height * 0.3;
const endX = box!.x + box!.width * 0.6;
const endY = box!.y + box!.height * 0.6;

await page.mouse.move(startX, startY);
await page.mouse.down();
await page.mouse.move(endX, endY, { steps: 5 });  // steps required for smooth drag
await page.mouse.up();
await page.waitForTimeout(300);
```

### Relative Canvas Click

```typescript
await canvas.click({
  position: {
    x: box!.width / 3,    // Relative to canvas origin
    y: box!.height / 3
  }
});
```

### Canvas Coordinate Gotcha

The object sidebar overlaps the left portion of the canvas. `getCanvasCenter()` returns the raw geometric center — it does NOT account for the sidebar. Manual coordinate math should use `center.x - 150, center.y - 150` type offsets to avoid clicking under the sidebar.

## Data Verification

Use `doWithApp()` to access Obsidian APIs from the test context.

**Important:** The callback runs in Obsidian's JS sandbox via `page.evaluate()`. It **cannot close over outer-scope variables**. Pass data as the third argument:

```typescript
// CORRECT — data passed as 3rd arg, received as 2nd param in callback
const cellCount = await doWithApp(page, async (app: any, params: any) => {
  const file = app.vault.getAbstractFileByPath(params.dataPath);
  const content = await app.vault.read(file);
  const data = JSON.parse(content);
  return data.maps[params.mapId].layers[0].cells.length;
}, { dataPath: DATA_FILE_PATH, mapId: MAP_IDS.grid });

expect(cellCount).toBeGreaterThan(0);
```

```typescript
// WRONG — closure over outer variable will be undefined in sandbox
const myMapId = "smoke-test-map-001";
await doWithApp(page, async (app: any) => {
  return data.maps[myMapId];  // myMapId is undefined here!
});
```

Always wait `AUTOSAVE_WAIT` after drawing before reading data:
```typescript
await page.waitForTimeout(AUTOSAVE_WAIT);
const count = await getTotalCellCount(page, MAP_IDS.grid);
```

## Test Template

```typescript
import {
  setupErrorTracking, navigateToMap, waitForContainer,
  waitForToolPalette, selectToolByTitle, getCanvasCenter,
  doWithApp, TEST_MAPS, MAP_IDS, DATA_FILE_PATH, AUTOSAVE_WAIT
} from "./helpers";

test("specific behavior", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  // ... interactions ...

  expect(errors).toHaveLength(0);
});
```

Note: Tests use bare `test()` calls at the top level — no `describe()` wrapper.

## Running Tests

```bash
npm run test:e2e                           # All E2E tests (~35-40s)
npm run test:e2e -- smoke.test.ts          # Single file
npm run test:e2e -- -t "Grid map loads"    # By test name
WINDROSE_TEST_MODE=compiled npm run test:e2e  # Compiled mode
```

## Known Flaky Tests

- **Freehand curve drawing** — mouse-based drawing on canvas often fails to produce curve data. When ALL freehand tests fail, it's environment flakiness, not code.
- **Keyboard shortcuts** — timing-sensitive, may need `focusCanvas()` + extra waits.
- **Persistence tests** — autosave delay means assertions must wait `AUTOSAVE_WAIT` after drawing.
- **Diagonal fill** — geometry-dependent, may fail on certain canvas sizes.

## Anti-Patterns

| Mistake | Consequence | Fix |
|---------|------------|-----|
| Skipping `waitForContainer()` | Test fails randomly | Always call after navigation |
| Skipping `waitForToolPalette()` | Tool clicks fail silently | Always call before tool interaction |
| Skipping `setupErrorTracking()` | Errors go undetected | Always set up and verify at end |
| Hardcoded fixture paths | Breaks in compiled mode | Use `TEST_MAPS` constants |
| Hardcoded data file path | Reads wrong file in dev mode | Use `DATA_FILE_PATH` constant |
| Closing over variables in `doWithApp` | Values are undefined in sandbox | Pass data as 3rd arg |
| `page.mouse.move()` without `steps` | Drag operations miss intermediate cells | Add `{ steps: 5 }` |
| Checking DOM immediately after click | Canvas hasn't rendered yet | Wait 100-200ms after interactions |
| Reading data without `AUTOSAVE_WAIT` | Stale data from before autosave | Wait `AUTOSAVE_WAIT` after drawing |
| Reducing compiled mode timeout | Tests fail on slow machines | Keep 60s — Datacore indexing is the bottleneck |
| Modifying symlinked fixture files | Corrupts source repo | Fixtures are symlinks — only modify `.clean.json` copies |
| Using bare `npx vitest run` | Runs E2E config (default), not unit | Use `npm run test:unit` for unit tests |
| Generic selectors like `canvas` | May match other Obsidian elements | Use `.dmt-canvas-wrapper canvas` |
| Tool selection by `.nth()` index | Breaks when tools are added/reordered | Use `selectToolByTitle()` instead |
| Not closing layer panel before canvas ops | Panel intercepts mouse events | Call `openLayerPanel()` again to toggle closed |
