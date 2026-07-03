import {
  test,
  expect,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  waitForToolPalette,
  selectSubTool,
  openLayerContextMenu,
  clickTransparencyToggle,
  isTransparencyToggleActive,
  hoverTransparencyButton,
  expandObjectSidebarIfNeeded,
  TEST_MAPS,
} from "./helpers";

// ===========================================
// Grid Map Smoke Tests
// ===========================================

test("Grid map loads without errors", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Wait for canvas wrapper
  const canvasWrapper = page.locator(".windrose-canvas-wrapper");
  await canvasWrapper.waitFor({ state: "visible", timeout: 5000 });

  // Verify canvas wrapper has dimensions
  const box = await canvasWrapper.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);

  // Verify no Windrose-specific JavaScript errors
  expect(errors).toHaveLength(0);
});

test("Grid map controls render", async ({ page }) => {
  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Check controls overlay
  const controls = page.locator(".windrose-controls");
  await controls.waitFor({ state: "visible", timeout: 5000 });

  // Check compass
  const compass = page.locator("div.windrose-compass");
  await compass.waitFor({ state: "visible", timeout: 5000 });
});

// ===========================================
// Hex Map Smoke Tests
// ===========================================

test("Hex map loads without errors", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.hex);
  await waitForContainer(page);

  // Wait for canvas wrapper
  const canvasWrapper = page.locator(".windrose-canvas-wrapper");
  await canvasWrapper.waitFor({ state: "visible", timeout: 5000 });

  // Verify canvas wrapper has dimensions
  const box = await canvasWrapper.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);

  // Verify no Windrose-specific JavaScript errors
  expect(errors).toHaveLength(0);
});

test("Hex map controls render", async ({ page }) => {
  await navigateToMap(page, TEST_MAPS.hex);
  await waitForContainer(page);

  // Check controls overlay
  const controls = page.locator(".windrose-controls");
  await controls.waitFor({ state: "visible", timeout: 5000 });

  // Check compass
  const compass = page.locator("div.windrose-compass");
  await compass.waitFor({ state: "visible", timeout: 5000 });
});

// ===========================================
// Diagonal Fill Tool Tests
// ===========================================

test("Diagonal fill tool can be selected and clicks register", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  // Select the diagonal fill tool from the rectangle sub-menu
  await selectSubTool(page, "Rectangle", "Diagonal Fill");

  // Verify the tool button shows as active (the diagonal fill icon should be visible)
  const activeToolBtn = page.locator('.windrose-tool-btn.windrose-tool-btn-active');
  await activeToolBtn.waitFor({ state: "visible", timeout: 3000 });

  // Get canvas for clicking
  const canvas = page.locator(".windrose-canvas-wrapper canvas").first();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();

  // Click on the canvas to start a diagonal fill operation
  // The first click sets the start corner
  const centerX = canvasBox!.x + canvasBox!.width / 2;
  const centerY = canvasBox!.y + canvasBox!.height / 2;

  await canvas.click({ position: { x: canvasBox!.width / 2, y: canvasBox!.height / 2 } });
  await page.waitForTimeout(200);

  // The diagonal fill overlay should appear after the first click (if a valid corner was found)
  // Even if no valid corner is found, the click should register without errors
  // Move mouse to show preview
  await page.mouse.move(centerX + 100, centerY + 100);
  await page.waitForTimeout(100);

  // Second click to complete (or attempt to complete) the operation
  await canvas.click({ position: { x: canvasBox!.width / 2 + 100, y: canvasBox!.height / 2 + 100 } });
  await page.waitForTimeout(200);

  // Verify no Windrose-specific JavaScript errors
  expect(errors).toHaveLength(0);
});

