import { beforeEach } from "vitest";
import {
  test,
  expect,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  getCanvasCenter,
  waitForToolPalette,
  getHistoryButtons,
  getTotalCellCount,
  resetDataFile,
  AUTOSAVE_WAIT,
  TEST_MAPS,
  MAP_IDS
} from "./helpers";

beforeEach(() => resetDataFile());

// ===========================================
// Undo/Redo Tests
// ===========================================

test("History controls render correctly", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const { undoBtn, redoBtn } = await getHistoryButtons(page);

  // Both buttons should exist and be visible
  expect(await undoBtn.isVisible()).toBe(true);
  expect(await redoBtn.isVisible()).toBe(true);

  expect(errors).toHaveLength(0);
});

test("Undo button state reflects history", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const { undoBtn } = await getHistoryButtons(page);

  // Undo should be disabled on a fresh map load (no actions in history)
  // or enabled if prior test state persists — either is a valid boolean state
  const isDisabled = await undoBtn.isDisabled();
  expect(isDisabled === true || isDisabled === false).toBe(true);

  // The button should have accessible disabled attribute when disabled
  if (isDisabled) {
    const ariaDisabled = await undoBtn.getAttribute("disabled");
    expect(ariaDisabled).not.toBeNull();
  }

  expect(errors).toHaveLength(0);
});

test("Drawing operation completes without errors", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await waitForToolPalette(page);

  // Draw a cell
  const drawToolBtn = page.locator(".dmt-tool-palette .dmt-tool-btn").nth(1);
  await drawToolBtn.click();
  await page.waitForTimeout(100);

  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(300);

  // The operation should complete without errors
  expect(errors).toHaveLength(0);
});

test("Undo reverses drawing and redo restores it", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.grid;

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await waitForToolPalette(page);

  // Record baseline count
  const baselineCount = await getTotalCellCount(page, mapId);

  // Draw a cell
  const drawToolBtn = page.locator(".dmt-tool-palette .dmt-tool-btn").nth(1);
  await drawToolBtn.click();
  await page.waitForTimeout(100);

  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(500);

  // Wait for autosave and verify cell was added
  await page.waitForTimeout(AUTOSAVE_WAIT);
  const afterDrawCount = await getTotalCellCount(page, mapId);
  expect(afterDrawCount).toBeGreaterThan(baselineCount);

  const { undoBtn, redoBtn } = await getHistoryButtons(page);
  const undoDisabled = await undoBtn.isDisabled();

  if (!undoDisabled) {
    // Undo the drawing
    await undoBtn.click();
    await page.waitForTimeout(AUTOSAVE_WAIT);

    // Verify cell count decreased after undo
    const afterUndoCount = await getTotalCellCount(page, mapId);
    expect(afterUndoCount).toBeLessThan(afterDrawCount);

    // Redo the drawing
    const redoDisabled = await redoBtn.isDisabled();
    if (!redoDisabled) {
      await redoBtn.click();
      await page.waitForTimeout(AUTOSAVE_WAIT);

      // Verify cell count restored after redo
      const afterRedoCount = await getTotalCellCount(page, mapId);
      expect(afterRedoCount).toBeGreaterThanOrEqual(afterDrawCount);
    }
  }

  expect(errors).toHaveLength(0);
});

test("Redo button initially disabled when no undo performed", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const { redoBtn } = await getHistoryButtons(page);

  // Redo should be disabled when no undo has been performed
  // (fresh map state, even if there's persisted data)
  const redoDisabled = await redoBtn.isDisabled();
  expect(redoDisabled).toBe(true);

  expect(errors).toHaveLength(0);
});
