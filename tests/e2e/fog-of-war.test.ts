import { beforeEach } from "vitest";
import {
  test,
  expect,
  doWithApp,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  getCanvasCenter,
  getActiveLayerId,
  resetDataFile,
  AUTOSAVE_WAIT,
  DATA_FILE_PATH,
  TEST_MAPS,
  MAP_IDS
} from "./helpers";

beforeEach(() => resetDataFile());

// ===========================================
// Fog of War Helpers
// ===========================================

// The old floating fog toolbar was replaced by the "Fog of War" section of the
// left EdgeRail "View" panel (DockViewPanel). Open the View panel to reach it.
async function openViewPanel(page: any): Promise<void> {
  const viewRailBtn = page.locator('.windrose-edge-rail-btn[title="View"]');
  await viewRailBtn.waitFor({ state: "visible", timeout: 5000 });
  await viewRailBtn.click();
  await page.waitForTimeout(500); // fold animation
}

/** Locator for the Fog of War section within the View panel. */
function fogSection(page: any): any {
  return page
    .locator('.windrose-dock-view-section')
    .filter({ has: page.locator('.windrose-dock-view-section-label', { hasText: "Fog of War" }) });
}

async function openFogToolbar(page: any): Promise<void> {
  await openViewPanel(page);
  await fogSection(page).waitFor({ state: "visible", timeout: 3000 });
}

/** Fold the View drawer closed so the canvas receives pointer events. */
async function closeViewPanel(page: any): Promise<void> {
  const open = page.locator('.windrose-edge-rail-drawer.is-open');
  if (await open.count() > 0) {
    await page.locator('.windrose-edge-rail-btn[title="View"]').click();
    await page.waitForTimeout(600); // fold animation
  }
}

async function getFoggedCellCount(page: any, mapId: string, layerId: string): Promise<number> {
  return await doWithApp(page, async (app: any, params?: { mapId: string; layerId: string; dataPath: string }) => {
    const dataFile = app.vault.getAbstractFileByPath(params!.dataPath);
    if (!dataFile) return -1;

    const content = await app.vault.read(dataFile);
    const data = JSON.parse(content);
    const map = data.maps?.[params!.mapId];
    if (!map) return -1;

    const layer = map.layers?.find((l: any) => l.id === params!.layerId);
    return layer?.fogOfWar?.foggedCells?.length ?? 0;
  }, { mapId, layerId, dataPath: DATA_FILE_PATH });
}

// ===========================================
// Fog of War Tests
// ===========================================

test("Fog of war toolbar opens from visibility panel", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openFogToolbar(page);

  const fow = fogSection(page);
  expect(await fow.isVisible()).toBe(true);
  // Paint / Erase / Rect fog tools should be present
  expect(await fow.locator('.windrose-dock-view-toggle[title="Paint"]').count()).toBe(1);

  expect(errors).toHaveLength(0);
});

test("Fog of war paint tool creates fogged cells", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.grid;

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const activeLayerId = await getActiveLayerId(page, mapId);
  expect(activeLayerId).not.toBeNull();

  const initialFogCount = await getFoggedCellCount(page, mapId, activeLayerId!);

  await openFogToolbar(page);

  // Select fog paint tool
  const paintBtn = fogSection(page).locator('.windrose-dock-view-toggle[title="Paint"]');
  await paintBtn.waitFor({ state: "visible", timeout: 3000 });
  await paintBtn.click();
  await page.waitForTimeout(300);

  // Fold the drawer so canvas clicks aren't intercepted by the overlay.
  await closeViewPanel(page);

  // Paint fog cells with individual clicks on different grid positions
  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(300);
  await page.mouse.click(center.x + 32, center.y);
  await page.waitForTimeout(300);
  await page.mouse.click(center.x - 32, center.y);
  await page.waitForTimeout(300);
  await page.mouse.click(center.x, center.y + 32);
  await page.waitForTimeout(500);

  await page.waitForTimeout(AUTOSAVE_WAIT);
  const newFogCount = await getFoggedCellCount(page, mapId, activeLayerId!);
  expect(newFogCount).toBeGreaterThan(initialFogCount);

  expect(errors).toHaveLength(0);
});

test("Fog of war erase tool removes fogged cells", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.grid;

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const activeLayerId = await getActiveLayerId(page, mapId);
  expect(activeLayerId).not.toBeNull();

  await openFogToolbar(page);

  // First paint some fog
  const paintBtn = fogSection(page).locator('.windrose-dock-view-toggle[title="Paint"]');
  await paintBtn.waitFor({ state: "visible", timeout: 3000 });
  await paintBtn.click();
  await page.waitForTimeout(300);
  await closeViewPanel(page);

  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(300);
  await page.mouse.click(center.x + 32, center.y);
  await page.waitForTimeout(300);
  await page.mouse.click(center.x - 32, center.y);
  await page.waitForTimeout(300);
  await page.mouse.click(center.x, center.y + 32);
  await page.waitForTimeout(500);

  await page.waitForTimeout(AUTOSAVE_WAIT);
  const countAfterPaint = await getFoggedCellCount(page, mapId, activeLayerId!);
  expect(countAfterPaint).toBeGreaterThan(0);

  // Now erase fog at one position (re-open panel to switch tool, then fold)
  await openViewPanel(page);
  const eraseBtn = fogSection(page).locator('.windrose-dock-view-toggle[title="Erase"]');
  await eraseBtn.waitFor({ state: "visible", timeout: 3000 });
  await eraseBtn.click();
  await page.waitForTimeout(300);
  await closeViewPanel(page);

  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(500);

  await page.waitForTimeout(AUTOSAVE_WAIT);
  const countAfterErase = await getFoggedCellCount(page, mapId, activeLayerId!);
  expect(countAfterErase).toBeLessThan(countAfterPaint);

  expect(errors).toHaveLength(0);
});

test("Fog of war tool becomes active when selected", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openFogToolbar(page);

  // Selecting the Paint fog tool marks it active (the old floating fow-toggle-btn
  // expanded-state concept is gone; the tool now carries an `active` class).
  const paintBtn = fogSection(page).locator('.windrose-dock-view-toggle[title="Paint"]');
  await paintBtn.waitFor({ state: "visible", timeout: 3000 });

  const before = await paintBtn.getAttribute("class") || "";
  expect(before).not.toContain("active");

  await paintBtn.click();
  await page.waitForTimeout(300);

  const after = await paintBtn.getAttribute("class") || "";
  expect(after).toContain("active");

  expect(errors).toHaveLength(0);
});