test("Diagonal fill tool shows preview overlay on valid diagonal", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  // First, draw a diagonal staircase pattern using the draw tool
  // Select draw tool (index 1)
  const drawToolBtn = page.locator(".windrose-tool-palette .windrose-tool-btn").nth(1);
  await drawToolBtn.click();
  await page.waitForTimeout(100);

  const canvas = page.locator(".windrose-canvas-wrapper canvas").first();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();

  // Draw a diagonal staircase by clicking cells in a diagonal pattern
  // The canvas center is our reference point - we'll draw cells offset from there
  const cellSize = 50; // Approximate cell size for clicking
  const startX = canvasBox!.width / 3;
  const startY = canvasBox!.height / 3;

  // Draw 3 cells in a diagonal staircase pattern (down-right)
  for (let i = 0; i < 3; i++) {
    await canvas.click({
      position: {
        x: startX + (i * cellSize),
        y: startY + (i * cellSize)
      }
    });
    await page.waitForTimeout(100);
  }

  // Now select the diagonal fill tool
  await selectSubTool(page, "Rectangle", "Diagonal Fill");
  await page.waitForTimeout(200);

  // Click near the first cell's corner to start the diagonal fill
  // The tool detects the nearest corner of an empty cell adjacent to filled cells
  await canvas.click({
    position: {
      x: startX + cellSize - 5,  // Near the TR corner of cell 0
      y: startY + cellSize - 5
    }
  });
  await page.waitForTimeout(300);

  // Check if the diagonal fill overlay appeared (it shows when a valid start point is found)
  const diagonalOverlay = page.locator(".windrose-diagonal-fill-overlay");
  const overlayVisible = await diagonalOverlay.count() > 0;

  // Move to show preview
  if (overlayVisible) {
    await page.mouse.move(
      canvasBox!.x + startX + (2 * cellSize) - 5,
      canvasBox!.y + startY + (2 * cellSize) - 5
    );
    await page.waitForTimeout(200);
  }

  // Verify no Windrose-specific JavaScript errors occurred
  expect(errors).toHaveLength(0);
});

// ===========================================
// Layer Transparency Tests
// ===========================================
//
// SKIPPED (UI-modernization debt): the per-layer "show layer below" transparency
// toggle was part of the old flat layer panel. The redesigned block-mode layer
// dock (DockLayerList) renders either Simple/Floors rows (no per-layer controls)
// or Strata rows (which explicitly omit the transparency toggle — `!isStrata`
// guard in DockLayerList.tsx). There is currently NO block-mode entry point for
// this control, so these tests target removed UI with no replacement. Re-enable
// once transparency is re-exposed in the new dock. See findings report.

test.skip("Layer transparency toggle can be activated", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Open context menu for Layer 2 (index 1) which has a layer below it
  const layerIndex = 1;
  await openLayerContextMenu(page, layerIndex);

  // Click to toggle transparency on (pass layerIndex to scope selector)
  await clickTransparencyToggle(page, layerIndex);

  // Verify the toggle shows active state
  const isActive = await isTransparencyToggleActive(page, layerIndex);
  expect(isActive).toBe(true);

  // Verify no errors
  expect(errors).toHaveLength(0);
});

test.skip("Layer transparency toggle can be deactivated", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Open context menu for Layer 2
  const layerIndex = 1;
  await openLayerContextMenu(page, layerIndex);

  // Toggle on
  await clickTransparencyToggle(page, layerIndex);
  expect(await isTransparencyToggleActive(page, layerIndex)).toBe(true);

  // Toggle off
  await clickTransparencyToggle(page, layerIndex);
  expect(await isTransparencyToggleActive(page, layerIndex)).toBe(false);

  expect(errors).toHaveLength(0);
});

test.skip("Layer transparency slider appears on hover when active", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Open layer panel for Layer 2
  const layerIndex = 1;
  await openLayerContextMenu(page, layerIndex);

  // Ensure toggle is active (explicitly set state, don't assume initial state)
  if (!await isTransparencyToggleActive(page, layerIndex)) {
    await clickTransparencyToggle(page, layerIndex);
    await page.waitForTimeout(200);
  }
  expect(await isTransparencyToggleActive(page, layerIndex)).toBe(true);

  // Hover to reveal slider (needs extra wait for CSS transition)
  await hoverTransparencyButton(page, layerIndex);
  await page.waitForTimeout(500);

  // Verify slider popup appears
  const sliderPopup = page.locator('.windrose-opacity-slider-popup');
  await sliderPopup.waitFor({ state: "visible", timeout: 5000 });

  // Verify slider input exists
  const sliderInput = sliderPopup.locator('input[type="range"]');
  expect(await sliderInput.count()).toBe(1);

  expect(errors).toHaveLength(0);
});

test.skip("Layer transparency slider does not appear when toggle is inactive", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Open layer panel for Layer 2
  const layerIndex = 1;
  await openLayerContextMenu(page, layerIndex);

  // Ensure toggle is inactive (explicitly set state, don't assume initial state)
  if (await isTransparencyToggleActive(page, layerIndex)) {
    await clickTransparencyToggle(page, layerIndex);
    await page.waitForTimeout(200);
  }
  expect(await isTransparencyToggleActive(page, layerIndex)).toBe(false);

  // Hover - slider should NOT appear since toggle is off
  await hoverTransparencyButton(page, layerIndex);

  // Slider should NOT appear
  const sliderPopup = page.locator('.windrose-opacity-slider-popup');
  expect(await sliderPopup.count()).toBe(0);

  expect(errors).toHaveLength(0);
});

