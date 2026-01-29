import {
  test,
  expect,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  openSettingsModal,
  closeSettingsModal,
  TEST_MAPS
} from "./helpers";

// ===========================================
// Settings Modal Tests
// ===========================================

test("Settings button is accessible via controls drawer", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Hover over controls to reveal the drawer
  const controlsArea = page.locator('.dmt-controls');
  await controlsArea.waitFor({ state: "visible", timeout: 5000 });
  await controlsArea.hover();
  await page.waitForTimeout(400);

  // Settings button should be visible
  const settingsBtn = page.locator('.dmt-expand-btn[title="Map Settings"]');
  expect(await settingsBtn.isVisible()).toBe(true);

  expect(errors).toHaveLength(0);
});

test("Settings modal opens when settings button is clicked", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openSettingsModal(page);

  // Modal should be visible
  const modal = page.locator('.dmt-settings-modal');
  expect(await modal.isVisible()).toBe(true);

  // Modal header should show "Map Settings"
  const header = page.locator('.dmt-modal-header h3');
  const headerText = await header.textContent();
  expect(headerText).toBe("Map Settings");

  expect(errors).toHaveLength(0);
});

test("Settings modal has correct tabs for grid map", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openSettingsModal(page);

  // Check for expected tabs (grid maps have: Appearance, Background, Measurement, Preferences)
  const tabBar = page.locator('.dmt-settings-tab-bar');
  await tabBar.waitFor({ state: "visible", timeout: 5000 });

  const tabs = page.locator('.dmt-settings-tab');
  const tabCount = await tabs.count();
  expect(tabCount).toBe(4); // Appearance, Background, Measurement, Preferences

  // Verify tab labels
  const tabTexts: string[] = [];
  for (let i = 0; i < tabCount; i++) {
    tabTexts.push(await tabs.nth(i).textContent() || "");
  }
  expect(tabTexts).toContain("Appearance");
  expect(tabTexts).toContain("Background");
  expect(tabTexts).toContain("Measurement");
  expect(tabTexts).toContain("Preferences");

  expect(errors).toHaveLength(0);
});

test("Settings modal has Hex Grid tab for hex maps", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.hex);
  await waitForContainer(page);

  await openSettingsModal(page);

  // Hex maps should have 4 tabs including Hex Grid
  const tabs = page.locator('.dmt-settings-tab');
  const tabCount = await tabs.count();
  expect(tabCount).toBe(4); // Appearance, Hex Grid, Measurement, Preferences

  // Verify Hex Grid tab exists
  const tabTexts: string[] = [];
  for (let i = 0; i < tabCount; i++) {
    tabTexts.push(await tabs.nth(i).textContent() || "");
  }
  expect(tabTexts).toContain("Hex Grid");

  expect(errors).toHaveLength(0);
});

test("Settings tabs can be switched", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openSettingsModal(page);

  // First tab (Appearance) should be active initially
  const firstTab = page.locator('.dmt-settings-tab').first();
  let firstTabClass = await firstTab.getAttribute("class");
  expect(firstTabClass).toContain("dmt-settings-tab-active");

  // Click on the Measurement tab
  const measurementTab = page.locator('.dmt-settings-tab:has-text("Measurement")');
  await measurementTab.click();
  await page.waitForTimeout(100);

  // Measurement tab should now be active
  const measurementTabClass = await measurementTab.getAttribute("class");
  expect(measurementTabClass).toContain("dmt-settings-tab-active");

  // First tab should no longer be active
  firstTabClass = await firstTab.getAttribute("class");
  expect(firstTabClass).not.toContain("dmt-settings-tab-active");

  expect(errors).toHaveLength(0);
});

test("Settings modal can be closed with Cancel button", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openSettingsModal(page);

  // Modal should be visible
  let modal = page.locator('.dmt-settings-modal');
  expect(await modal.isVisible()).toBe(true);

  // Click Cancel
  await closeSettingsModal(page);

  // Modal should be hidden
  expect(await modal.isVisible()).toBe(false);

  expect(errors).toHaveLength(0);
});

test("Settings modal has Save and Cancel buttons", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openSettingsModal(page);

  // Check for Save button
  const saveBtn = page.locator('.dmt-modal-btn-submit');
  expect(await saveBtn.isVisible()).toBe(true);
  const saveBtnText = await saveBtn.textContent();
  expect(saveBtnText).toContain("Save");

  // Check for Cancel button
  const cancelBtn = page.locator('.dmt-modal-btn-cancel');
  expect(await cancelBtn.isVisible()).toBe(true);
  const cancelBtnText = await cancelBtn.textContent();
  expect(cancelBtnText).toContain("Cancel");

  expect(errors).toHaveLength(0);
});

test("Appearance tab content renders", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openSettingsModal(page);

  // Appearance tab content should be visible (it's the default tab)
  const tabContent = page.locator('.dmt-settings-tab-content');
  await tabContent.waitFor({ state: "visible", timeout: 5000 });
  expect(await tabContent.isVisible()).toBe(true);

  expect(errors).toHaveLength(0);
});

test("Preferences tab content renders", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openSettingsModal(page);

  // Click on Preferences tab
  const preferencesTab = page.locator('.dmt-settings-tab:has-text("Preferences")');
  await preferencesTab.click();
  await page.waitForTimeout(100);

  // Tab content should be visible
  const tabContent = page.locator('.dmt-settings-tab-content');
  await tabContent.waitFor({ state: "visible", timeout: 5000 });
  expect(await tabContent.isVisible()).toBe(true);

  expect(errors).toHaveLength(0);
});

test("Settings modal is draggable via header", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openSettingsModal(page);

  // Get initial position
  const modal = page.locator('.dmt-settings-modal');
  const initialBox = await modal.boundingBox();
  expect(initialBox).not.toBeNull();

  // Drag the header
  const header = page.locator('.dmt-modal-header');
  const headerBox = await header.boundingBox();
  expect(headerBox).not.toBeNull();

  const startX = headerBox!.x + headerBox!.width / 2;
  const startY = headerBox!.y + headerBox!.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 50, startY + 50, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(100);

  // Check that position changed
  const newBox = await modal.boundingBox();
  expect(newBox).not.toBeNull();
  expect(newBox!.x).not.toBe(initialBox!.x);
  expect(newBox!.y).not.toBe(initialBox!.y);

  expect(errors).toHaveLength(0);
});
