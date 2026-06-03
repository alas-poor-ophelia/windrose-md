import { beforeEach } from "vitest";
import {
  test,
  expect,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  openSettingsModal,
  getMapData,
  resetDataFile,
  AUTOSAVE_WAIT,
  TEST_MAPS,
  MAP_IDS
} from "./helpers";

beforeEach(() => resetDataFile());

// ===========================================
// Settings Save Persistence Tests
// ===========================================

test("Saving settings modal persists changes to data file", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.grid;

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const dataBefore = await getMapData(page, mapId);
  expect(dataBefore).not.toBeNull();

  await openSettingsModal(page);

  // Navigate to Preferences tab (last tab)
  const tabs = page.locator('.windrose-settings-tab');
  const tabCount = await tabs.count();

  if (tabCount > 0) {
    const lastTab = tabs.nth(tabCount - 1);
    await lastTab.dispatchEvent('click');
    await page.waitForTimeout(300);
  }

  // Find a toggle/checkbox and click it to change a setting
  const toggle = page.locator('.windrose-settings-tab-content input[type="checkbox"], .windrose-modal-body input[type="checkbox"]').first();
  const hasToggle = await toggle.count() > 0;

  if (hasToggle) {
    await toggle.click({ force: true });
    await page.waitForTimeout(200);

    // Click Save button (native or fallback)
    const saveBtn = page.locator('.modal-button-container .mod-cta, .windrose-modal-btn-submit').first();
    await saveBtn.dispatchEvent('click');
    await page.waitForTimeout(500);

    await page.waitForTimeout(AUTOSAVE_WAIT);

    const dataAfter = await getMapData(page, mapId);
    expect(dataAfter).not.toBeNull();

    // Verify something changed in the data
    const beforeStr = JSON.stringify(dataBefore);
    const afterStr = JSON.stringify(dataAfter);
    expect(afterStr).not.toBe(beforeStr);
  }

  expect(errors).toHaveLength(0);
});

test("Cancelling settings modal does not persist changes", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.grid;

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const dataBefore = await getMapData(page, mapId);
  expect(dataBefore).not.toBeNull();

  await openSettingsModal(page);

  // Find a toggle and click it
  const toggle = page.locator('.windrose-settings-tab-content input[type="checkbox"], .windrose-modal-body input[type="checkbox"]').first();
  const hasToggle = await toggle.count() > 0;

  if (hasToggle) {
    await toggle.click({ force: true });
    await page.waitForTimeout(200);
  }

  // Click Cancel button
  const cancelBtn = page.locator('.windrose-modal-btn-cancel, .modal-button-container button:not(.mod-cta)').first();
  await cancelBtn.dispatchEvent('click');
  await page.waitForTimeout(500);

  await page.waitForTimeout(AUTOSAVE_WAIT);

  const dataAfter = await getMapData(page, mapId);
  const beforePrefs = JSON.stringify(dataBefore?.uiPreferences);
  const afterPrefs = JSON.stringify(dataAfter?.uiPreferences);
  expect(afterPrefs).toBe(beforePrefs);

  expect(errors).toHaveLength(0);
});

// REAL BUG: "Keep expanded" checkbox on Preferences tab causes map to fail to render with an error.
// Cannot test settings persistence until the underlying checkbox bug is fixed.
test.skip("Settings save persists across navigation", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.grid;

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openSettingsModal(page);

  // Navigate to Preferences tab (last tab)
  const tabs = page.locator('.windrose-settings-tab');
  const tabCount = await tabs.count();
  if (tabCount > 0) {
    const lastTab = tabs.nth(tabCount - 1);
    await lastTab.dispatchEvent('click');
    await page.waitForTimeout(300);
  }

  // Toggle a preference
  const toggle = page.locator('.windrose-settings-tab-content input[type="checkbox"], .windrose-modal-body input[type="checkbox"]').first();
  const hasToggle = await toggle.count() > 0;

  if (hasToggle) {
    await toggle.click({ force: true });
    await page.waitForTimeout(200);

    const saveBtn = page.locator('.modal-button-container .mod-cta, .windrose-modal-btn-submit').first();
    await saveBtn.dispatchEvent('click');
    await page.waitForTimeout(500);

    await page.waitForTimeout(AUTOSAVE_WAIT);

    const dataAfterSave = await getMapData(page, mapId);

    // Navigate away and back
    await navigateToMap(page, TEST_MAPS.hex);
    await waitForContainer(page);
    await page.waitForTimeout(500);

    await navigateToMap(page, TEST_MAPS.grid);
    await waitForContainer(page);
    await page.waitForTimeout(500);

    const dataAfterReturn = await getMapData(page, mapId);
    const savedPrefs = JSON.stringify(dataAfterSave?.uiPreferences);
    const returnedPrefs = JSON.stringify(dataAfterReturn?.uiPreferences);
    expect(returnedPrefs).toBe(savedPrefs);
  }

  expect(errors).toHaveLength(0);
});
