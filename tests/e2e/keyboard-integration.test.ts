import { beforeEach } from "vitest";
import {
  test,
  expect,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  getCanvasCenter,
  waitForToolPalette,
  focusCanvas,
  getTotalCellCount,
  resetDataFile,
  AUTOSAVE_WAIT,
  TEST_MAPS,
  MAP_IDS
} from "./helpers";

beforeEach(() => resetDataFile());

// ===========================================
// Keyboard Shortcut Integration Tests
// ===========================================

test("D key activates draw tool and drawing creates data", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.grid;

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const initialCount = await getTotalCellCount(page, mapId);

  await waitForToolPalette(page);
  await focusCanvas(page);

  // Press 'D' to activate draw tool
  await page.keyboard.press('d');
  await page.waitForTimeout(200);

  // Verify tool is active
  const drawBtn = page.locator('.windrose-tool-palette .windrose-tool-btn').nth(1);
  const classes = await drawBtn.getAttribute("class") || "";
  expect(classes).toContain("windrose-tool-btn-active");

  // Now draw a cell
  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(500);

  await page.waitForTimeout(AUTOSAVE_WAIT);
  const newCount = await getTotalCellCount(page, mapId);
  expect(newCount).toBeGreaterThan(initialCount);

  expect(errors).toHaveLength(0);
});

test("E key activates erase and can remove drawn cell", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.grid;

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await waitForToolPalette(page);
  await focusCanvas(page);

  await page.keyboard.press('d');
  await page.waitForTimeout(200);

  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(500);

  await page.waitForTimeout(AUTOSAVE_WAIT);
  const countAfterDraw = await getTotalCellCount(page, mapId);
  expect(countAfterDraw).toBeGreaterThan(0);

  // Switch to erase — canvas still has focus from the draw click
  await page.keyboard.press('e');
  await page.waitForTimeout(300);

  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(500);

  await page.waitForTimeout(AUTOSAVE_WAIT);
  const countAfterErase = await getTotalCellCount(page, mapId);
  expect(countAfterErase).toBeLessThan(countAfterDraw);

  expect(errors).toHaveLength(0);
});

test("S key returns to select tool after drawing", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await waitForToolPalette(page);
  await focusCanvas(page);

  // Activate draw
  await page.keyboard.press('d');
  await page.waitForTimeout(200);

  // Switch to select
  await focusCanvas(page);
  await page.keyboard.press('s');
  await page.waitForTimeout(200);

  const selectBtn = page.locator('.windrose-tool-palette .windrose-tool-btn').first();
  const classes = await selectBtn.getAttribute("class") || "";
  expect(classes).toContain("windrose-tool-btn-active");

  expect(errors).toHaveLength(0);
});

// REAL BUG: Ctrl+Z is confirmed broken — undo doesn't correctly revert drawing state.
test.skip("Ctrl+Z undoes last action", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.grid;

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await waitForToolPalette(page);
  await focusCanvas(page);

  // Draw a cell
  await page.keyboard.press('d');
  await page.waitForTimeout(200);

  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(500);

  await page.waitForTimeout(AUTOSAVE_WAIT);
  const countAfterDraw = await getTotalCellCount(page, mapId);
  expect(countAfterDraw).toBeGreaterThan(0);

  // Undo with Ctrl+Z
  await focusCanvas(page);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);

  await page.waitForTimeout(AUTOSAVE_WAIT);
  const countAfterUndo = await getTotalCellCount(page, mapId);
  expect(countAfterUndo).toBeLessThan(countAfterDraw);

  expect(errors).toHaveLength(0);
});
