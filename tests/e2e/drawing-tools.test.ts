import {
  test,
  expect,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  getCanvasCenter,
  waitForToolPalette,
  TEST_MAPS
} from "./helpers";

// ===========================================
// Drawing Tool Tests
// ===========================================

test("Paint tool can be selected", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Wait for tool palette to render
  await waitForToolPalette(page);

  // Find and click the draw tool (typically second button after select)
  const drawToolBtn = page.locator(".windrose-tool-palette .windrose-tool-btn").nth(1);
  await drawToolBtn.waitFor({ state: "visible", timeout: 5000 });
  await drawToolBtn.click();

  // Verify tool is now active
  const classes = await drawToolBtn.getAttribute("class");
  expect(classes).toContain("windrose-tool-btn-active");

  expect(errors).toHaveLength(0);
});

test("Paint tool fills cell on click", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Wait for tool palette
  await waitForToolPalette(page);

  // Select the draw tool
  const drawToolBtn = page.locator(".windrose-tool-palette .windrose-tool-btn").nth(1);
  await drawToolBtn.click();
  await page.waitForTimeout(100);

  // Get canvas center and click to paint a cell
  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(200);

  // The canvas should have been updated (no error during operation)
  // Since cells are rendered to canvas, we verify no errors occurred
  expect(errors).toHaveLength(0);
});

test("Erase tool can be selected", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await waitForToolPalette(page);

  // Find erase tool (typically third button)
  const eraseToolBtn = page.locator(".windrose-tool-palette .windrose-tool-btn").nth(2);
  await eraseToolBtn.waitFor({ state: "visible", timeout: 5000 });
  await eraseToolBtn.click();

  // Verify tool is now active
  const classes = await eraseToolBtn.getAttribute("class");
  expect(classes).toContain("windrose-tool-btn-active");

  expect(errors).toHaveLength(0);
});

test("Erase tool removes painted cell", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await waitForToolPalette(page);

  const center = await getCanvasCenter(page);

  // First paint a cell
  const drawToolBtn = page.locator(".windrose-tool-palette .windrose-tool-btn").nth(1);
  await drawToolBtn.click();
  await page.waitForTimeout(100);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(200);

  // Now select erase tool and erase the cell
  const eraseToolBtn = page.locator(".windrose-tool-palette .windrose-tool-btn").nth(2);
  await eraseToolBtn.click();
  await page.waitForTimeout(100);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(200);

  // Verify no errors during paint/erase cycle
  expect(errors).toHaveLength(0);
});

test("Rectangle tool can be selected", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await waitForToolPalette(page);

  // Rectangle tool (typically fourth button)
  const rectToolBtn = page.locator(".windrose-tool-palette .windrose-tool-btn").nth(3);
  await rectToolBtn.waitFor({ state: "visible", timeout: 5000 });
  await rectToolBtn.click();

  const classes = await rectToolBtn.getAttribute("class");
  expect(classes).toContain("windrose-tool-btn-active");

  expect(errors).toHaveLength(0);
});

test("Rectangle tool fills area on drag", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await waitForToolPalette(page);

  // Select rectangle tool
  const rectToolBtn = page.locator(".windrose-tool-palette .windrose-tool-btn").nth(3);
  await rectToolBtn.click();
  await page.waitForTimeout(100);

  // Get canvas bounds for drag operation
  const canvas = page.locator(".windrose-canvas-wrapper canvas").first();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();

  // Define rectangle start and end points
  const startX = canvasBox!.x + canvasBox!.width * 0.3;
  const startY = canvasBox!.y + canvasBox!.height * 0.3;
  const endX = canvasBox!.x + canvasBox!.width * 0.6;
  const endY = canvasBox!.y + canvasBox!.height * 0.6;

  // Perform drag to draw rectangle
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  // Verify no errors during rectangle operation
  expect(errors).toHaveLength(0);
});

test("Circle tool can be selected", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await waitForToolPalette(page);

  // Circle tool (typically fifth button)
  const circleToolBtn = page.locator(".windrose-tool-palette .windrose-tool-btn").nth(4);
  await circleToolBtn.waitFor({ state: "visible", timeout: 5000 });
  await circleToolBtn.click();

  const classes = await circleToolBtn.getAttribute("class");
  expect(classes).toContain("windrose-tool-btn-active");

  expect(errors).toHaveLength(0);
});

test("Circle tool fills area on drag", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await waitForToolPalette(page);

  // Select circle tool
  const circleToolBtn = page.locator(".windrose-tool-palette .windrose-tool-btn").nth(4);
  await circleToolBtn.click();
  await page.waitForTimeout(100);

  // Get canvas bounds for drag operation
  const canvas = page.locator(".windrose-canvas-wrapper canvas").first();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();

  // Define circle center and edge points
  const centerX = canvasBox!.x + canvasBox!.width / 2;
  const centerY = canvasBox!.y + canvasBox!.height / 2;
  const edgeX = centerX + 80;
  const edgeY = centerY + 80;

  // Perform drag to draw circle
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(edgeX, edgeY, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  // Verify no errors during circle operation
  expect(errors).toHaveLength(0);
});

test("Drawing tools work on hex map", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.hex);
  await waitForContainer(page);

  await waitForToolPalette(page);

  // Select draw tool and paint
  const drawToolBtn = page.locator(".windrose-tool-palette .windrose-tool-btn").nth(1);
  await drawToolBtn.click();
  await page.waitForTimeout(100);

  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(200);

  // Select erase tool and erase
  const eraseToolBtn = page.locator(".windrose-tool-palette .windrose-tool-btn").nth(2);
  await eraseToolBtn.click();
  await page.waitForTimeout(100);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(200);

  expect(errors).toHaveLength(0);
});

