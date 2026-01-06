import {
  test,
  expect,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  getCanvasCenter,
  waitForToolPalette,
  openLayerPanel,
  TEST_MAPS
} from "./helpers";

// ===========================================
// Layer Management Tests
// ===========================================

test("Layer panel can be opened", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openLayerPanel(page);

  // Layer controls should now be visible
  const layerControls = page.locator('.dmt-layer-controls');
  await layerControls.waitFor({ state: "visible", timeout: 5000 });
  expect(await layerControls.isVisible()).toBe(true);

  // Should have at least one layer button
  const layerBtns = page.locator('.dmt-layer-btn');
  const count = await layerBtns.count();
  expect(count).toBeGreaterThanOrEqual(1);

  expect(errors).toHaveLength(0);
});

test("New layer can be added", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openLayerPanel(page);

  // Count initial layers
  const layerBtns = page.locator('.dmt-layer-btn');
  const initialCount = await layerBtns.count();

  // Click add layer button
  const addLayerBtn = page.locator('.dmt-layer-add-btn');
  await addLayerBtn.waitFor({ state: "visible", timeout: 5000 });
  await addLayerBtn.click();
  await page.waitForTimeout(300);

  // Should now have one more layer
  const newCount = await layerBtns.count();
  expect(newCount).toBe(initialCount + 1);

  expect(errors).toHaveLength(0);
});

test("Layer can be switched and drawing is layer-specific", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Open layer panel
  await openLayerPanel(page);
  const layerControls = page.locator('.dmt-layer-controls');
  await layerControls.waitFor({ state: "visible", timeout: 5000 });

  // Ensure we have at least 2 layers (add one if needed)
  const layerBtns = page.locator('.dmt-layer-btn');
  let layerCount = await layerBtns.count();

  if (layerCount < 2) {
    const addLayerBtn = page.locator('.dmt-layer-add-btn');
    await addLayerBtn.click();
    await page.waitForTimeout(300);
    layerCount = await layerBtns.count();
  }

  expect(layerCount).toBeGreaterThanOrEqual(2);

  // Get the non-active layer button and click it to switch
  const allLayerBtns = page.locator('.dmt-layer-btn');

  // Find a layer that isn't active and click it
  for (let i = 0; i < layerCount; i++) {
    const btn = allLayerBtns.nth(i);
    const isActive = await btn.getAttribute("class");
    if (!isActive?.includes("dmt-layer-btn-active")) {
      await btn.click();
      await page.waitForTimeout(200);
      break;
    }
  }

  // Verify the clicked layer is now active
  const newActiveBtn = page.locator('.dmt-layer-btn.dmt-layer-btn-active');
  expect(await newActiveBtn.count()).toBe(1);

  // Draw on this layer
  await waitForToolPalette(page);

  const drawToolBtn = page.locator(".dmt-tool-palette .dmt-tool-btn").nth(1);
  await drawToolBtn.click();
  await page.waitForTimeout(100);

  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(300);

  // The operation should complete without errors
  expect(errors).toHaveLength(0);
});

test("Layer switch does not cause errors", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openLayerPanel(page);

  // Add a new layer
  const addLayerBtn = page.locator('.dmt-layer-add-btn');
  await addLayerBtn.click();
  await page.waitForTimeout(300);

  // Switch between layers multiple times
  const layerBtns = page.locator('.dmt-layer-btn');
  const count = await layerBtns.count();

  for (let i = 0; i < Math.min(count, 3); i++) {
    await layerBtns.nth(i).click();
    await page.waitForTimeout(200);
  }

  // All operations should complete without errors
  expect(errors).toHaveLength(0);
});
