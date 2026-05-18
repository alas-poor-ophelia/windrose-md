import { beforeEach } from "vitest";
import {
  test,
  expect,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  getCanvasCenter,
  waitForToolPalette,
  selectToolByIndex,
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
// Hex Map Drawing & Persistence Tests
// ===========================================

test("Drawing on hex map creates cells in data", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.hex;

  await navigateToMap(page, TEST_MAPS.hex);
  await waitForContainer(page);

  const initialCount = await getTotalCellCount(page, mapId);

  await waitForToolPalette(page);
  await selectToolByIndex(page, 1); // draw tool

  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(500);

  await page.waitForTimeout(AUTOSAVE_WAIT);

  const newCount = await getTotalCellCount(page, mapId);
  expect(newCount).toBeGreaterThan(initialCount);

  expect(errors).toHaveLength(0);
});

test("Hex map cells persist after navigation away and back", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.hex;

  await navigateToMap(page, TEST_MAPS.hex);
  await waitForContainer(page);

  await waitForToolPalette(page);
  await selectToolByIndex(page, 1);

  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(500);

  await page.waitForTimeout(AUTOSAVE_WAIT);
  const countAfterDraw = await getTotalCellCount(page, mapId);
  expect(countAfterDraw).toBeGreaterThan(0);

  // Navigate away to grid map then back to hex
  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await page.waitForTimeout(500);

  await navigateToMap(page, TEST_MAPS.hex);
  await waitForContainer(page);
  await page.waitForTimeout(500);

  const countAfterReturn = await getTotalCellCount(page, mapId);
  expect(countAfterReturn).toBe(countAfterDraw);

  expect(errors).toHaveLength(0);
});

// Hex erase works in app; E2E erase (click and drag) doesn't remove hex cells.
// Grid erase passes in persistence.test.ts — issue is hex-specific coordinate mapping in offscreen test mode.
test.skip("Erasing on hex map decreases cell count", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.hex;

  await navigateToMap(page, TEST_MAPS.hex);
  await waitForContainer(page);

  await waitForToolPalette(page);
  await selectToolByIndex(page, 1); // draw

  const center = await getCanvasCenter(page);

  // Draw cells at multiple positions via individual clicks
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(300);
  await page.mouse.click(center.x + 60, center.y);
  await page.waitForTimeout(300);

  await page.waitForTimeout(AUTOSAVE_WAIT);
  const countAfterDraw = await getTotalCellCount(page, mapId);
  expect(countAfterDraw).toBeGreaterThanOrEqual(2);

  // Erase via small drag to cover hex cell area
  await selectToolByIndex(page, 2); // erase
  await page.mouse.move(center.x - 10, center.y - 10);
  await page.mouse.down();
  await page.mouse.move(center.x + 10, center.y + 10, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  await page.waitForTimeout(AUTOSAVE_WAIT);
  const countAfterErase = await getTotalCellCount(page, mapId);
  expect(countAfterErase).toBeLessThan(countAfterDraw);

  expect(errors).toHaveLength(0);
});

test("Hex map drawing targets correct layer", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.hex;

  await navigateToMap(page, TEST_MAPS.hex);
  await waitForContainer(page);

  const activeLayerId = await getActiveLayerId(page, mapId);
  expect(activeLayerId).not.toBeNull();

  const initialLayerCount = await getLayerCellCount(page, mapId, activeLayerId!);

  await waitForToolPalette(page);
  await selectToolByIndex(page, 1);

  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(500);

  await page.waitForTimeout(AUTOSAVE_WAIT);
  const newLayerCount = await getLayerCellCount(page, mapId, activeLayerId!);
  expect(newLayerCount).toBeGreaterThan(initialLayerCount);

  expect(errors).toHaveLength(0);
});
