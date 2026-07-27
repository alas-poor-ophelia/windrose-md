import {
  test,
  expect,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  getCanvasCenter,
  selectToolByTitle,
  getHistoryButtons,
  doWithApp,
  TEST_MAPS
} from "./helpers";

// ===========================================
// Party Pin Tests
// ===========================================

/** Activate the party pin tool and place a pin at the canvas center */
async function placePartyPin(page: any): Promise<{ x: number; y: number }> {
  await selectToolByTitle(page, "Party Pin");
  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(300);
  return center;
}

test("Party pin tool can be activated", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await selectToolByTitle(page, "Party Pin");

  const toolBtn = page.locator('.windrose-tool-btn[title*="Party Pin"]');
  const classes = await toolBtn.getAttribute("class");
  expect(classes).toContain("windrose-tool-btn-active");

  expect(errors).toHaveLength(0);
});

test("Clicking with party pin tool places pin with range ring and label", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await placePartyPin(page);

  const overlay = page.locator(".windrose-party-pin-overlay");
  expect(await overlay.isVisible()).toBe(true);

  // Default ring style is a geometric circle, visible without selection
  const ring = page.locator(".windrose-party-pin-ring");
  expect(await ring.isVisible()).toBe(true);

  const label = page.locator(".windrose-party-pin-label");
  expect(await label.textContent()).toBe("The Party");

  expect(errors).toHaveLength(0);
});

test("Controls card appears with the tool active and validates range input", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await placePartyPin(page);

  const card = page.locator(".windrose-party-controls");
  expect(await card.isVisible()).toBe(true);

  const rangeInput = card.locator('input[type="number"]');
  expect(await rangeInput.isVisible()).toBe(true);

  // Invalid range is rejected with feedback and does not clear the ring
  await rangeInput.fill("-10");
  await rangeInput.blur();
  await page.waitForTimeout(200);

  const error = page.locator(".windrose-party-controls-error");
  expect(await error.isVisible()).toBe(true);
  expect(await page.locator(".windrose-party-pin-ring").isVisible()).toBe(true);

  // A valid range clears the feedback
  await rangeInput.fill("20");
  await rangeInput.blur();
  await page.waitForTimeout(200);
  expect(await error.count()).toBe(0);

  expect(errors).toHaveLength(0);
});

test("Cells ring style highlights in-range cells", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await placePartyPin(page);

  const cellsToggle = page.locator('.windrose-party-controls-styles button[aria-label="Highlight cells in range"]');
  await cellsToggle.click();
  await page.waitForTimeout(300);

  const rangeCells = page.locator(".windrose-party-pin-range-cell");
  const cellCount = await rangeCells.count();
  expect(cellCount).toBeGreaterThan(0);

  // Circle ring replaced by the cell highlight
  expect(await page.locator(".windrose-party-pin-ring").count()).toBe(0);

  expect(errors).toHaveLength(0);
});

test("Dragging with the tool moves the pin and the ring follows", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const center = await placePartyPin(page);

  const marker = page.locator(".windrose-party-pin-overlay g[transform*='scale']").last();
  const before = await marker.getAttribute("transform");

  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 120, center.y + 60, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const after = await marker.getAttribute("transform");
  expect(after).not.toBe(before);

  expect(errors).toHaveLength(0);
});

test("Removing the pin clears the overlay and undo restores it", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await placePartyPin(page);
  expect(await page.locator(".windrose-party-pin-overlay").isVisible()).toBe(true);

  const removeBtn = page.locator('.windrose-party-controls button[aria-label="Remove Party Pin"]');
  await removeBtn.click();
  await page.waitForTimeout(300);

  expect(await page.locator(".windrose-party-pin-overlay").count()).toBe(0);

  const { undoBtn } = await getHistoryButtons(page);
  const undoDisabled = await undoBtn.isDisabled();
  expect(undoDisabled).toBe(false);

  await undoBtn.click();
  await page.waitForTimeout(300);
  expect(await page.locator(".windrose-party-pin-overlay").isVisible()).toBe(true);

  expect(errors).toHaveLength(0);
});

