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

// Reset the clean fixture before each test so each fresh Obsidian instance loads
// a clean map (gap reads themselves are live via readWallGapsLive).
beforeEach(() => resetDataFile());

// ===========================================
// Openings Editing Tests (P5)
//
// Gap edit mode lives in WallLayer: with the wall tool active and a wall
// SELECTED, gap handles render alongside vertex/bow handles. Precedence is
// gap-edge > gap-center > vertex > bow > centerline (geometry F5). The gap
// CENTER handle is offset perpendicular to the wall so a mid-segment door and
// its bow are both grabbable. Footer controls (width, flip, unbind, delete)
// appear when a gap is selected. Every one-shot edit commits with suppress=false
// → one undo entry, and the wall stays in the static raster (geometry F2).
//
// FIXTURE DEPENDENCY (P3/P6): needs the portals fixture (`Door_256.png`) plus a
// wall strip, same as openings-placement.test.ts. WRITTEN per plan §10 but NOT
// run by P5 — the orchestrator runs E2E after P3 integrates.
//
// HANDLE-TARGETING NOTE: handle screen positions are derived from gap geometry.
// A door placed mid-wall (canvas 0.5,0.5) sits its center handle ~15px above the
// centerline; clicking the selected wall's center twice — first selects the wall
// (centerline), then selects the gap (center handle). These fractional-canvas
// targets are approximate; if they drift on a future layout change, recompute
// from a windrose_canvas_dump rather than nudging pixels blindly.
// ===========================================

/** mousedown+mouseup at a fraction of the canvas (optionally Alt). */
async function canvasClick(page: any, fx: number, fy: number, altKey = false): Promise<void> {
  await page.evaluate(({ fx, fy, altKey }: { fx: number; fy: number; altKey: boolean }) => {
    const canvas = document.querySelector(".windrose-canvas-wrapper canvas") as HTMLCanvasElement | null;
    if (canvas == null) throw new Error("canvas not found");
    const rect = canvas.getBoundingClientRect();
    const opts = { clientX: rect.left + rect.width * fx, clientY: rect.top + rect.height * fy, bubbles: true, button: 0, altKey };
    canvas.dispatchEvent(new MouseEvent("mousedown", opts));
    canvas.dispatchEvent(new MouseEvent("mouseup", opts));
  }, { fx, fy, altKey });
  await page.waitForTimeout(200);
}

/** mousedown → mousemove → mouseup across the canvas (a drag gesture). */
async function canvasDrag(page: any, fromX: number, fromY: number, toX: number, toY: number): Promise<void> {
  await page.evaluate(({ fromX, fromY, toX, toY }: { fromX: number; fromY: number; toX: number; toY: number }) => {
    const canvas = document.querySelector(".windrose-canvas-wrapper canvas") as HTMLCanvasElement | null;
    if (canvas == null) throw new Error("canvas not found");
    const rect = canvas.getBoundingClientRect();
    const at = (fx: number, fy: number) => ({ clientX: rect.left + rect.width * fx, clientY: rect.top + rect.height * fy, bubbles: true, button: 0 });
    canvas.dispatchEvent(new MouseEvent("mousedown", at(fromX, fromY)));
    canvas.dispatchEvent(new MouseEvent("mousemove", at((fromX + toX) / 2, (fromY + toY) / 2)));
    canvas.dispatchEvent(new MouseEvent("mousemove", at(toX, toY)));
    canvas.dispatchEvent(new MouseEvent("mouseup", at(toX, toY)));
  }, { fromX, fromY, toX, toY });
  await page.waitForTimeout(250);
}

/** Perpendicular screen offset of a gap CENTER handle off the centerline —
 *  mirrors WallLayer's GAP_CENTER_PERP. Clicking a fraction anchor + this many
 *  px along the wall normal lands on the offset door handle rather than the bow
 *  diamond (which stays on the centerline). For a left→right horizontal segment
 *  the handle sits BELOW the centerline (+screen-y). */
const GAP_CENTER_PERP_PX = 30;

/** Like canvasDrag, but both endpoints are shifted `yPx` screen px down. Used to
 *  grab the perpendicular-offset gap-center handle (the drag's world→arc-length
 *  projection ignores the perpendicular component, so the door moves along the
 *  wall). */
