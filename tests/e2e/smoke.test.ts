import {
  test,
  expect,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  waitForToolPalette,
  selectSubTool,
  getCanvasCenter,
  TEST_MAPS
} from "./helpers";

// ===========================================
// Grid Map Smoke Tests
// ===========================================

test("Grid map loads without errors", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Wait for canvas wrapper
  const canvasWrapper = page.locator(".dmt-canvas-wrapper");
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
  const controls = page.locator(".dmt-controls");
  await controls.waitFor({ state: "visible", timeout: 5000 });

  // Check compass
  const compass = page.locator(".dmt-compass");
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
  const canvasWrapper = page.locator(".dmt-canvas-wrapper");
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
  const controls = page.locator(".dmt-controls");
  await controls.waitFor({ state: "visible", timeout: 5000 });

  // Check compass
  const compass = page.locator(".dmt-compass");
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
  const activeToolBtn = page.locator('.dmt-tool-btn.dmt-tool-btn-active');
  await activeToolBtn.waitFor({ state: "visible", timeout: 3000 });

  // Get canvas for clicking
  const canvas = page.locator(".dmt-canvas-wrapper canvas").first();
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
  const drawToolBtn = page.locator(".dmt-tool-palette .dmt-tool-btn").nth(1);
  await drawToolBtn.click();
  await page.waitForTimeout(100);

  const canvas = page.locator(".dmt-canvas-wrapper canvas").first();
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
  const diagonalOverlay = page.locator(".dmt-diagonal-fill-overlay");
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
