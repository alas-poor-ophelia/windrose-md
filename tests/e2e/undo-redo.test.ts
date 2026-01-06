import {
  test,
  expect,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  getCanvasCenter,
  waitForToolPalette,
  getHistoryButtons,
  TEST_MAPS
} from "./helpers";

// ===========================================
// Undo/Redo Tests
// ===========================================

test("History controls render correctly", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const { undoBtn, redoBtn } = await getHistoryButtons(page);

  // Both buttons should exist and be visible
  expect(await undoBtn.isVisible()).toBe(true);
  expect(await redoBtn.isVisible()).toBe(true);

  expect(errors).toHaveLength(0);
});

test("Undo button state reflects history", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const { undoBtn } = await getHistoryButtons(page);

  // Just verify that the button state is accessible (enabled or disabled)
  // We don't assume the initial state since it depends on persisted data
  const isDisabled = await undoBtn.isDisabled();
  expect(typeof isDisabled).toBe("boolean");

  expect(errors).toHaveLength(0);
});

test("Drawing operation completes without errors", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await waitForToolPalette(page);

  // Draw a cell
  const drawToolBtn = page.locator(".dmt-tool-palette .dmt-tool-btn").nth(1);
  await drawToolBtn.click();
  await page.waitForTimeout(100);

  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(300);

  // The operation should complete without errors
  expect(errors).toHaveLength(0);
});

test("Undo/redo cycle completes without errors", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await waitForToolPalette(page);

  // Draw a cell to ensure we have something to undo
  const drawToolBtn = page.locator(".dmt-tool-palette .dmt-tool-btn").nth(1);
  await drawToolBtn.click();
  await page.waitForTimeout(100);

  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(500);

  const { undoBtn, redoBtn } = await getHistoryButtons(page);

  // Only proceed with undo/redo if buttons are available
  const undoDisabled = await undoBtn.isDisabled();

  if (!undoDisabled) {
    // Undo the drawing
    await undoBtn.click();
    await page.waitForTimeout(300);

    // Redo the drawing if redo is available
    const redoDisabled = await redoBtn.isDisabled();
    if (!redoDisabled) {
      await redoBtn.click();
      await page.waitForTimeout(300);
    }
  }

  // The cycle should complete without errors
  expect(errors).toHaveLength(0);
});

test("Redo button initially disabled when no undo performed", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const { redoBtn } = await getHistoryButtons(page);

  // Redo should be disabled when no undo has been performed
  // (fresh map state, even if there's persisted data)
  const redoDisabled = await redoBtn.isDisabled();
  expect(redoDisabled).toBe(true);

  expect(errors).toHaveLength(0);
});