async function canvasDragOffsetY(page: any, fromX: number, fromY: number, toX: number, toY: number, yPx: number): Promise<void> {
  await page.evaluate(({ fromX, fromY, toX, toY, yPx }: { fromX: number; fromY: number; toX: number; toY: number; yPx: number }) => {
    const canvas = document.querySelector(".windrose-canvas-wrapper canvas") as HTMLCanvasElement | null;
    if (canvas == null) throw new Error("canvas not found");
    const rect = canvas.getBoundingClientRect();
    const at = (fx: number, fy: number) => ({ clientX: rect.left + rect.width * fx, clientY: rect.top + rect.height * fy + yPx, bubbles: true, button: 0 });
    canvas.dispatchEvent(new MouseEvent("mousedown", at(fromX, fromY)));
    canvas.dispatchEvent(new MouseEvent("mousemove", at((fromX + toX) / 2, (fromY + toY) / 2)));
    canvas.dispatchEvent(new MouseEvent("mousemove", at(toX, toY)));
    canvas.dispatchEvent(new MouseEvent("mouseup", at(toX, toY)));
  }, { fromX, fromY, toX, toY, yPx });
  await page.waitForTimeout(250);
}

async function armWallStrip(page: any): Promise<void> {
  await armTileByFilename(page, "Test_Wall_01.png", "line");
}

async function armPortal(page: any): Promise<void> {
  await armTileByFilename(page, "Door_256.png", "opening");
}

/** Draw a straight horizontal wall across the middle, then seat a door mid-wall. */
async function drawWallWithDoor(page: any): Promise<void> {
  await armWallStrip(page);
  const footer = page.locator(".windrose-tb-footer");
  await footer.waitFor({ state: "visible", timeout: 5000 });
  await canvasClick(page, 0.3, 0.5);
  await canvasClick(page, 0.7, 0.5);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  await armPortal(page);
  await canvasClick(page, 0.5, 0.5); // seat the door
  await page.waitForTimeout(300);
}

/** Draw a closed 4-vertex loop and seat a door on the CLOSING segment.
 *  Vertex order is chosen so the closing segment (index V-1 = 3, vertices[3] →
 *  vertices[0]) is the TOP edge running left→right, so its gap-center handle sits
 *  a predictable +GAP_CENTER_PERP_PX below the centerline (into the loop). */
async function drawLoopWithDoorOnClosingSegment(page: any): Promise<void> {
  await armWallStrip(page);
  const footer = page.locator(".windrose-tb-footer");
  await footer.waitFor({ state: "visible", timeout: 5000 });
  await canvasClick(page, 0.7, 0.3); // v0 — right end of the closing (top) edge
  await canvasClick(page, 0.7, 0.7); // v1
  await canvasClick(page, 0.3, 0.7); // v2
  await canvasClick(page, 0.3, 0.3); // v3 — left end of the closing (top) edge
  await canvasClick(page, 0.7, 0.3); // click back on v0 → closes the loop (seg 3 = v3→v0)
  await page.waitForTimeout(400);
  await armPortal(page);
  await canvasClick(page, 0.5, 0.3); // seat the door mid closing-segment (top edge)
  await page.waitForTimeout(300);
}

/** Re-arm the wall strip (disarms the portal → back to the wall draw/edit tool)
 *  so a wall can be selected and its gap handles edited. Waits until the footer
 *  has actually LEFT opening mode (the "Click a wall…" hint is gone) so the
 *  following selection clicks select the gap rather than cut new openings. */
async function enterWallEdit(page: any): Promise<void> {
  await armWallStrip(page);
  await page.waitForFunction(() => {
    const footer = document.querySelector(".windrose-tb-footer");
    const txt = footer?.textContent ?? "";
    return txt.length > 0 && !txt.includes("Click a wall");
  }, undefined, { timeout: 5000, polling: 150 });
  await page.waitForTimeout(200);
}

/** Detailed active-board gap read from the LIVE instance (race-immune vs the
 *  shared data file — see readWallGapsLive). */
async function readGaps(page: any): Promise<Array<{ seg: number; t: number; widthCells: number; bound: boolean; flip: boolean; widthLocked: boolean }>> {
  const { gaps } = await readWallGapsLive(page);
  return gaps.map((g) => ({
    seg: g.seg,
    t: g.t,
    widthCells: g.widthCells,
    bound: g.bound,
    flip: g.flip,
    widthLocked: g.widthLocked,
  }));
}

/** Select the wall (1st click on its centerline) then the gap (2nd click on the
 *  center handle, offset just above the centerline). */
async function selectDoorGap(page: any): Promise<void> {
  await canvasClick(page, 0.5, 0.5); // select wall
  await page.waitForTimeout(150);
  await canvasClick(page, 0.5, 0.5); // select gap center handle
  await page.waitForTimeout(150);
}

