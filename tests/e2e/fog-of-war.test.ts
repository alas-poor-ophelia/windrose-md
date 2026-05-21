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

async function openFogToolbar(page: any): Promise<void> {
  await openVisibilityToolbar(page);

  const fowToggle = page.locator('.dmt-fow-toggle-btn');
  await fowToggle.waitFor({ state: "visible", timeout: 3000 });
  await fowToggle.click();
  await page.waitForTimeout(300);
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

  const fowToolbar = page.locator('.dmt-fow-floating-toolbar');
  expect(await fowToolbar.isVisible()).toBe(true);

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
  const paintBtn = page.locator('.dmt-fow-tool-btn[title*="Paint fog"]');
  await paintBtn.waitFor({ state: "visible", timeout: 3000 });
  await paintBtn.click();
  await page.waitForTimeout(300);

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
  const paintBtn = page.locator('.dmt-fow-tool-btn[title*="Paint fog"]');
  await paintBtn.waitFor({ state: "visible", timeout: 3000 });
  await paintBtn.click();
  await page.waitForTimeout(300);

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

  // Now erase fog at one position
  const eraseBtn = page.locator('.dmt-fow-tool-btn[title*="Erase fog"]');
  await eraseBtn.waitFor({ state: "visible", timeout: 3000 });
  await eraseBtn.click();
  await page.waitForTimeout(300);

  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(500);

  await page.waitForTimeout(AUTOSAVE_WAIT);
  const countAfterErase = await getFoggedCellCount(page, mapId, activeLayerId!);
  expect(countAfterErase).toBeLessThan(countAfterPaint);

  expect(errors).toHaveLength(0);
});

test("Fog of war toggle button shows expanded state", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openVisibilityToolbar(page);

  const fowToggle = page.locator('.dmt-fow-toggle-btn');
  await fowToggle.waitFor({ state: "visible", timeout: 3000 });

  // Initially not expanded
  const initialClasses = await fowToggle.getAttribute("class") || "";
  expect(initialClasses).not.toContain("expanded");

  // Click to expand
  await fowToggle.click();
  await page.waitForTimeout(300);

  const expandedClasses = await fowToggle.getAttribute("class") || "";
  expect(expandedClasses).toContain("expanded");

  expect(errors).toHaveLength(0);
});
