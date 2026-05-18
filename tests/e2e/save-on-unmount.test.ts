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
  resetDataFile,
  TEST_MAPS,
  MAP_IDS
} from "./helpers";

beforeEach(() => resetDataFile());

// ===========================================
// Save-on-Unmount Tests
// ===========================================

test("Drawing is saved when navigating away before autosave interval", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.grid;

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const initialCount = await getTotalCellCount(page, mapId);

  // Draw cells
  await waitForToolPalette(page);
  await selectToolByIndex(page, 1); // draw

  const center = await getCanvasCenter(page);
  await page.mouse.move(center.x - 64, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 64, center.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  // Navigate away IMMEDIATELY — don't wait for autosave
  await navigateToMap(page, TEST_MAPS.hex);
  await waitForContainer(page);

  // Wait a moment for save-on-unmount to flush
  await page.waitForTimeout(1000);

  // Check that data was saved despite not waiting for autosave
  const savedCount = await getTotalCellCount(page, mapId);
  expect(savedCount).toBeGreaterThan(initialCount);

  expect(errors).toHaveLength(0);
});

test("Multiple rapid navigations don't lose data", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.grid;

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Draw some cells
  await waitForToolPalette(page);
  await selectToolByIndex(page, 1);

  const center = await getCanvasCenter(page);
  await page.mouse.move(center.x - 48, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 48, center.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  // Rapid navigation: grid -> hex -> grid
  await navigateToMap(page, TEST_MAPS.hex);
  await page.waitForTimeout(500);
  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await page.waitForTimeout(1000);

  const savedCount = await getTotalCellCount(page, mapId);
  expect(savedCount).toBeGreaterThan(0);

  expect(errors).toHaveLength(0);
});