test("Gap footer: delete removes the door (one undo entry, wall survives)", async ({ page }) => {
  const errors = setupErrorTracking(page);
  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  await drawWallWithDoor(page);
  await enterWallEdit(page);
  await selectDoorGap(page);

  const footer = page.locator(".windrose-tb-footer");
  expect(await footer.textContent()).toMatch(/Door|Opening|Width/);

  // Delete via the gap footer.
  await page.locator('.windrose-tb-footer button[aria-label^="Delete opening"]').click();
  await page.waitForTimeout(300);
  expect(await readGaps(page)).toHaveLength(0);

  // ONE undo entry restores the gap.
  const { undoBtn } = await getHistoryButtons(page);
  await undoBtn.click();
  await page.waitForTimeout(300);
  expect((await readGaps(page)).length).toBe(1);

  expect(errors).toHaveLength(0);
}, 120000);

test("Gap footer: width control resizes the door and sets widthLocked", async ({ page }) => {
  const errors = setupErrorTracking(page);
  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  await drawWallWithDoor(page);
  await enterWallEdit(page);
  await selectDoorGap(page);

  const range = page.locator('.windrose-tb-footer input.windrose-tb-range[max="6"]').first();
  await range.fill("2");
  await range.dispatchEvent("input");
  await page.waitForTimeout(300);

  const gaps = await readGaps(page);
  expect(gaps).toHaveLength(1);
  expect(gaps[0].widthCells).toBeGreaterThan(1);
  expect(gaps[0].widthLocked).toBe(true);

  expect(errors).toHaveLength(0);
}, 120000);

test("Gap footer: flip toggles the seated art; unbind leaves a bare threshold", async ({ page }) => {
  const errors = setupErrorTracking(page);
  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  await drawWallWithDoor(page);
  await enterWallEdit(page);
  await selectDoorGap(page);

  await page.locator('.windrose-tb-footer button[aria-label^="Flip door"]').click();
  await page.waitForTimeout(300);
  expect((await readGaps(page))[0].flip).toBe(true);

  // Unbind → the gap stays but loses its seated art.
  await page.locator('.windrose-tb-footer button[aria-label^="Remove door art"]').click();
  await page.waitForTimeout(300);
  const gaps = await readGaps(page);
  expect(gaps).toHaveLength(1);
  expect(gaps[0].bound).toBe(false);

  expect(errors).toHaveLength(0);
}, 120000);

test("Gap move: drag the center handle along the wall (one undo entry)", async ({ page }) => {
  const errors = setupErrorTracking(page);
  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  await drawWallWithDoor(page);
  await enterWallEdit(page);
  await canvasClick(page, 0.5, 0.5); // select wall so gap handles show

  const before = (await readGaps(page))[0];
  // Drag the center handle from mid-wall toward the left end.
  await canvasDrag(page, 0.5, 0.5, 0.4, 0.5);
  const after = (await readGaps(page))[0];
  expect(after.t).not.toBeCloseTo(before.t, 2);

  const { undoBtn } = await getHistoryButtons(page);
  await undoBtn.click();
  await page.waitForTimeout(300);
  expect((await readGaps(page))[0].t).toBeCloseTo(before.t, 2);

  expect(errors).toHaveLength(0);
}, 120000);

test("Gap resize: drag an edge handle widens the door", async ({ page }) => {
  const errors = setupErrorTracking(page);
  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  await drawWallWithDoor(page);
  await enterWallEdit(page);
  await canvasClick(page, 0.5, 0.5); // select wall

  const before = (await readGaps(page))[0];
  // The hi edge of a 1-cell door sits a little right of center; drag it further right.
  await canvasDrag(page, 0.53, 0.5, 0.62, 0.5);
  const after = (await readGaps(page))[0];
  expect(after.widthCells).toBeGreaterThan(before.widthCells);
  expect(after.widthLocked).toBe(true);

  expect(errors).toHaveLength(0);
}, 120000);

test("Gap re-homes when a vertex is inserted on its segment (double-click)", async ({ page }) => {
  const errors = setupErrorTracking(page);
  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  await drawWallWithDoor(page);
  await enterWallEdit(page);
  await canvasClick(page, 0.5, 0.5); // select wall

  // Double-click to insert a vertex to the LEFT of the door (splits seg 0).
  await page.evaluate(() => {
    const canvas = document.querySelector(".windrose-canvas-wrapper canvas") as HTMLCanvasElement | null;
    if (canvas == null) throw new Error("canvas not found");
    const rect = canvas.getBoundingClientRect();
    const opts = { clientX: rect.left + rect.width * 0.4, clientY: rect.top + rect.height * 0.5, bubbles: true, button: 0 };
    canvas.dispatchEvent(new MouseEvent("dblclick", opts));
  });
  await page.waitForTimeout(400);

  // Still exactly one gap; it re-homed via reprojectGap onto the correct half.
  const gaps = await readGaps(page);
  expect(gaps).toHaveLength(1);
  expect(gaps[0].t).toBeGreaterThanOrEqual(0);
  expect(gaps[0].t).toBeLessThanOrEqual(1);

  expect(errors).toHaveLength(0);
}, 120000);

