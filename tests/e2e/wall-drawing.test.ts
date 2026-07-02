import {
  test,
  expect,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  waitForToolPalette,
  TEST_MAPS,
} from "./helpers";

// ===========================================
// Wall Drawing Tool Tests
//
// Uses the walls-fixture tileset (test-vault/walls-fixture/) — a generated
// 256×16 strip (Test_Wall_01.png) with a paired _end cap, registered in
// tilesetFolders and marked ddSourceType: 'walls' (depthAffinity: 'structure')
// in windrose-tile-metadata.json.
//
// The wall tool has no floating toolbar anymore — its controls live in the tile
// drawer's loaded-brush footer (.windrose-tb-footer). Selecting a wall/path
// strip derives form 'line', which auto-arms the wall tool; the footer then
// renders the draw/edit controls and the live "N pts" count.
// ===========================================


/** Dispatch a mousedown+mouseup pair directly on the map canvas at a fraction
 *  of its size. Overlapping panels (drawer, sidebar) can occlude the canvas in
 *  the small E2E window, so Playwright viewport clicks are unreliable here. */
async function canvasClick(page: any, fx: number, fy: number): Promise<void> {
  await page.evaluate(({ fx, fy }: { fx: number; fy: number }) => {
    const canvas = document.querySelector(".windrose-canvas-wrapper canvas") as HTMLCanvasElement | null;
    if (canvas == null) throw new Error("canvas not found");
    const rect = canvas.getBoundingClientRect();
    const opts = {
      clientX: rect.left + rect.width * fx,
      clientY: rect.top + rect.height * fy,
      bubbles: true,
      button: 0,
    };
    canvas.dispatchEvent(new MouseEvent("mousedown", opts));
    canvas.dispatchEvent(new MouseEvent("mouseup", opts));
  }, { fx, fy });
  await page.waitForTimeout(250);
}

/** Arm the wall tool by selecting the fixture wall strip from the tile drawer.
 *  The strip is classified on the 'structure' depth tier, so we switch tiers,
 *  narrow with search, then click it. Selecting it derives form 'line' →
 *  auto-arms the wall tool → the footer shows the wall controls. */
async function armWallStrip(page: any): Promise<void> {
  // The fixture strip lives on the Structure tier; the drawer opens on Ground.
  const structSeg = page.locator('.windrose-db-seg[title^="Structure"]');
  await structSeg.waitFor({ state: "visible", timeout: 10000 });
  await structSeg.click();
  await page.waitForTimeout(300);

  // Narrow the drawer to the fixture strip by filename.
  const search = page.locator(".windrose-tb-search input").first();
  await search.fill("Test_Wall");
  await page.waitForTimeout(400);

  // Card (grid) view groups tiles under category cards — the individual tile
  // isn't in the DOM until the category is drilled. If it isn't already
  // rendered (e.g. list view), click the category card to open it.
  const strip = page.locator('[title="Test_Wall_01.png"]').first();
  if ((await strip.count()) === 0) {
    const card = page.locator(".windrose-tb-card").first();
    await card.waitFor({ state: "visible", timeout: 5000 });
    await card.click();
    await page.waitForTimeout(300);
  }

  // Selecting the strip arms the wall tool. The click also moves focus off the
  // search input, so subsequent Enter/Escape/Backspace reach the canvas handler
  // (which ignores keydown while an INPUT is focused).
  await strip.waitFor({ state: "visible", timeout: 5000 });
  await strip.click();
  await page.waitForTimeout(400);
}

test("Selecting a wall strip arms the tool and shows footer controls", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  await armWallStrip(page);

  // The relocated wall controls appear in the drawer footer (grid-snap toggle).
  const footer = page.locator(".windrose-tb-footer");
  await footer.waitFor({ state: "visible", timeout: 5000 });
  const snap = footer.locator('button[title*="Grid snap"]');
  await snap.waitFor({ state: "visible", timeout: 5000 });
  expect(await snap.isVisible()).toBe(true);

  expect(errors).toHaveLength(0);
}, 120000);

test("Wall can be drawn from fixture strip and persists", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  await armWallStrip(page);

  const footer = page.locator(".windrose-tb-footer");
  await footer.waitFor({ state: "visible", timeout: 5000 });

  // Draw a 3-point wall: click, click, click, Enter
  await canvasClick(page, 0.35, 0.45);
  await canvasClick(page, 0.55, 0.45);
  await canvasClick(page, 0.55, 0.6);

  // Footer shows the live point count
  expect(await footer.textContent()).toContain("3 pts");

  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);

  // Committed: the draw state resets
  expect(await footer.textContent()).toContain("0 pts");

  // Verify persistence: the active layer carries a wallPaths entry (helper below)
  const wallCount = await page.evaluate(async () => {
    const w = window as unknown as {
      app: {
        vault: {
          getAbstractFileByPath: (p: string) => unknown;
          read: (f: unknown) => Promise<string>;
        };
      };
    };
    // Allow the debounced save to flush
    await new Promise((r) => setTimeout(r, 3500));
    const file = w.app.vault.getAbstractFileByPath("_test-data/dungeon-maps-data.json");
    if (file == null) return -1;
    const data = JSON.parse(await w.app.vault.read(file)) as {
      maps: Record<string, { layers: Array<{ wallPaths?: unknown[] }> }>;
    };
    let count = 0;
    for (const m of Object.values(data.maps ?? {})) {
      for (const layer of m.layers ?? []) {
        count += layer.wallPaths?.length ?? 0;
      }
    }
    return count;
  });

  expect(wallCount).toBeGreaterThanOrEqual(1);
  expect(errors).toHaveLength(0);
}, 120000);

test("Escape cancels an in-progress wall", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  await armWallStrip(page);

  const footer = page.locator(".windrose-tb-footer");
  await footer.waitFor({ state: "visible", timeout: 5000 });

  await canvasClick(page, 0.35, 0.35);
  await canvasClick(page, 0.5, 0.35);

  expect(await footer.textContent()).toContain("2 pts");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  expect(await footer.textContent()).toContain("0 pts");
  expect(errors).toHaveLength(0);
}, 120000);
