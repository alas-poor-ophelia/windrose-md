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
  getActiveLayerId,
  getLayerEdgeCount,
  resetDataFile,
  AUTOSAVE_WAIT,
  TEST_MAPS,
  MAP_IDS
} from "./helpers";

beforeEach(() => resetDataFile());

// ===========================================
// Edge Draw Tool Tests (Grid Only)
// ===========================================

test("Edge draw tool can be selected via sub-tool menu", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await waitForToolPalette(page);
  await selectSubTool(page, "Draw", "Paint Edges");

  // Verify an active tool button exists after sub-tool selection
  const activeBtn = page.locator('.dmt-tool-btn.dmt-tool-btn-active');
  expect(await activeBtn.count()).toBeGreaterThan(0);

  expect(errors).toHaveLength(0);
});

test("Edge drawing creates edges in data", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.grid;

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const activeLayerId = await getActiveLayerId(page, mapId);
  expect(activeLayerId).not.toBeNull();

  const initialEdgeCount = await getLayerEdgeCount(page, mapId, activeLayerId!);

  await waitForToolPalette(page);
  await selectSubTool(page, "Draw", "Paint Edges");

  const center = await getCanvasCenter(page);
  // Drag along grid lines to create edges
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 64, center.y, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  await page.waitForTimeout(AUTOSAVE_WAIT);
  const newEdgeCount = await getLayerEdgeCount(page, mapId, activeLayerId!);
  expect(newEdgeCount).toBeGreaterThan(initialEdgeCount);

  expect(errors).toHaveLength(0);
});

test("Multiple edge strokes accumulate in data", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.grid;

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const activeLayerId = await getActiveLayerId(page, mapId);
  expect(activeLayerId).not.toBeNull();

  await waitForToolPalette(page);
  await selectSubTool(page, "Draw", "Paint Edges");

  const center = await getCanvasCenter(page);

  // First stroke - horizontal
  await page.mouse.move(center.x - 64, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 64, center.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  await page.waitForTimeout(AUTOSAVE_WAIT);
  const countAfterFirst = await getLayerEdgeCount(page, mapId, activeLayerId!);

  // Second stroke - vertical
  await page.mouse.move(center.x, center.y - 64);
  await page.mouse.down();
  await page.mouse.move(center.x, center.y + 64, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  await page.waitForTimeout(AUTOSAVE_WAIT);
  const countAfterSecond = await getLayerEdgeCount(page, mapId, activeLayerId!);
  expect(countAfterSecond).toBeGreaterThan(countAfterFirst);

  expect(errors).toHaveLength(0);
});
