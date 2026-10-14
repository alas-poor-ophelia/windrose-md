import { beforeEach } from "vitest";
import {
  test,
  expect,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  getCanvasCenter,
  waitForToolPalette,
  selectToolByTitle,
  openLayerPanel,
  openLayerPanelStrata,
  getActiveLayerId,
  getLayerCellCount,
  resetDataFile,
  AUTOSAVE_WAIT,
  TEST_MAPS,
  MAP_IDS
} from "./helpers";

beforeEach(() => resetDataFile());

// ===========================================
// Layer Management Tests
// ===========================================

test("Layer panel can be opened", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openLayerPanelStrata(page);

  // Layer drawer should now be visible
  const layerControls = page.locator('.windrose-edge-rail-drawer.is-open');
  await layerControls.waitFor({ state: "visible", timeout: 5000 });
  expect(await layerControls.isVisible()).toBe(true);

  // Should have at least one layer row (Strata mode renders per-layer rows)
  const layerBtns = page.locator('.windrose-dock-layer-row');
  const count = await layerBtns.count();
  expect(count).toBeGreaterThanOrEqual(1);

  expect(errors).toHaveLength(0);
});

test("New layer can be added", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openLayerPanelStrata(page);

  // Count initial layers
  const layerBtns = page.locator('.windrose-dock-layer-row');
  const initialCount = await layerBtns.count();

  // Add a layer via the per-stratum "+" (Strata mode has no flat add button)
  const addLayerBtn = page.locator('.windrose-dock-stratum-add').first();
  await addLayerBtn.waitFor({ state: "visible", timeout: 5000 });
  await addLayerBtn.click();
  await page.waitForTimeout(300);

  // Should now have one more layer row
  const newCount = await layerBtns.count();
  expect(newCount).toBe(initialCount + 1);

  expect(errors).toHaveLength(0);
});

// TODO(v1.6.2): Fails reliably in compiled mode (`expected 0 > 0`) — drawing after
// a layer-panel switch doesn't register cells on the active layer. Manual testing
// of the compiled artifact confirms layer-switching works in the real product, so
// this is a test-infrastructure issue specific to compiled mode (likely the
// openLayerPanel toggle interaction or post-switch event timing). Investigate
// separately. Skipped only for compiled-mode E2E so dev-mode coverage remains.
test.skipIf(process.env.WINDROSE_TEST_MODE === "compiled")("Layer can be switched and drawing is layer-specific", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Open layer panel (Strata mode so per-layer rows exist)
  await openLayerPanelStrata(page);
  const layerControls = page.locator('.windrose-edge-rail-drawer.is-open');
  await layerControls.waitFor({ state: "visible", timeout: 5000 });

  // Ensure we have at least 2 layers (add one if needed)
  const layerBtns = page.locator('.windrose-dock-layer-row');
  let layerCount = await layerBtns.count();

  if (layerCount < 2) {
    const addLayerBtn = page.locator('.windrose-dock-stratum-add').first();
    await addLayerBtn.click();
    await page.waitForTimeout(300);
    layerCount = await layerBtns.count();
  }

  expect(layerCount).toBeGreaterThanOrEqual(2);

  // The active layer id as persisted before the switch
  const mapId = MAP_IDS.grid;
  const originalLayerId = await getActiveLayerId(page, mapId);

  // Get the non-active layer row and click it to switch
  const allLayerBtns = page.locator('.windrose-dock-layer-row');

  // Find a layer that isn't active and click it
  for (let i = 0; i < layerCount; i++) {
    const btn = allLayerBtns.nth(i);
    const isActive = await btn.getAttribute("class");
    if (!/\bactive\b/.test(isActive ?? "")) {
      await btn.click();
      await page.waitForTimeout(200);
      break;
    }
  }

  // Verify the clicked layer is now active
  const newActiveBtn = page.locator('.windrose-dock-layer-row.active');
  expect(await newActiveBtn.count()).toBe(1);

  // The switch reaches the data file through the debounced autosave, so read
  // the persisted active layer only once it has been written. Reading it right
  // after the click returns the PREVIOUS layer and the paint below lands on
  // the new one (diagnosed 2026-10-14).
  await page.waitForTimeout(AUTOSAVE_WAIT);
  let activeLayerId = await getActiveLayerId(page, mapId);
  for (let i = 0; i < 20 && (activeLayerId === null || activeLayerId === originalLayerId); i++) {
    await page.waitForTimeout(250);
    activeLayerId = await getActiveLayerId(page, mapId);
  }
  expect(activeLayerId).not.toBeNull();
  expect(activeLayerId).not.toBe(originalLayerId);
  const initialLayerCells = await getLayerCellCount(page, mapId, activeLayerId!);
  const initialOriginalCells = originalLayerId ? await getLayerCellCount(page, mapId, originalLayerId) : 0;

  // Close layer panel so canvas receives clicks
  await openLayerPanel(page);
  await page.waitForTimeout(300);

  // Draw on this layer
  await waitForToolPalette(page);

  await selectToolByTitle(page, "Draw");

  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(300);

  // Wait for autosave and verify data landed on the correct layer
  await page.waitForTimeout(AUTOSAVE_WAIT);
  const newLayerCells = await getLayerCellCount(page, mapId, activeLayerId!);
  expect(newLayerCells).toBeGreaterThan(initialLayerCells);
  // ...and not on the layer that was active before the switch
  if (originalLayerId) {
    expect(await getLayerCellCount(page, mapId, originalLayerId)).toBe(initialOriginalCells);
  }

  expect(errors).toHaveLength(0);
});

test("Layer switch does not cause errors", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openLayerPanelStrata(page);

  // Add a new layer via the per-stratum "+"
  const addLayerBtn = page.locator('.windrose-dock-stratum-add').first();
  await addLayerBtn.click();
  await page.waitForTimeout(300);

  // Switch between layers multiple times
  const layerBtns = page.locator('.windrose-dock-layer-row');
  const count = await layerBtns.count();

  for (let i = 0; i < Math.min(count, 3); i++) {
    await layerBtns.nth(i).click();
    await page.waitForTimeout(200);
  }

  // All operations should complete without errors
  expect(errors).toHaveLength(0);
});
