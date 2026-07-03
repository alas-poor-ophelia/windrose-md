import { beforeEach } from "vitest";
import {
  test,
  expect,
  doWithApp,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  openLayerPanelStrata,
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
  return await doWithApp(page, async (app: any, params?: { mapId: string; dataPath: string }) => {
    const dataFile = app.vault.getAbstractFileByPath(params!.dataPath);
    if (!dataFile) return -1;

    const content = await app.vault.read(dataFile);
    const data = JSON.parse(content);
    return data.maps?.[params!.mapId]?.layers?.length ?? 0;
  }, { mapId, dataPath: DATA_FILE_PATH });
}

async function openLayerPanelAndVerify(page: any): Promise<void> {
  // Open the drawer and switch to Strata mode so per-layer rows are shown
  // (tile maps default to Simple/Floors mode, which has no layer rows).
  await openLayerPanelStrata(page);

  const panel = page.locator('.windrose-edge-rail-drawer.is-open');
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

  expect(await getLayerCount(page, mapId)).toBe(3);

  await openLayerPanelAndVerify(page);

  // Strata materializes role layers lazily (persisted on first mutation), so a
  // JSON-count delta is confounded. Assert on the visible layer rows instead:
  // adding a layer must add exactly one row to its stratum.
  const rows = page.locator('.windrose-dock-layer-row');
  const baseRows = await rows.count();

  // In Strata mode, adding a layer is per-stratum (one "+" per role section).
  const addBtn = page.locator('.windrose-dock-stratum-add').first();
  await addBtn.waitFor({ state: "visible", timeout: 3000 });
  await addBtn.click();
  await page.waitForTimeout(500);

  expect(await rows.count()).toBe(baseRows + 1);

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

  const layerBtns = page.locator('.windrose-dock-layer-row');
  const count = await layerBtns.count();
  expect(count).toBeGreaterThanOrEqual(2);

  for (let i = 0; i < count; i++) {
    const btn = layerBtns.nth(i);
    const classes = await btn.getAttribute("class") || "";
    // Row's active modifier is a bare " active" class (not "windrose-layer-btn-active")
    if (!/\bactive\b/.test(classes)) {
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

  expect(await getLayerCount(page, mapId)).toBe(3);

  await openLayerPanelAndVerify(page);

  // Assert on visible rows (JSON count is confounded by lazy strata
  // materialization). Deleting a layer must remove exactly one row.
  const rows = page.locator('.windrose-dock-layer-row');
  const baseRows = await rows.count();

  // Expand the actions ("more") menu on the first layer row
  const firstRow = rows.first();
  const moreBtn = firstRow.locator('.windrose-dock-layer-action.more');
  await moreBtn.waitFor({ state: "visible", timeout: 3000 });
  await moreBtn.click();
  await page.waitForTimeout(300);

  // Delete lives in the expanded action row
  const deleteBtn = firstRow.locator('.windrose-dock-layer-action-btn.delete');
  await deleteBtn.waitFor({ state: "visible", timeout: 3000 });
  await deleteBtn.click();
  await page.waitForTimeout(500);

  expect(await rows.count()).toBe(baseRows - 1);

  expect(errors).toHaveLength(0);
});

test("Layer persists after adding and navigating away", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.grid;

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await openLayerPanelAndVerify(page);

  // In Strata mode, adding a layer is per-stratum (one "+" per role section).
  const addBtn = page.locator('.windrose-dock-stratum-add').first();
  await addBtn.waitFor({ state: "visible", timeout: 3000 });
  await addBtn.click();
  await page.waitForTimeout(500);

  // After autosave, whatever the persisted count is (strata may materialize
  // extra role layers on first mutation), it must survive a round-trip.
  await page.waitForTimeout(AUTOSAVE_WAIT);
  const countAfterAdd = await getLayerCount(page, mapId);
  expect(countAfterAdd).toBeGreaterThan(3);

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