test("Icon picker assigns a glyph to the pin head and clear restores the dot", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await placePartyPin(page);

  const card = page.locator(".windrose-party-controls");
  await card.locator('button[aria-label="Pin Icon"]').click();
  await page.waitForTimeout(300);

  const picker = page.locator(".windrose-icon-picker");
  expect(await picker.isVisible()).toBe(true);

  await picker.locator(".windrose-icon-picker-search").fill("dragon");
  await page.waitForTimeout(250);
  await picker.locator('.windrose-icon-picker-cell[title="Dragon"]').click();
  await page.waitForTimeout(400);

  // Picker closes on select; the glyph renders in the pin head in the
  // RPGAwesome font, replacing the plain dot
  expect(await page.locator(".windrose-icon-picker").count()).toBe(0);
  const glyph = page.locator('.windrose-party-pin-overlay text[font-family="rpgawesome"]');
  expect(await glyph.count()).toBe(1);

  // Clear restores the dot
  await card.locator('button[aria-label="Pin Icon"]').click();
  await page.waitForTimeout(300);
  await page.locator(".windrose-icon-picker-clear").click();
  await page.waitForTimeout(400);
  expect(await page.locator('.windrose-party-pin-overlay text[font-family="rpgawesome"]').count()).toBe(0);

  expect(errors).toHaveLength(0);
});

test("Nearby list shows an explicit empty state when nothing is in range", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await placePartyPin(page);

  const empty = page.locator(".windrose-party-controls-nearby-empty");
  expect(await empty.isVisible()).toBe(true);
  expect(await empty.textContent()).toBe("Nothing in range");

  expect(errors).toHaveLength(0);
});

test("Party note is created in the vault and pin removal offers guarded deletion", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await placePartyPin(page);

  // Create the note (default folder = vault root; label 'The Party')
  const createRow = page.locator(".windrose-party-controls-note-create");
  await createRow.locator("button", { hasText: "Create" }).click();
  await page.waitForTimeout(1000);

  const notePath = "The Party - Nearby.md";
  const created = await doWithApp(page, async (app: any, params: any) => {
    return app.vault.getAbstractFileByPath(params.notePath) != null;
  }, { notePath });
  expect(created).toBe(true);

  // The card now offers open + live-update controls instead of Create
  expect(await page.locator('.windrose-party-controls button[aria-label="Open party note"]').isVisible()).toBe(true);

  // Removing the pin offers note deletion (never silent) — accept it
  await page.locator('.windrose-party-controls button[aria-label="Remove Party Pin"]').click();
  await page.waitForTimeout(400);

  const confirm = page.locator(".modal").last();
  expect(await confirm.isVisible()).toBe(true);
  await confirm.locator("button", { hasText: "Delete note" }).click();
  await page.waitForTimeout(600);

  const stillThere = await doWithApp(page, async (app: any, params: any) => {
    return app.vault.getAbstractFileByPath(params.notePath) != null;
  }, { notePath });
  expect(stillThere).toBe(false);
  expect(await page.locator(".windrose-party-pin-overlay").count()).toBe(0);

  expect(errors).toHaveLength(0);
});

test("Party pin places with a ring on hex maps", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.hex);
  await waitForContainer(page);

  await placePartyPin(page);

  expect(await page.locator(".windrose-party-pin-overlay").isVisible()).toBe(true);
  expect(await page.locator(".windrose-party-pin-ring").isVisible()).toBe(true);

  // Cells mode renders the hex bloom as polygons
  const cellsToggle = page.locator('.windrose-party-controls-styles button[aria-label="Highlight cells in range"]');
  await cellsToggle.click();
  await page.waitForTimeout(300);

  const hexCells = page.locator("polygon.windrose-party-pin-range-cell");
  const hexCount = await hexCells.count();
  expect(hexCount).toBeGreaterThan(0);

  expect(errors).toHaveLength(0);
});
