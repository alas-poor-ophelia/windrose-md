import { beforeEach } from "vitest";
import {
  test,
  expect,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  getCanvasCenter,
  waitForToolPalette,
  selectSubTool,
  getTotalCellCount,
  getLayerCellCount,
  getActiveLayerId,
  resetDataFile,
  AUTOSAVE_WAIT,
  TEST_MAPS,
  MAP_IDS
} from "./helpers";

beforeEach(() => resetDataFile());

// ===========================================
// Circle Tool Data Verification Tests (Grid Only)
// ===========================================

test("Circle tool creates cells in data", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.grid;

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const initialCount = await getTotalCellCount(page, mapId);

  await waitForToolPalette(page);
  await selectSubTool(page, "Rectangle", "Fill Circle");

  const center = await getCanvasCenter(page);
  // Circle tool: click edge point, then click center
  await page.mouse.click(center.x - 64, center.y);
  await page.waitForTimeout(300);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(500);

  await page.waitForTimeout(AUTOSAVE_WAIT);
  const newCount = await getTotalCellCount(page, mapId);
  expect(newCount).toBeGreaterThan(initialCount);

  expect(errors).toHaveLength(0);
});

test("Circle tool cells land on correct layer", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.grid;

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const activeLayerId = await getActiveLayerId(page, mapId);
  expect(activeLayerId).not.toBeNull();

  const initialLayerCount = await getLayerCellCount(page, mapId, activeLayerId!);

  await waitForToolPalette(page);
  await selectSubTool(page, "Rectangle", "Fill Circle");

  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x + 48, center.y);
  await page.waitForTimeout(300);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(500);

  await page.waitForTimeout(AUTOSAVE_WAIT);
  const newLayerCount = await getLayerCellCount(page, mapId, activeLayerId!);
  expect(newLayerCount).toBeGreaterThan(initialLayerCount);

  expect(errors).toHaveLength(0);
});
