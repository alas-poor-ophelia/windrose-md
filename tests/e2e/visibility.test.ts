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
//
// The old floating `.windrose-visibility-toolbar` (opened from the controls
// drawer) was replaced by the "Visibility" section of the left EdgeRail "View"
// panel (DockViewPanel). Toggles are `.windrose-dock-view-toggle`; the off state
// is a bare ` off` class (was `windrose-visibility-btn-hidden`).

/** Open the EdgeRail "View" panel and return the Visibility toggle section locator. */
async function openVisibilitySection(page: any): Promise<any> {
  const viewRailBtn = page.locator('.windrose-edge-rail-btn[title="View"]');
  await viewRailBtn.waitFor({ state: "visible", timeout: 5000 });
  await viewRailBtn.click();
  await page.waitForTimeout(500); // fold animation

  // The Visibility section is the one whose label reads "Visibility".
  const section = page
    .locator('.windrose-dock-view-section')
    .filter({ has: page.locator('.windrose-dock-view-section-label', { hasText: "Visibility" }) });
  await section.waitFor({ state: "visible", timeout: 5000 });
  return section;
}

test("Visibility panel opens and shows toggle buttons", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const section = await openVisibilitySection(page);
  expect(await section.isVisible()).toBe(true);

  const toggleBtns = section.locator('.windrose-dock-view-toggle');
  const count = await toggleBtns.count();
  expect(count).toBeGreaterThanOrEqual(2);

  expect(errors).toHaveLength(0);
});

test("Grid visibility can be toggled off and on", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const section = await openVisibilitySection(page);

  const gridToggle = section.locator('.windrose-dock-view-toggle[title*="Grid"]');
  await gridToggle.waitFor({ state: "visible", timeout: 3000 });

  // Off state is the bare ` off` class.
  const isOff = async (): Promise<boolean> =>
    /\boff\b/.test((await gridToggle.getAttribute("class")) || "");

  const wasOff = await isOff();

  await gridToggle.click();
  await page.waitForTimeout(300);
  expect(await isOff()).not.toBe(wasOff);

  // Toggle back
  await gridToggle.click();
  await page.waitForTimeout(300);
  expect(await isOff()).toBe(wasOff);

  expect(errors).toHaveLength(0);
});

test("Object visibility can be toggled", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const section = await openVisibilitySection(page);

  const objectToggle = section.locator('.windrose-dock-view-toggle[title*="Objects"]');
  await objectToggle.waitFor({ state: "visible", timeout: 3000 });

  const wasOff = /\boff\b/.test((await objectToggle.getAttribute("class")) || "");

  await objectToggle.click();
  await page.waitForTimeout(300);

  const isNowOff = /\boff\b/.test((await objectToggle.getAttribute("class")) || "");
  expect(isNowOff).not.toBe(wasOff);

  expect(errors).toHaveLength(0);
});

test("Text label visibility can be toggled", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const section = await openVisibilitySection(page);

  // Text labels are labeled "Labels" in the View panel.
  const textToggle = section.locator('.windrose-dock-view-toggle[title*="Labels"]');
  await textToggle.waitFor({ state: "visible", timeout: 3000 });

  const wasOff = /\boff\b/.test((await textToggle.getAttribute("class")) || "");

  await textToggle.click();
  await page.waitForTimeout(300);

  const isNowOff = /\boff\b/.test((await textToggle.getAttribute("class")) || "");
  expect(isNowOff).not.toBe(wasOff);

  expect(errors).toHaveLength(0);
});

test("Visibility panel closes when the rail button is clicked again", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openVisibilitySection(page);

  // The drawer is open now.
  const openDrawer = page.locator('.windrose-edge-rail-drawer.is-open');
  expect(await openDrawer.count()).toBe(1);

  // Click the View rail button again to fold the drawer closed.
  const viewRailBtn = page.locator('.windrose-edge-rail-btn[title="View"]');
  await viewRailBtn.click();
  await page.waitForTimeout(600);

  expect(await page.locator('.windrose-edge-rail-drawer.is-open').count()).toBe(0);

  expect(errors).toHaveLength(0);
});

test("Hex map shows additional visibility toggles", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.hex);
  await waitForContainer(page);

  const section = await openVisibilitySection(page);

  const toggleBtns = section.locator('.windrose-dock-view-toggle');
  const hexCount = await toggleBtns.count();

  // Hex maps add Coords, Regions, Outlines to Grid/Objects/Labels.
  expect(hexCount).toBeGreaterThanOrEqual(4);

  expect(errors).toHaveLength(0);
});
