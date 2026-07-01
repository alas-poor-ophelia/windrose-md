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
// 256×16 strip with a paired _end cap, registered in tilesetFolders and
// marked ddSourceType: 'walls' in windrose-tile-metadata.json.
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

test("Wall tool can be selected and shows the floating bar", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  const wallToolBtn = page.locator('.windrose-tool-palette button[title*="Draw Wall"]');
  await wallToolBtn.waitFor({ state: "visible", timeout: 5000 });
  await wallToolBtn.click();
  await page.waitForTimeout(300);

  // Floating bar appears (hint or armed state)
  const bar = page.locator(".windrose-wall-bar");
  await bar.waitFor({ state: "visible", timeout: 5000 });

  expect(errors).toHaveLength(0);
});

test("Wall can be drawn from fixture strip and persists", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  // The Walls mode toggle appears in the tile browser once metadata loads
  const wallsToggle = page.locator('.windrose-tb-modebtn:visible', { hasText: "Walls" }).first();
  await wallsToggle.waitFor({ state: "visible", timeout: 10000 });
  await wallsToggle.click();
  await page.waitForTimeout(400);

  // Select the fixture strip — arms the wall tool
  const stripRow = page.locator(".windrose-wallstrip-row:visible").first();
  await stripRow.waitFor({ state: "visible", timeout: 5000 });
  await stripRow.click();
  await page.waitForTimeout(400);

  const bar = page.locator(".windrose-wall-bar");
  await bar.waitFor({ state: "visible", timeout: 5000 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);

  // Draw a 3-point wall: click, click, click, Enter
  await canvasClick(page, 0.35, 0.45);
  await canvasClick(page, 0.55, 0.45);
  await canvasClick(page, 0.55, 0.6);

  // Bar should show 3 points
  expect(await bar.textContent()).toContain("3 pts");

  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);

  // Committed: bar resets
  expect(await bar.textContent()).toContain("0 pts");

  // Verify persistence: the active layer carries a wallPaths entry
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
});

test("Escape cancels an in-progress wall", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  const wallsToggle = page.locator('.windrose-tb-modebtn:visible', { hasText: "Walls" }).first();
  await wallsToggle.waitFor({ state: "visible", timeout: 10000 });
  await wallsToggle.click();
  await page.waitForTimeout(400);

  const stripRow = page.locator(".windrose-wallstrip-row:visible").first();
  await stripRow.click();
  await page.waitForTimeout(400);

  await canvasClick(page, 0.35, 0.35);
  await canvasClick(page, 0.5, 0.35);

  const bar = page.locator(".windrose-wall-bar");
  expect(await bar.textContent()).toContain("2 pts");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  expect(await bar.textContent()).toContain("0 pts");
  expect(errors).toHaveLength(0);
});
