import {
  test,
  expect,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  waitForToolPalette,
  focusCanvas,
  TEST_MAPS
} from "./helpers";

// ===========================================
// Keyboard Shortcut Tests
// ===========================================

test("D key activates draw tool", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await waitForToolPalette(page);

  // Focus canvas first
  await focusCanvas(page);

  // Press D key
  await page.keyboard.press('d');
  await page.waitForTimeout(200);

  // Draw tool should be active (second button in palette)
  const drawToolBtn = page.locator(".windrose-tool-palette .windrose-tool-btn").nth(1);
  const classes = await drawToolBtn.getAttribute("class");
  expect(classes).toContain("windrose-tool-btn-active");

  expect(errors).toHaveLength(0);
});

test("E key activates erase tool", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await waitForToolPalette(page);

  await focusCanvas(page);

  // Press E key
  await page.keyboard.press('e');
  await page.waitForTimeout(200);

  // Erase tool should be active (look for the eraser icon button)
  const eraseToolBtn = page.locator('.windrose-tool-btn[title*="Erase"]');
  const classes = await eraseToolBtn.getAttribute("class");
  expect(classes).toContain("windrose-tool-btn-active");

  expect(errors).toHaveLength(0);
});

test("S key activates select tool", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await waitForToolPalette(page);

  // First switch away from select (it might be default)
  const drawToolBtn = page.locator(".windrose-tool-palette .windrose-tool-btn").nth(1);
  await drawToolBtn.click();
  await page.waitForTimeout(100);

  await focusCanvas(page);

  // Press S key
  await page.keyboard.press('s');
  await page.waitForTimeout(200);

  // Select tool should be active (first button in palette)
  const selectToolBtn = page.locator(".windrose-tool-palette .windrose-tool-btn").first();
  const classes = await selectToolBtn.getAttribute("class");
  expect(classes).toContain("windrose-tool-btn-active");

  expect(errors).toHaveLength(0);
});

test("M key activates measure tool", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await waitForToolPalette(page);

  await focusCanvas(page);

  // Press M key
  await page.keyboard.press('m');
  await page.waitForTimeout(200);

  // Measure tool button should be active (look for ruler icon button)
  const measureToolBtn = page.locator('.windrose-tool-btn[title*="Measure"]');
  const classes = await measureToolBtn.getAttribute("class");
  expect(classes).toContain("windrose-tool-btn-active");

  expect(errors).toHaveLength(0);
});

test("Keyboard shortcuts cycle through tools without errors", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await waitForToolPalette(page);

  await focusCanvas(page);

  // Cycle through all shortcuts
  const shortcuts = ['d', 'e', 's', 'm', 'd', 's'];
  for (const key of shortcuts) {
    await page.keyboard.press(key);
    await page.waitForTimeout(150);
  }

  // All operations should complete without errors
  expect(errors).toHaveLength(0);
});
