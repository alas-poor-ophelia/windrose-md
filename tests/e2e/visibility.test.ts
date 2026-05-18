import {
  test,
  expect,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  TEST_MAPS
} from "./helpers";

// ===========================================
// Visibility Toolbar Tests
// ===========================================

async function openVisibilityToolbar(page: any): Promise<void> {
  const controlsArea = page.locator('.dmt-controls');
  await controlsArea.waitFor({ state: "visible", timeout: 5000 });
  await controlsArea.hover();
  await page.waitForTimeout(300);

  const visibilityBtn = page.locator('.dmt-expand-btn[title*="visibility"]');
  await visibilityBtn.waitFor({ state: "visible", timeout: 5000 });
  await visibilityBtn.click();
  await page.waitForTimeout(300);
}

test("Visibility toolbar opens and shows toggle buttons", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openVisibilityToolbar(page);

  const toolbar = page.locator('.dmt-visibility-toolbar');
  expect(await toolbar.isVisible()).toBe(true);

  const toggleBtns = page.locator('.dmt-visibility-btn');
  const count = await toggleBtns.count();
  expect(count).toBeGreaterThanOrEqual(2);

  expect(errors).toHaveLength(0);
});

test("Grid visibility can be toggled off and on", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openVisibilityToolbar(page);

  const gridToggle = page.locator('.dmt-visibility-btn[title*="grid"]');
  await gridToggle.waitFor({ state: "visible", timeout: 3000 });

  // Initially should not have hidden class
  const initialClasses = await gridToggle.getAttribute("class") || "";
  const wasHidden = initialClasses.includes("dmt-visibility-btn-hidden");

  // Click to toggle
  await gridToggle.click();
  await page.waitForTimeout(300);

  const afterToggleClasses = await gridToggle.getAttribute("class") || "";
  const isNowHidden = afterToggleClasses.includes("dmt-visibility-btn-hidden");
  expect(isNowHidden).not.toBe(wasHidden);

  // Toggle back
  await gridToggle.click();
  await page.waitForTimeout(300);

  const restoredClasses = await gridToggle.getAttribute("class") || "";
  const restoredHidden = restoredClasses.includes("dmt-visibility-btn-hidden");
  expect(restoredHidden).toBe(wasHidden);

  expect(errors).toHaveLength(0);
});

test("Object visibility can be toggled", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openVisibilityToolbar(page);

  const objectToggle = page.locator('.dmt-visibility-btn[title*="object"]');
  await objectToggle.waitFor({ state: "visible", timeout: 3000 });

  const initialClasses = await objectToggle.getAttribute("class") || "";
  const wasHidden = initialClasses.includes("dmt-visibility-btn-hidden");

  await objectToggle.click();
  await page.waitForTimeout(300);

  const afterClasses = await objectToggle.getAttribute("class") || "";
  const isNowHidden = afterClasses.includes("dmt-visibility-btn-hidden");
  expect(isNowHidden).not.toBe(wasHidden);

  expect(errors).toHaveLength(0);
});

test("Text label visibility can be toggled", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openVisibilityToolbar(page);

  const textToggle = page.locator('.dmt-visibility-btn[title*="text label"]');
  await textToggle.waitFor({ state: "visible", timeout: 3000 });

  const initialClasses = await textToggle.getAttribute("class") || "";
  const wasHidden = initialClasses.includes("dmt-visibility-btn-hidden");

  await textToggle.click();
  await page.waitForTimeout(300);

  const afterClasses = await textToggle.getAttribute("class") || "";
  const isNowHidden = afterClasses.includes("dmt-visibility-btn-hidden");
  expect(isNowHidden).not.toBe(wasHidden);

  expect(errors).toHaveLength(0);
});

test("Visibility toolbar closes when button is clicked again", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openVisibilityToolbar(page);

  const toolbar = page.locator('.dmt-visibility-toolbar');
  expect(await toolbar.isVisible()).toBe(true);

  // Click the visibility button again to close
  const controlsArea = page.locator('.dmt-controls');
  await controlsArea.hover();
  await page.waitForTimeout(300);
  const visibilityBtn = page.locator('.dmt-expand-btn[title*="visibility"]');
  await visibilityBtn.click();
  await page.waitForTimeout(300);

  // Toolbar should be hidden or not have open class
  const isOpen = page.locator('.dmt-visibility-toolbar-open');
  const openCount = await isOpen.count();
  expect(openCount).toBe(0);

  expect(errors).toHaveLength(0);
});

test("Hex map shows additional visibility toggles", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.hex);
  await waitForContainer(page);

  await openVisibilityToolbar(page);

  const toggleBtns = page.locator('.dmt-visibility-btn');
  const hexCount = await toggleBtns.count();

  // Hex maps should have more toggles than grid (coordinates, regions, outlines)
  expect(hexCount).toBeGreaterThanOrEqual(4);

  expect(errors).toHaveLength(0);
});