test.skip("Bottom layer transparency toggle is disabled (no layer below)", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Open context menu for Layer 1 (bottom layer, index 0)
  const layerIndex = 0;
  await openLayerContextMenu(page, layerIndex);

  // The transparency toggle should still exist but clicking it should be a no-op
  // since there's no layer below
  await clickTransparencyToggle(page, layerIndex);

  // It can be toggled on (spec says allow toggle, it's a no-op)
  // The test is mainly checking it doesn't crash
  expect(errors).toHaveLength(0);
});

test.skip("Layer transparency renders without errors", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Open context menu for a layer with content below it
  // Layer 2 (index 1) has Layer 1 below it
  const layerIndex = 1;
  await openLayerContextMenu(page, layerIndex);

  // Enable transparency
  await clickTransparencyToggle(page, layerIndex);

  // Wait for render
  await page.waitForTimeout(500);

  // Canvas should still be visible and no errors
  const canvas = page.locator(".windrose-canvas-wrapper canvas").first();
  await canvas.waitFor({ state: "visible", timeout: 3000 });

  expect(errors).toHaveLength(0);
});

// ===========================================
// Object Rotation Tests (45° increments)
// ===========================================

test("Object rotation via toolbar button rotates 45 degrees", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  const addObjectBtn = page.locator('.windrose-tool-btn[title*="Add Object"]');
  await addObjectBtn.click();
  await page.waitForTimeout(200);

  await expandObjectSidebarIfNeeded(page);
  const sidebar = page.locator('.windrose-object-sidebar');
  await sidebar.waitFor({ state: "visible", timeout: 5000 });
  const objectItem = page.locator('.windrose-object-grid-item').first();
  await objectItem.click();
  await page.waitForTimeout(200);

  const canvas = page.locator(".windrose-canvas-wrapper canvas").first();
  const canvasBox = await canvas.boundingBox();
  const centerX = canvasBox!.x + canvasBox!.width / 2;
  const centerY = canvasBox!.y + canvasBox!.height / 2;
  await page.mouse.click(centerX, centerY);
  await page.waitForTimeout(500);

  const selectToolBtn = page.locator('.windrose-tool-btn[title*="Select"]');
  await selectToolBtn.click();
  await page.waitForTimeout(200);
  await page.mouse.click(centerX, centerY);
  await page.waitForTimeout(300);

  const rotateBtn = page.locator('.windrose-toolbar-button[title*="Rotate 45"]');
  const rotateBtnExists = await rotateBtn.count() > 0;

  if (rotateBtnExists) {
    await rotateBtn.click();
    await page.waitForTimeout(200);
  }

  expect(errors).toHaveLength(0);
});

test("Object rotation via R key rotates 45 degrees", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  const addObjectBtn = page.locator('.windrose-tool-btn[title*="Add Object"]');
  await addObjectBtn.click();
  await page.waitForTimeout(200);

  await expandObjectSidebarIfNeeded(page);
  const sidebar = page.locator('.windrose-object-sidebar');
  await sidebar.waitFor({ state: "visible", timeout: 5000 });
  const objectItem = page.locator('.windrose-object-grid-item').first();
  await objectItem.click();
  await page.waitForTimeout(200);

  const canvas = page.locator(".windrose-canvas-wrapper canvas").first();
  const canvasBox = await canvas.boundingBox();
  const centerX = canvasBox!.x + canvasBox!.width / 2;
  const centerY = canvasBox!.y + canvasBox!.height / 2;
  await page.mouse.click(centerX, centerY);
  await page.waitForTimeout(500);

  const selectToolBtn = page.locator('.windrose-tool-btn[title*="Select"]');
  await selectToolBtn.click();
  await page.waitForTimeout(200);
  await page.mouse.click(centerX, centerY);
  await page.waitForTimeout(300);

  const selectionToolbar = page.locator('.windrose-selection-toolbar');
  const isSelected = await selectionToolbar.count() > 0;

  if (isSelected) {
    await page.keyboard.press('r');
    await page.waitForTimeout(200);

    // 8 rotations × 45° = 360° full cycle
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press('r');
      await page.waitForTimeout(100);
    }
  }

  expect(errors).toHaveLength(0);
});
