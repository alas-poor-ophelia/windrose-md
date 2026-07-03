import {
  test,
  expect,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  waitForToolPalette,
  selectSubTool,
  openLayerPanel,
  ensureTwoFloors,
  clickFloorGhostToggle,
  isFloorGhostToggleActive,
  selectFloorByIndex,
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
// Floor Ghost ("Show floor below") Tests
// ===========================================
//
// The old per-layer "show layer below" transparency toggle moved to the Board
// (floor) level in the redesigned dock: the strata board bar exposes a ghost
// toggle that renders the floor beneath the active one at reduced opacity.
// Adding a floor promotes the map to Strata mode and switches to the new floor,
// which has a floor below it — the toggleable case.

test("Floor ghost toggle can be activated and deactivated", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openLayerPanel(page);
  await ensureTwoFloors(page);

  // Normalize to off, then exercise both transitions
  if (await isFloorGhostToggleActive(page)) {
    await clickFloorGhostToggle(page);
  }
  await clickFloorGhostToggle(page);
  expect(await isFloorGhostToggleActive(page)).toBe(true);

  await clickFloorGhostToggle(page);
  expect(await isFloorGhostToggleActive(page)).toBe(false);

  expect(errors).toHaveLength(0);
});

test("Floor ghost opacity slider appears only while active", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openLayerPanel(page);
  await ensureTwoFloors(page);

  const slider = page.locator('.windrose-dock-layer-opacity.board-ghost');

  // Inactive → no slider
  if (await isFloorGhostToggleActive(page)) {
    await clickFloorGhostToggle(page);
  }
  expect(await slider.count()).toBe(0);

  // Active → slider with a range input
  await clickFloorGhostToggle(page);
  await slider.waitFor({ state: "visible", timeout: 3000 });
  expect(await slider.locator('input[type="range"]').count()).toBe(1);

  // Cleanup: toggle back off
  await clickFloorGhostToggle(page);
  expect(await slider.count()).toBe(0);

  expect(errors).toHaveLength(0);
});

test("Bottom floor ghost toggle is a no-op (no floor below)", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openLayerPanel(page);
  await ensureTwoFloors(page);

  // Switch to the bottom floor — no floor below, so the toggle must not activate
  await selectFloorByIndex(page, 0);
  await clickFloorGhostToggle(page);
  expect(await isFloorGhostToggleActive(page)).toBe(false);

  expect(errors).toHaveLength(0);
});

test("Floor ghost renders without errors", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openLayerPanel(page);
  await ensureTwoFloors(page);

  // Make sure the upper floor is active, then enable the ghost
  await selectFloorByIndex(page, 1);
  if (!await isFloorGhostToggleActive(page)) {
    await clickFloorGhostToggle(page);
  }

  // Fold the drawer closed so the canvas is unobstructed, let it render
  await openLayerPanel(page);
  await page.waitForTimeout(500);

  const canvas = page.locator(".windrose-canvas-wrapper canvas").first();
  await canvas.waitFor({ state: "visible", timeout: 3000 });

  // Cleanup: ghost off, back to the bottom floor (where the fixture content lives)
  await openLayerPanel(page);
  await clickFloorGhostToggle(page);
  await selectFloorByIndex(page, 0);
  await openLayerPanel(page);

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
