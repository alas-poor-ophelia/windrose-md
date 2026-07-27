import { beforeEach } from "vitest";
import {
  test,
  expect,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  waitForToolPalette,
  getHistoryButtons,
  armTileByFilename,
  readWallGapsLive,
  resetDataFile,
  TEST_MAPS,
} from "./helpers";

// Reset the clean fixture before each test. Gap counts are read live from the
// instance (readWallGapsLive), but the reset still gives each fresh Obsidian
// instance a clean map to load.
beforeEach(() => resetDataFile());

// ===========================================
// Openings Placement Tests (P4)
//
// Openings are doors/windows/thresholds seated into wall GAPS (WallGap on the
// host WallPath). A DD portal tile, when armed, routes to the wall tool (side-
// channel, mirroring the 'line' subtool). Clicking a wall inserts a gap sized
// from the portal art; Alt-click cuts a bare (art-less) threshold.
//
// FIXTURE DEPENDENCY (P3/P6): these tests require a portals fixture tileset with
// `textures/portals/Door_256.png` imported so it lands under the doors category
// on the Structure tier with ddSourceType 'portals' (form 'opening'). Until that
// fixture + P3's import land, `armPortal` will not find the tile and the tests
// are expected to be skipped/red — they are WRITTEN here per the plan (§10) but
// NOT run by P4 (the orchestrator runs E2E after P3 integrates).
//
// E2E baseline caution (project memory): fold the EdgeRail drawer closed after
// arming if it occludes the canvas; read failures from test-results.json.
// ===========================================

/** mousedown+mouseup on the map canvas at a fraction of its size (optionally
 *  with Alt held, for the bare-threshold path). Panels can occlude the canvas
 *  in the small E2E window, so we dispatch events directly. */
async function canvasClick(page: any, fx: number, fy: number, altKey = false): Promise<void> {
  await page.evaluate(({ fx, fy, altKey }: { fx: number; fy: number; altKey: boolean }) => {
    const canvas = document.querySelector(".windrose-canvas-wrapper canvas") as HTMLCanvasElement | null;
    if (canvas == null) throw new Error("canvas not found");
    const rect = canvas.getBoundingClientRect();
    const opts = {
      clientX: rect.left + rect.width * fx,
      clientY: rect.top + rect.height * fy,
      bubbles: true,
      button: 0,
      altKey,
    };
    canvas.dispatchEvent(new MouseEvent("mousedown", opts));
    canvas.dispatchEvent(new MouseEvent("mouseup", opts));
  }, { fx, fy, altKey });
  await page.waitForTimeout(250);
}

/** Arm the fixture wall strip (form 'line' → wall tool) via the ops bridge,
 *  bypassing the depth-band DOM. */
async function armWallStrip(page: any): Promise<void> {
  await armTileByFilename(page, "Test_Wall_01.png", "line");
}

/** Arm the fixture portal (Door_256.png). armTile derives form 'opening' →
 *  routes to the wall tool → the footer shows the "Click a wall…" hint. */
async function armPortal(page: any): Promise<void> {
  await armTileByFilename(page, "Door_256.png", "opening");
}

/** Draw a straight horizontal wall across the middle of the canvas. */
async function drawHorizontalWall(page: any): Promise<void> {
  await armWallStrip(page);
  const footer = page.locator(".windrose-tb-footer");
  await footer.waitFor({ state: "visible", timeout: 5000 });
  await canvasClick(page, 0.35, 0.5);
  await canvasClick(page, 0.65, 0.5);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
}

/** Active-board gap totals read from the LIVE instance (race-immune vs the
 *  shared data file — see readWallGapsLive), plus how many carry a tile binding. */
async function readGapStats(page: any): Promise<{ gaps: number; bound: number; walls: number }> {
  const { walls, gaps } = await readWallGapsLive(page);
  return { gaps: gaps.length, bound: gaps.filter((g) => g.bound).length, walls };
}

test("Arm portal → click wall inserts a bound gap (one undo entry, wall survives)", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  await drawHorizontalWall(page);
  await armPortal(page);

  // Footer shows the opening hint (assetForm 'opening').
  const footer = page.locator(".windrose-tb-footer");
  expect(await footer.textContent()).toContain("Click a wall");

  // Click mid-wall to seat a door.
  await canvasClick(page, 0.5, 0.5);

  let stats = await readGapStats(page);
  expect(stats.walls).toBeGreaterThanOrEqual(1);
  expect(stats.gaps).toBe(1);
  expect(stats.bound).toBe(1); // seated art binding present

  // ONE undo entry: undo removes the gap but keeps the wall.
  const { undoBtn, redoBtn } = await getHistoryButtons(page);
  await undoBtn.click();
  await page.waitForTimeout(300);
  stats = await readGapStats(page);
  expect(stats.walls).toBeGreaterThanOrEqual(1); // wall stays in the data
  expect(stats.gaps).toBe(0);

  // Redo restores the gap + its binding.
  await redoBtn.click();
  await page.waitForTimeout(300);
  stats = await readGapStats(page);
  expect(stats.gaps).toBe(1);
  expect(stats.bound).toBe(1);

  expect(errors).toHaveLength(0);
}, 120000);

test("Alt-click cuts a bare threshold (gap with no tile binding)", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  await drawHorizontalWall(page);
  await armPortal(page);

  // Alt-click mid-wall → bare capped gap, no seated art.
  await canvasClick(page, 0.5, 0.5, true);

  const stats = await readGapStats(page);
  expect(stats.gaps).toBe(1);
  expect(stats.bound).toBe(0);

  expect(errors).toHaveLength(0);
}, 120000);

test("Openings place on a hex map (geometry-agnostic)", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.hex);
  await waitForContainer(page);
  await waitForToolPalette(page);

  await drawHorizontalWall(page);
  await armPortal(page);
  await canvasClick(page, 0.5, 0.5);

  const stats = await readGapStats(page);
  expect(stats.gaps).toBe(1);

  expect(errors).toHaveLength(0);
}, 120000);