test("Mid-segment door and its bow are both independently grabbable (geometry F5)", async ({ page }) => {
  const errors = setupErrorTracking(page);
  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  await drawWallWithDoor(page);
  await enterWallEdit(page);
  await canvasClick(page, 0.5, 0.5); // select wall so handles render

  // The door sits centered on the segment midpoint (t≈0.5), directly over the bow
  // diamond. The fix offsets the gap-CENTER handle GAP_CENTER_PERP_PX perpendicular
  // to the wall so the two never share a hit circle. Prove BOTH are independently
  // grabbable while the door stays centered on the midpoint — the old test moved
  // the door off-center first, so it never exercised the overlapping-hitbox case.
  const start = (await readGaps(page))[0];
  expect(start.t).toBeCloseTo(0.5, 1);

  // (1) Gap-center grab: click ~30px off the centerline midpoint (the offset door
  //     handle, NOT the bow) and drag along the wall → the door moves (t changes).
  await canvasDragOffsetY(page, 0.5, 0.5, 0.4, 0.5, GAP_CENTER_PERP_PX);
  let gaps = await readGaps(page);
  expect(gaps).toHaveLength(1);
  expect(gaps[0].t).not.toBeCloseTo(start.t, 2); // center handle was grabbed, door moved

  // Undo → door recentres on the midpoint, wall still straight.
  const { undoBtn } = await getHistoryButtons(page);
  await undoBtn.click();
  await page.waitForTimeout(300);
  expect((await readGaps(page))[0].t).toBeCloseTo(start.t, 1);

  // (2) Bow grab: click the EXACT centerline midpoint — the bow diamond, since the
  //     door center handle is offset away — and drag perpendicular. The door neither
  //     moves nor multiplies; only the segment bows.
  await canvasDrag(page, 0.5, 0.5, 0.5, 0.35);
  gaps = await readGaps(page);
  expect(gaps).toHaveLength(1);
  expect(gaps[0].t).toBeCloseTo(start.t, 1); // door stayed centered → the bow was grabbed, not the door

  expect(errors).toHaveLength(0);
}, 120000);

test("Closed-loop wall: gap on the closing segment selects, moves, resizes, deletes", async ({ page }) => {
  const errors = setupErrorTracking(page);
  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  await drawLoopWithDoorOnClosingSegment(page);

  // The door landed on the CLOSING segment (index V-1 = 3 for a 4-vertex loop).
  let gaps = await readGaps(page);
  expect(gaps).toHaveLength(1);
  expect(gaps[0].seg).toBe(3);
  const startT = gaps[0].t;

  await enterWallEdit(page);
  await canvasClick(page, 0.5, 0.3); // select the loop wall (top-edge centerline)

  // MOVE: drag the gap-center handle (offset into the loop) left along the closing
  // segment. It stays on seg 3 and its t shifts.
  await canvasDragOffsetY(page, 0.5, 0.3, 0.42, 0.3, GAP_CENTER_PERP_PX);
  gaps = await readGaps(page);
  expect(gaps).toHaveLength(1);
  expect(gaps[0].seg).toBe(3); // still on the closing segment
  expect(gaps[0].t).not.toBeCloseTo(startT, 2);

  // RESIZE via the footer (the gap is selected after the move drag).
  const range = page.locator('.windrose-tb-footer input.windrose-tb-range[max="6"]').first();
  await range.fill("2");
  await range.dispatchEvent("input");
  await page.waitForTimeout(300);
  gaps = await readGaps(page);
  expect(gaps[0].widthCells).toBeGreaterThan(1);
  expect(gaps[0].widthLocked).toBe(true);

  // DELETE via the footer.
  await page.locator('.windrose-tb-footer button[aria-label^="Delete opening"]').click();
  await page.waitForTimeout(300);
  expect(await readGaps(page)).toHaveLength(0);

  expect(errors).toHaveLength(0);
}, 120000);

test("Openings edit on a hex map (geometry-agnostic)", async ({ page }) => {
  const errors = setupErrorTracking(page);
  await navigateToMap(page, TEST_MAPS.hex);
  await waitForContainer(page);
  await waitForToolPalette(page);

  await drawWallWithDoor(page);
  await enterWallEdit(page);
  await selectDoorGap(page);

  await page.locator('.windrose-tb-footer button[aria-label^="Delete opening"]').click();
  await page.waitForTimeout(300);
  expect(await readGaps(page)).toHaveLength(0);

  expect(errors).toHaveLength(0);
}, 120000);
