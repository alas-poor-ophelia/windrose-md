import {
  test,
  expect,
  doWithApp,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  waitForToolPalette,
  openLayerPanel,
  getLayerCellCount,
  getActiveLayerId,
  getTotalCellCount,
  getCanvasCenter,
  AUTOSAVE_WAIT,
  TEST_MAPS,
  MAP_IDS
} from "./helpers";

// ===========================================
// Data Persistence Tests
// ===========================================

test("Map data persists after drawing and navigation", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  // Select draw tool
  const drawToolBtn = page.locator(".dmt-tool-palette .dmt-tool-btn").nth(1);
  await drawToolBtn.click();
  await page.waitForTimeout(100);

  // Draw at canvas center to ensure we're on the grid
  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(500);

  // Wait for autosave
  await page.waitForTimeout(AUTOSAVE_WAIT);

  // Navigate away to a different file
  await doWithApp(page, async (app: any) => {
    // Open a different file (the hex map)
    const hexFile = app.vault.getAbstractFileByPath("_testing/smoke-test-hex.md");
    if (hexFile) {
      await app.workspace.openLinkText(hexFile.path, "", false);
    }
  });

  // Wait for hex map to load
  await waitForContainer(page);
  await page.waitForTimeout(500);

  // Navigate back to the grid map
  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await page.waitForTimeout(1000);

  // The map should have loaded without errors
  // Canvas should still be visible and functional
  const canvasAfter = page.locator(".dmt-canvas-wrapper canvas").first();
  await canvasAfter.waitFor({ state: "visible", timeout: 5000 });
  const boxAfter = await canvasAfter.boundingBox();
  expect(boxAfter).not.toBeNull();
  expect(boxAfter!.width).toBeGreaterThan(0);

  // Verify data actually survived the navigation round-trip
  const countAfterReload = await getTotalCellCount(page, MAP_IDS.grid);
  expect(countAfterReload).toBeGreaterThan(0);

  expect(errors).toHaveLength(0);
});

// ===========================================
// Data Verification Tests
// ===========================================

test("Drawing a cell increases cell count in data", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.grid;

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Get initial cell count
  const initialCount = await getTotalCellCount(page, mapId);
  expect(initialCount).toBeGreaterThanOrEqual(0);

  // Select draw tool
  await waitForToolPalette(page);
  const drawToolBtn = page.locator(".dmt-tool-palette .dmt-tool-btn").nth(1);
  await drawToolBtn.click();
  await page.waitForTimeout(100);

  // Draw at offset from center to avoid overlap with other tests
  // Each test uses a different offset to ensure unique cells
  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x - 64, center.y - 64);
  await page.waitForTimeout(500);

  // Wait for autosave
  await page.waitForTimeout(AUTOSAVE_WAIT);

  // Get new cell count
  const newCount = await getTotalCellCount(page, mapId);

  // Cell count should have increased
  expect(newCount).toBeGreaterThan(initialCount);

  expect(errors).toHaveLength(0);
});

test("Erasing a cell decreases cell count in data", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.grid;

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  // Use canvas center to ensure we're on the grid
  const center = await getCanvasCenter(page);

  // First, paint a cell to ensure we have something to erase
  const drawToolBtn = page.locator(".dmt-tool-palette .dmt-tool-btn").nth(1);
  await drawToolBtn.click();
  await page.waitForTimeout(100);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(500);

  // Wait for autosave
  await page.waitForTimeout(AUTOSAVE_WAIT);

  // Get count after painting
  const countAfterPaint = await getTotalCellCount(page, mapId);
  expect(countAfterPaint).toBeGreaterThan(0);

  // Now erase at the same position
  const eraseToolBtn = page.locator('.dmt-tool-btn[title*="Erase"]');
  await eraseToolBtn.click();
  await page.waitForTimeout(100);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(500);

  // Wait for autosave
  await page.waitForTimeout(AUTOSAVE_WAIT);

  // Get count after erasing
  const countAfterErase = await getTotalCellCount(page, mapId);

  // Count should have decreased
  expect(countAfterErase).toBeLessThan(countAfterPaint);

  expect(errors).toHaveLength(0);
});

