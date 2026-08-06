import { beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import {
  test,
  expect,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  waitForToolPalette,
  resetDataFile,
  TEST_MAPS,
} from "./helpers";

// ===========================================
// Empty Tile Drawer Tests
//
// Covers the drawer's no-tilesets state (windrose-ghg): a user with nothing
// imported used to get a SEE-THROUGH tile pane, because
// `.windrose-tile-browser-empty-state` set `background: transparent` on the same
// element that carries `.windrose-tile-browser` — equal specificity, later in
// source, so the drawer surface lost and the map showed through it.
//
// The committed test vault registers two tileset folders, so the empty state is
// unreachable as shipped. These specs blank `tilesetFolders` in the plugin's
// data.json before Obsidian boots (the plugin reads it at load) and restore the
// original file in afterAll.
//
// SCOPE: block mode only. `navigateToMap` opens a note containing a
// windrose-map code block, and the harness has no full-pane helper, so the
// full-pane-only halves of windrose-ghg (the missing collapse button and the
// in-pane Tiles/Objects ribbon, both of which live INSIDE TileAssetBrowser in
// full-pane but come from renderCompactDrawerHead here) are NOT covered. See
// the full-pane harness bead.
// ===========================================

const VAULT_DIR = path.resolve(__dirname, "../fixtures/test-vault");
const PLUGIN_DATA_PATH = path.join(
  VAULT_DIR, ".obsidian", "plugins", "windrose-md", "data.json"
);

let pluginDataSnapshot: string | null = null;

beforeAll(() => {
  pluginDataSnapshot = readFileSync(PLUGIN_DATA_PATH, "utf8");
  const data = JSON.parse(pluginDataSnapshot);
  data.tilesetFolders = [];
  writeFileSync(PLUGIN_DATA_PATH, JSON.stringify(data, null, 2));
});

afterAll(() => {
  if (pluginDataSnapshot != null) {
    writeFileSync(PLUGIN_DATA_PATH, pluginDataSnapshot);
  }
});

beforeEach(() => resetDataFile());

// ===========================================
// Helpers
// ===========================================

/** Read the paint of the VISIBLE empty-state pane. Background/hidden Obsidian
 *  leaves keep their full DOM and answer an unscoped query with a 0x0 rect, so
 *  pick the element that actually has a box before measuring it. */
async function readEmptyPanePaint(page: any): Promise<{
  backgroundColor: string;
  backgroundImage: string;
  width: number;
} | null> {
  return await page.evaluate(() => {
    const el = Array.from(
      document.querySelectorAll(".windrose-tile-browser-empty-state")
    ).find(e => e.getBoundingClientRect().width > 0);
    if (el == null) return null;
    const cs = getComputedStyle(el);
    return {
      backgroundColor: cs.backgroundColor,
      backgroundImage: cs.backgroundImage,
      width: el.getBoundingClientRect().width,
    };
  });
}

/** The block-mode drawer's segmented Tiles|Objects control. */
function segButton(page: any, label: "Tiles" | "Objects"): any {
  return page.locator(`.windrose-cd-paneseg button.windrose-cd-segbtn:text-is("${label}")`).first();
}

// ===========================================
// Tests
// ===========================================

test("Drawer opens on the Objects pane when the vault has no tilesets", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  const objects = segButton(page, "Objects");
  await objects.waitFor({ state: "visible", timeout: 10000 });

  // The pane default is applied once map data resolves, so give it a beat.
  await page.waitForTimeout(500);

  const objectsClass = await objects.getAttribute("class");
  expect(objectsClass).toContain("active");

  const tilesClass = await segButton(page, "Tiles").getAttribute("class");
  expect(tilesClass).not.toContain("active");

  expect(errors).toHaveLength(0);
});

test("Empty tile pane paints the drawer surface instead of going see-through", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  // The switch must still be reachable from the empty state — that is the whole
  // point of the fix. Clicking Tiles is what surfaces the empty state.
  const tiles = segButton(page, "Tiles");
  await tiles.waitFor({ state: "visible", timeout: 10000 });
  await tiles.click();
  await page.waitForTimeout(500);

  const emptyPane = page.locator(".windrose-tile-browser-empty-state").first();
  await emptyPane.waitFor({ state: "visible", timeout: 10000 });

  const paint = await readEmptyPanePaint(page);
  expect(paint).not.toBeNull();
  expect(paint!.width).toBeGreaterThan(0);

  // The regression: a fully transparent background-color means the map shows
  // through the drawer. Any painted surface has a non-zero alpha.
  expect(paint!.backgroundColor).not.toBe("transparent");
  expect(paint!.backgroundColor).not.toMatch(/rgba\([^)]*,\s*0\s*\)$/);

  // And the message itself still rendered (we are looking at the empty state,
  // not an incidentally-classed element).
  const message = page.locator(".windrose-tile-browser-empty-message").first();
  expect(await message.isVisible()).toBe(true);

  // The user can get back out.
  const objectsClass = await segButton(page, "Objects").getAttribute("class");
  expect(objectsClass).not.toContain("active");
  expect(await segButton(page, "Objects").isVisible()).toBe(true);

  expect(errors).toHaveLength(0);
});
