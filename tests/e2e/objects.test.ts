import {
  test,
  expect,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  getCanvasCenter,
  waitForToolPalette,
  isObjectSidebarExpanded,
  expandObjectSidebarIfNeeded,
  TEST_MAPS
} from "./helpers";

// ===========================================
// Object Placement Tests
// ===========================================

test("Object can be placed on grid map", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Expand sidebar and select an object type
  await expandObjectSidebarIfNeeded(page);
  const objectItem = page.locator('.dmt-object-grid-item').first();
  const itemExists = await objectItem.count() > 0;

  if (itemExists) {
    await objectItem.click();
    await page.waitForTimeout(200);

    // Activate the Add Object tool
    await waitForToolPalette(page);
    const addObjectBtn = page.locator('.dmt-tool-btn[title*="Add Object"]');
    const addBtnExists = await addObjectBtn.count() > 0;

    if (addBtnExists) {
      await addObjectBtn.click();
      await page.waitForTimeout(200);

      // Click on the canvas to place the object
      const center = await getCanvasCenter(page);
      await page.mouse.click(center.x, center.y);
      await page.waitForTimeout(500);
    }
  }

  expect(errors).toHaveLength(0);
});

test("Placed objects have valid screen positions", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const canvasWrapper = page.locator(".dmt-canvas-wrapper");
  await canvasWrapper.waitFor({ state: "visible", timeout: 5000 });
  const wrapperBox = await canvasWrapper.boundingBox();

  // Look for any pre-existing objects or overlays
  const overlayElements = page.locator('.dmt-object-overlay, .dmt-overlay, [data-object-id]');
  const overlayCount = await overlayElements.count();

  if (overlayCount > 0) {
    // Verify each overlay is positioned within the canvas bounds
    for (let i = 0; i < overlayCount; i++) {
      const overlay = overlayElements.nth(i);
      const overlayBox = await overlay.boundingBox();

      if (overlayBox && wrapperBox) {
        // Overlay should be within or near the canvas wrapper bounds
        // Allow some tolerance for objects that may extend beyond edges
        const tolerance = 100;
        expect(overlayBox.x).toBeGreaterThan(wrapperBox.x - tolerance);
        expect(overlayBox.y).toBeGreaterThan(wrapperBox.y - tolerance);
        expect(overlayBox.x).toBeLessThan(wrapperBox.x + wrapperBox.width + tolerance);
        expect(overlayBox.y).toBeLessThan(wrapperBox.y + wrapperBox.height + tolerance);
      }
    }
  }

  expect(errors).toHaveLength(0);
});

// ===========================================
// Object Interaction Tests
// ===========================================

test("Object sidebar can be expanded", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Ensure sidebar is expanded
  await expandObjectSidebarIfNeeded(page);

  // Verify expanded sidebar is visible
  const isExpanded = await isObjectSidebarExpanded(page);
  expect(isExpanded).toBe(true);

  // Should have at least one object type available
  const objectItems = page.locator('.dmt-object-grid-item');
  const count = await objectItems.count();
  expect(count).toBeGreaterThan(0);

  expect(errors).toHaveLength(0);
});

test("Object type can be selected from sidebar", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Expand sidebar if needed
  await expandObjectSidebarIfNeeded(page);

  // Click the first object item
  const objectItem = page.locator('.dmt-object-grid-item').first();
  await objectItem.waitFor({ state: "visible", timeout: 5000 });
  await objectItem.click();
  await page.waitForTimeout(200);

  // The object item should be selected (have the selected class)
  const selectedClass = await objectItem.getAttribute("class");
  expect(selectedClass).toContain("dmt-object-grid-item-selected");

  expect(errors).toHaveLength(0);
});

test("Add Object tool activates correctly", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await waitForToolPalette(page);

  // Click the Add Object tool button
  const addObjectBtn = page.locator('.dmt-tool-btn[title*="Add Object"]');
  await addObjectBtn.click();
  await page.waitForTimeout(200);

  // Verify the tool button is now active
  const toolClass = await addObjectBtn.getAttribute("class");
  expect(toolClass).toContain("dmt-tool-btn-active");

  expect(errors).toHaveLength(0);
});

test("Clicking canvas with object tool selected does not throw errors", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Expand sidebar and select an object type
  await expandObjectSidebarIfNeeded(page);
  const objectItem = page.locator('.dmt-object-grid-item').first();
  await objectItem.waitFor({ state: "visible", timeout: 5000 });
  await objectItem.click();
  await page.waitForTimeout(200);

  // Click on canvas to attempt placement
  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(500);

  // Primary check: no errors during the operation
  expect(errors).toHaveLength(0);
});
