import { beforeEach } from "vitest";
import {
  test,
  expect,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  getCanvasCenter,
  selectToolByTitle,
  getHistoryButtons,
  resetDataFile,
  TEST_MAPS
} from "./helpers";

// Saved routes persist across tests since the durability fix (quit-hold) —
// these tests previously relied on teardown save LOSS for isolation. Reset
// the data file so `.first()` route selectors never grab a prior test's route.
beforeEach(() => resetDataFile());

/**
 * Activate the measure tool and click a sequence of waypoints relative to
 * the canvas center. Returns the click positions for later interaction.
 */
async function measureWaypoints(
  page: any,
  offsets: Array<{ dx: number; dy: number }>
): Promise<Array<{ x: number; y: number }>> {
  await selectToolByTitle(page, "Measure");
  const center = await getCanvasCenter(page);
  const points: Array<{ x: number; y: number }> = [];
  for (const { dx, dy } of offsets) {
    const x = center.x + dx;
    const y = center.y + dy;
    await page.mouse.click(x, y);
    await page.waitForTimeout(200);
    points.push({ x, y });
  }
  return points;
}

// ===========================================
// Measurement Tool Tests
// ===========================================

test("Measure tool can be activated", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Click the measure tool button
  await selectToolByTitle(page, "Measure");

  // Verify it's active
  const measureToolBtn = page.locator('.windrose-tool-btn[aria-label*="Measure"]');
  const classes = await measureToolBtn.getAttribute("class");
  expect(classes).toContain("windrose-tool-btn-active");

  expect(errors).toHaveLength(0);
});

test("Measure tool click sets origin point without errors", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Activate measure tool
  await selectToolByTitle(page, "Measure");

  // Click on canvas to set origin point
  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(300);

  // Should complete without errors
  expect(errors).toHaveLength(0);
});

test("Measure tool shows distance on mouse move", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Activate measure tool
  await selectToolByTitle(page, "Measure");

  // Click on canvas to set origin point
  const canvas = page.locator(".windrose-canvas-wrapper canvas").first();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();

  const originX = canvasBox!.x + canvasBox!.width * 0.3;
  const originY = canvasBox!.y + canvasBox!.height * 0.3;
  await page.mouse.click(originX, originY);
  await page.waitForTimeout(300);

  // Move mouse to a different location
  const targetX = canvasBox!.x + canvasBox!.width * 0.7;
  const targetY = canvasBox!.y + canvasBox!.height * 0.7;
  await page.mouse.move(targetX, targetY);
  await page.waitForTimeout(300);

  // Should complete without errors (measurement overlay renders)
  expect(errors).toHaveLength(0);
});

test("Multi-waypoint route shows a running total with remove-last and clear", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await measureWaypoints(page, [
    { dx: 0, dy: 0 },
    { dx: 120, dy: 0 },
    { dx: 120, dy: 90 }
  ]);

  const card = page.locator(".windrose-measure-controls");
  expect(await card.isVisible()).toBe(true);

  const total = card.locator(".windrose-measure-controls-total");
  const totalText = await total.textContent();
  expect(totalText).toMatch(/cells|ft/);

  // Remove last waypoint — card stays (2 waypoints remain)
  await card.locator('button[aria-label="Remove last waypoint"]').click();
  await page.waitForTimeout(200);
  expect(await card.isVisible()).toBe(true);

  // Clear ends the measurement entirely
  await card.locator('button[aria-label="Clear measurement"]').click();
  await page.waitForTimeout(200);
  expect(await page.locator(".windrose-measure-controls").count()).toBe(0);

  expect(errors).toHaveLength(0);
});

test("Save as route creates a styled route and undo/redo round-trips it", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Collinear waypoints: the hit polyline's bounding-box center then lies ON
  // the line, so hover-to-reveal can aim at it directly
  await measureWaypoints(page, [
    { dx: -80, dy: -40 },
    { dx: 0, dy: -40 },
    { dx: 60, dy: -40 }
  ]);

  await page.locator('.windrose-measure-controls button[aria-label="Save as route"]').click();
  await page.waitForTimeout(400);

  // Native modal: name the route and save
  const modal = page.locator(".modal").last();
  expect(await modal.isVisible()).toBe(true);
  await modal.locator('input[type="text"]').fill("Proving Route");
  await modal.locator("button", { hasText: "Save route" }).click();
  await page.waitForTimeout(400);

  // Labels are hover-revealed: move onto the route before reading it
  const hoverRoute = async (): Promise<void> => {
    const hit = page.locator('svg.windrose-route-layer polyline[stroke="transparent"]').first();
    const box = await hit.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(250);
  };

  const routeLayer = page.locator("svg.windrose-route-layer");
  expect(await routeLayer.isVisible()).toBe(true);
  await hoverRoute();
  expect(await routeLayer.textContent()).toContain("Proving Route");

  // Saved routes participate in undo history
  const { undoBtn, redoBtn } = await getHistoryButtons(page);
  await undoBtn.click();
  await page.waitForTimeout(300);
  expect(await page.locator("svg.windrose-route-layer").count()).toBe(0);

  await redoBtn.click();
  await page.waitForTimeout(300);
  await hoverRoute();
  expect(await page.locator("svg.windrose-route-layer").textContent()).toContain("Proving Route");

  expect(errors).toHaveLength(0);
});

