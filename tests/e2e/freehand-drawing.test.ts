import {
  test,
  expect,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  getCanvasCenter,
  waitForToolPalette,
  selectSubTool,
  TEST_MAPS
} from "./helpers";

// ===========================================
// Freehand Drawing Tool Tests
// ===========================================

test("Freehand tool can be selected via sub-tool menu", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  // Select freehand from the Draw tool group's sub-tool flyout
  await selectSubTool(page, "Draw", "Freehand Draw");

  // After selecting freehand, the draw group button should be active
  // and its title should now reflect the freehand sub-tool
  const freehandBtn = page.locator('.windrose-tool-btn[title*="Freehand"]');
  await freehandBtn.waitFor({ state: "visible", timeout: 5000 });
  const classes = await freehandBtn.getAttribute("class");
  expect(classes).toContain("windrose-tool-btn-active");

  expect(errors).toHaveLength(0);
});

test("Freehand draw completes without errors", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  // Select freehand tool
  await selectSubTool(page, "Draw", "Freehand Draw");
  await page.waitForTimeout(200);

  // Get canvas center, offset to avoid sidebar overlap
  const center = await getCanvasCenter(page);
  const startX = center.x - 150;
  const startY = center.y - 150;

  // Draw a freehand stroke across the canvas
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Simulate a curved stroke with multiple intermediate points
  await page.mouse.move(startX + 40, startY + 20, { steps: 5 });
  await page.mouse.move(startX + 80, startY + 60, { steps: 5 });
  await page.mouse.move(startX + 120, startY + 40, { steps: 5 });
  await page.mouse.move(startX + 160, startY + 80, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  // The key assertion: the entire draw pipeline (pointer capture → point
  // collection → RDP simplification → Bézier fitting → state update →
  // canvas re-render) completed without throwing any runtime errors.
  expect(errors).toHaveLength(0);
});
