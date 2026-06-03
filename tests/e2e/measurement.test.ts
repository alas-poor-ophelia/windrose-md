import {
  test,
  expect,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  getCanvasCenter,
  selectToolByTitle,
  TEST_MAPS
} from "./helpers";

// ===========================================
// Measurement Tool Tests
// ===========================================

test("Measure tool can be activated", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Click the measure tool button
  await selectToolByTitle(page, "Measure");

  // Verify it's active
  const measureToolBtn = page.locator('.windrose-tool-btn[title*="Measure"]');
  const classes = await measureToolBtn.getAttribute("class");
  expect(classes).toContain("windrose-tool-btn-active");

  expect(errors).toHaveLength(0);
});

test("Measure tool click sets origin point without errors", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Activate measure tool
  await selectToolByTitle(page, "Measure");

  // Click on canvas to set origin point
  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(300);

  // Should complete without errors
  expect(errors).toHaveLength(0);
});

test("Measure tool shows distance on mouse move", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Activate measure tool
  await selectToolByTitle(page, "Measure");

  // Click on canvas to set origin point
  const canvas = page.locator(".windrose-canvas-wrapper canvas").first();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();

  const originX = canvasBox!.x + canvasBox!.width * 0.3;
  const originY = canvasBox!.y + canvasBox!.height * 0.3;
  await page.mouse.click(originX, originY);
  await page.waitForTimeout(300);

  // Move mouse to a different location
  const targetX = canvasBox!.x + canvasBox!.width * 0.7;
  const targetY = canvasBox!.y + canvasBox!.height * 0.7;
  await page.mouse.move(targetX, targetY);
  await page.waitForTimeout(300);

  // Should complete without errors (measurement overlay renders)
  expect(errors).toHaveLength(0);
});

test("Measure tool works on hex map", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.hex);
  await waitForContainer(page);

  // Activate measure tool
  await selectToolByTitle(page, "Measure");

  // Click on canvas to set origin point
  const canvas = page.locator(".windrose-canvas-wrapper canvas").first();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();

  const originX = canvasBox!.x + canvasBox!.width * 0.3;
  const originY = canvasBox!.y + canvasBox!.height * 0.3;
  await page.mouse.click(originX, originY);
  await page.waitForTimeout(300);

  // Move mouse to a different location
  const targetX = canvasBox!.x + canvasBox!.width * 0.6;
  const targetY = canvasBox!.y + canvasBox!.height * 0.6;
  await page.mouse.move(targetX, targetY);
  await page.waitForTimeout(300);

  // Should complete without errors
  expect(errors).toHaveLength(0);
});
