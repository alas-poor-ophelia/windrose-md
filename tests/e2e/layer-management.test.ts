import { beforeEach } from "vitest";
import {
  test,
  expect,
  doWithApp,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  openLayerPanel,
  getActiveLayerId,
  resetDataFile,
  AUTOSAVE_WAIT,
  DATA_FILE_PATH,
  TEST_MAPS,
  MAP_IDS
} from "./helpers";

beforeEach(() => resetDataFile());

// ===========================================
// Layer Management Helpers
// ===========================================

async function getLayerCount(page: any, mapId: string): Promise<number> {
  return await doWithApp(page, async (app: any, params: { mapId: string; dataPath: string }) => {
    const dataFile = app.vault.getAbstractFileByPath(params.dataPath);
    if (!dataFile) return -1;

    const content = await app.vault.read(dataFile);
    const data = JSON.parse(content);
    return data.maps?.[params.mapId]?.layers?.length ?? 0;
  }, { mapId, dataPath: DATA_FILE_PATH });
}

async function openLayerPanelAndVerify(page: any): Promise<void> {
  await openLayerPanel(page);

  const panel = page.locator('.dmt-layer-controls-open');
  await panel.waitFor({ state: "visible", timeout: 3000 });
  await page.waitForTimeout(200);
}

// ===========================================
// Layer Management Tests
// ===========================================

test("Adding a layer increases layer count in data", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.grid;

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const initialLayerCount = await getLayerCount(page, mapId);
  expect(initialLayerCount).toBe(3);

  await openLayerPanelAndVerify(page);

  const addBtn = page.locator('.dmt-layer-add-btn');
  await addBtn.waitFor({ state: "visible", timeout: 3000 });
  await addBtn.click();
  await page.waitForTimeout(500);

  await page.waitForTimeout(AUTOSAVE_WAIT);
  const newLayerCount = await getLayerCount(page, mapId);
  expect(newLayerCount).toBe(initialLayerCount + 1);

  expect(errors).toHaveLength(0);
});

test("Switching active layer updates activeLayerId in data", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.grid;

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const initialActiveLayer = await getActiveLayerId(page, mapId);
  expect(initialActiveLayer).toBe("layer-1");

  await openLayerPanelAndVerify(page);

  const layerBtns = page.locator('.dmt-layer-btn');
  const count = await layerBtns.count();
  expect(count).toBeGreaterThanOrEqual(2);

  for (let i = 0; i < count; i++) {
    const btn = layerBtns.nth(i);
    const classes = await btn.getAttribute("class") || "";
    if (!classes.includes("dmt-layer-btn-active")) {
      await btn.click();
      await page.waitForTimeout(500);
      break;
    }
  }

  await page.waitForTimeout(AUTOSAVE_WAIT);
  const newActiveLayer = await getActiveLayerId(page, mapId);
  expect(newActiveLayer).not.toBe(initialActiveLayer);

  expect(errors).toHaveLength(0);
});

test("Deleting a layer decreases layer count", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.grid;

  page.on('dialog', (dialog: any) => dialog.accept());

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const initialLayerCount = await getLayerCount(page, mapId);
  expect(initialLayerCount).toBe(3);

  await openLayerPanelAndVerify(page);

  // Right-click to expand options on the first layer
  const firstLayerBtn = page.locator('.dmt-layer-btn').first();
  await firstLayerBtn.click({ button: 'right' });
  await page.waitForTimeout(300);

  // Scope delete to first layer wrapper
  const firstWrapper = page.locator('.dmt-layer-btn-wrapper').first();
  const deleteBtn = firstWrapper.locator('.dmt-layer-option-btn.delete');
  await deleteBtn.waitFor({ state: "visible", timeout: 3000 });
  await deleteBtn.click();
  await page.waitForTimeout(500);

  await page.waitForTimeout(AUTOSAVE_WAIT);
  const newLayerCount = await getLayerCount(page, mapId);
  expect(newLayerCount).toBe(initialLayerCount - 1);

  expect(errors).toHaveLength(0);
});

test("Layer persists after adding and navigating away", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.grid;

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openLayerPanelAndVerify(page);

  const addBtn = page.locator('.dmt-layer-add-btn');
  await addBtn.waitFor({ state: "visible", timeout: 3000 });
  await addBtn.click();
  await page.waitForTimeout(500);

  await page.waitForTimeout(AUTOSAVE_WAIT);
  const countAfterAdd = await getLayerCount(page, mapId);
  expect(countAfterAdd).toBe(4);

  // Navigate away and back
  await navigateToMap(page, TEST_MAPS.hex);
  await waitForContainer(page);
  await page.waitForTimeout(500);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await page.waitForTimeout(500);

  const countAfterReturn = await getLayerCount(page, mapId);
  expect(countAfterReturn).toBe(countAfterAdd);

  expect(errors).toHaveLength(0);
});