test("Clicking a saved route opens the edit menu and rename updates the label", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await measureWaypoints(page, [
    { dx: -80, dy: 80 },
    { dx: 80, dy: 80 }
  ]);

  await page.locator('.windrose-measure-controls button[aria-label="Save as route"]').click();
  await page.waitForTimeout(400);
  const saveModal = page.locator(".modal").last();
  await saveModal.locator('input[type="text"]').fill("Old Name");
  await saveModal.locator("button", { hasText: "Save route" }).click();
  await page.waitForTimeout(400);

  // Click the route's rendered hit polyline (measure tool still active) to
  // open the menu — cell snapping can shift the line off raw click coords
  const routeHit = page.locator('svg.windrose-route-layer polyline[stroke="transparent"]').first();
  const routeBox = await routeHit.boundingBox();
  expect(routeBox).not.toBeNull();
  await page.mouse.click(routeBox!.x + routeBox!.width / 2, routeBox!.y + routeBox!.height / 2);
  await page.waitForTimeout(300);

  const menu = page.locator(".menu");
  expect(await menu.isVisible()).toBe(true);
  await menu.locator(".menu-item", { hasText: "Edit route" }).click();
  await page.waitForTimeout(400);

  // Edit modal comes up prefilled; rename and save
  const editModal = page.locator(".modal").last();
  const nameInput = editModal.locator('input[type="text"]');
  expect(await nameInput.inputValue()).toBe("Old Name");
  await nameInput.fill("New Name");
  await editModal.locator("button", { hasText: "Save changes" }).click();
  await page.waitForTimeout(400);

  // Labels are hover-revealed: move back onto the route before reading it
  await page.mouse.move(routeBox!.x + routeBox!.width / 2, routeBox!.y + routeBox!.height / 2);
  await page.waitForTimeout(250);

  const label = await page.locator("svg.windrose-route-layer").textContent();
  expect(label).toContain("New Name");
  expect(label).not.toContain("Old Name");

  expect(errors).toHaveLength(0);
});

test("Selecting a travel mode shows a live travel time for the route", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await measureWaypoints(page, [
    { dx: 0, dy: 0 },
    { dx: 120, dy: 0 }
  ]);

  // The pinned E2E Pack renders the Travel block; select the March mode
  const travel = page.locator(".windrose-measure-controls-travel");
  expect(await travel.isVisible()).toBe(true);

  await travel.locator(".windrose-measure-controls-travel-toggle").click();
  await page.waitForTimeout(200);
  await travel.locator(".windrose-measure-controls-travel-mode", { hasText: "March" })
    .locator('input[type="checkbox"]').check();
  await page.waitForTimeout(300);

  const line = travel.locator(".windrose-measure-controls-travel-line", { hasText: "March" });
  expect(await line.isVisible()).toBe(true);

  // ft-based mode on the ft-based grid fixture: a real time, never a
  // silent mismatch (TM-17)
  const classes = await line.getAttribute("class");
  expect(classes).not.toContain("is-error");
  const time = await line.locator(".windrose-measure-controls-travel-time").textContent();
  expect(time).toMatch(/min|h|day/);

  expect(errors).toHaveLength(0);
});

test("Clicking a segment opens the terrain picker and assigns terrain", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await measureWaypoints(page, [
    { dx: -60, dy: -60 },
    { dx: 90, dy: -60 }
  ]);

  // Waypoints snap to cell centers, so the rendered segment can sit up to
  // half a cell away from the raw click midpoint — aim at the rendered
  // hit line itself, not at click arithmetic
  const hitLine = page.locator('.windrose-measurement-overlay line[stroke="transparent"]').first();
  const hitBox = await hitLine.boundingBox();
  expect(hitBox).not.toBeNull();
  await page.mouse.click(hitBox!.x + hitBox!.width / 2, hitBox!.y + hitBox!.height / 2);
  await page.waitForTimeout(300);

  const picker = page.locator(".windrose-terrain-picker");
  expect(await picker.isVisible()).toBe(true);

  // Pack terrains listed alongside the None option
  await picker.locator(".windrose-terrain-picker-item", { hasText: "Forest" }).click();
  await page.waitForTimeout(300);
  expect(await page.locator(".windrose-terrain-picker").count()).toBe(0);

  // The measurement is still in progress (assigning terrain never extends
  // the route) and the card still shows
  expect(await page.locator(".windrose-measure-controls").isVisible()).toBe(true);

  expect(errors).toHaveLength(0);
});

test("Measure tool works on hex map", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.hex);
  await waitForContainer(page);

  // Activate measure tool
  await selectToolByTitle(page, "Measure");

  // Click on canvas to set origin point
  const canvas = page.locator(".windrose-canvas-wrapper canvas").first();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();

  const originX = canvasBox!.x + canvasBox!.width * 0.3;
  const originY = canvasBox!.y + canvasBox!.height * 0.3;
  await page.mouse.click(originX, originY);
  await page.waitForTimeout(300);

  // Move mouse to a different location
  const targetX = canvasBox!.x + canvasBox!.width * 0.6;
  const targetY = canvasBox!.y + canvasBox!.height * 0.6;
  await page.mouse.move(targetX, targetY);
  await page.waitForTimeout(300);

  // Should complete without errors
  expect(errors).toHaveLength(0);
});