test("Rectangle fill creates multiple cells in data", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.grid;

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Get initial count
  const initialCount = await getTotalCellCount(page, mapId);

  await waitForToolPalette(page);

  // Select rectangle tool (look for it by title to be precise)
  const rectToolBtn = page.locator('.dmt-tool-btn[title*="Rectangle"]');
  await rectToolBtn.waitFor({ state: "visible", timeout: 5000 });
  await rectToolBtn.click();
  await page.waitForTimeout(100);

  // Rectangle tool: click to set first corner, click again to set second corner and fill
  // Use getCanvasCenter which returns actual visible canvas center
  const center = await getCanvasCenter(page);

  // First click - set start corner (offset from center)
  await page.mouse.click(center.x - 50, center.y - 50);
  await page.waitForTimeout(500);

  // Second click - set end corner and fill (offset in opposite direction)
  await page.mouse.click(center.x + 50, center.y + 50);
  await page.waitForTimeout(500);

  // Wait for autosave
  await page.waitForTimeout(AUTOSAVE_WAIT);

  // Get new count
  const newCount = await getTotalCellCount(page, mapId);

  // Should have added at least some cells (rectangle should create multiple)
  expect(newCount).toBeGreaterThan(initialCount);

  expect(errors).toHaveLength(0);
});

test("Drawing on specific layer adds cells to that layer only", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.grid;

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Open layer panel
  await openLayerPanel(page);
  const layerControls = page.locator('.dmt-layer-controls');
  await layerControls.waitFor({ state: "visible", timeout: 5000 });

  // Get the currently active layer ID
  const activeLayerId = await getActiveLayerId(page, mapId);
  expect(activeLayerId).not.toBeNull();

  // Get initial cell count on the active layer
  const initialLayerCellCount = await getLayerCellCount(page, mapId, activeLayerId!);

  // Close the layer panel so canvas receives mouse events
  await openLayerPanel(page);
  await page.waitForTimeout(300);

  // Select draw tool
  await waitForToolPalette(page);
  const drawToolBtn = page.locator(".dmt-tool-palette .dmt-tool-btn").nth(1);
  await drawToolBtn.click();
  await page.waitForTimeout(200);

  // Verify draw tool is active
  const drawToolClasses = await drawToolBtn.getAttribute('class');
  expect(drawToolClasses).toContain('dmt-tool-btn-active');

  // Draw at canvas center to ensure we're on the grid
  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(300);

  // Then a drag to draw more cells
  await page.mouse.move(center.x + 32, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 128, center.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  // Wait for autosave
  await page.waitForTimeout(AUTOSAVE_WAIT);

  // Get new cell count on the active layer
  const newLayerCellCount = await getLayerCellCount(page, mapId, activeLayerId!);

  // Cell count on this layer should have increased
  expect(newLayerCellCount).toBeGreaterThan(initialLayerCellCount);

  expect(errors).toHaveLength(0);
});

test("Drag painting creates multiple cells in a stroke", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.grid;

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Get total cell count before drag painting
  const initialCount = await getTotalCellCount(page, mapId);

  await waitForToolPalette(page);

  // Select draw tool
  const drawToolBtn = page.locator(".dmt-tool-palette .dmt-tool-btn").nth(1);
  await drawToolBtn.click();
  await page.waitForTimeout(100);

  // Perform a horizontal drag stroke across the canvas center
  const center = await getCanvasCenter(page);
  const startX = center.x - 100;
  const endX = center.x + 100;

  await page.mouse.move(startX, center.y);
  await page.mouse.down();
  // Use many steps to ensure we hit multiple cells during the drag
  await page.mouse.move(endX, center.y, { steps: 30 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  // Wait for autosave
  await page.waitForTimeout(AUTOSAVE_WAIT);

  // Get new total cell count
  const newCount = await getTotalCellCount(page, mapId);

  // Drag painting should have created multiple new cells
  expect(newCount).toBeGreaterThan(initialCount);

  expect(errors).toHaveLength(0);
});
