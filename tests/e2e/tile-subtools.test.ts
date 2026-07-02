import { beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync, writeFileSync, unlinkSync } from "fs";
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
  MAP_IDS,
  DATA_FILE_PATH,
} from "./helpers";

// ===========================================
// Tile Placement Subtool Tests
//
// Covers the drawer's placement subtool wiring (tileForm.ts +
// TilePlacementLayer.tsx): paint (grid-snapped), stamp (freeform),
// Shift+click flood fill, and the wall-strip -> wall tool coupling.
//
// The committed test vault carries only wall-strip tile fixtures
// (walls-fixture/Test_Wall_01.png, ddSourceType 'walls'), which arm the WALL
// tool on selection — so there is no committed cell tile to drive tilePaint.
// Rather than adding a repo fixture, this spec generates a tiny PNG into the
// already-registered walls-fixture tileset folder at runtime (no metadata
// entry -> plain 'cell' form, depthAffinity 'ground' -> visible under the
// default depth) and removes it again in afterAll. The vault-level tile
// metadata file is snapshotted/restored because the browser's idle detection
// scan persists alpha/size signals for newly seen tiles.
// ===========================================

const VAULT_DIR = path.resolve(__dirname, "../fixtures/test-vault");
const CELL_TILE_FILENAME = "e2e-cell-tile.png";
const CELL_TILE_PATH = path.join(VAULT_DIR, "walls-fixture", CELL_TILE_FILENAME);
const TILE_METADATA_PATH = path.join(VAULT_DIR, "windrose-tile-metadata.json");

// 32x32 opaque brown square (valid minimal PNG)
const CELL_TILE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAL0lEQVR42u3OIQEAAAgDMIIRjGD0gxg3E/Ornb6kEhAQEBAQEBAQEBAQEBAQSAceEHOciEsn4/sAAAAASUVORK5CYII=";

let tileMetadataSnapshot: string | null = null;

beforeAll(() => {
  // Snapshot the FULL metadata file before the first mutation, then drop the
  // runtime-generated cell tile into the registered tileset folder.
  tileMetadataSnapshot = readFileSync(TILE_METADATA_PATH, "utf8");
  writeFileSync(CELL_TILE_PATH, CELL_TILE_PNG_BASE64, "base64");
});

afterAll(() => {
  try {
    unlinkSync(CELL_TILE_PATH);
  } catch {
    // already gone
  }
  if (tileMetadataSnapshot != null) {
    writeFileSync(TILE_METADATA_PATH, tileMetadataSnapshot);
  }
});

beforeEach(() => resetDataFile());

// ===========================================
// Helpers
// ===========================================

/** Saved tile assignment shape (subset relevant to these tests). */
interface SavedTile {
  col?: number;
  row?: number;
  tilesetId?: string;
  tileId?: string;
  freeform?: boolean;
  worldX?: number;
  worldY?: number;
}

/** Dispatch a mousedown, wait a beat, then mouseup on the visible map canvas
 *  at a fraction of its size (same pattern as wall-drawing.test.ts —
 *  overlapping panels can occlude the canvas, so viewport clicks are
 *  unreliable). A short pause between down and up mimics real input; the
 *  paint stroke no longer depends on a re-render between the two (the stroke
 *  commits from a synchronous ref), so this is pacing, not a correctness
 *  workaround. */
async function canvasClick(page: any, fx: number, fy: number, shift = false): Promise<void> {
  const dispatch = async (type: string): Promise<void> => {
    await page.evaluate(({ type, fx, fy, shift }: { type: string; fx: number; fy: number; shift: boolean }) => {
      const canvas = Array.from(document.querySelectorAll(".windrose-canvas-wrapper canvas"))
        .find(c => c.getBoundingClientRect().width > 50) as HTMLCanvasElement | undefined;
      if (canvas == null) throw new Error("canvas not found");
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new MouseEvent(type, {
        clientX: rect.left + rect.width * fx,
        clientY: rect.top + rect.height * fy,
        bubbles: true,
        button: 0,
        shiftKey: shift,
      }));
    }, { type, fx, fy, shift });
  };
  await dispatch("mousedown");
  await page.waitForTimeout(30);
  await dispatch("mouseup");
  await page.waitForTimeout(250);
}

/** Switch the block-mode drawer to list view and click the tile row for the
 *  given filename. List view flattens every category into plain rows, so no
 *  category-card drill-down is needed. */
async function selectTileByFilename(page: any, filename: string): Promise<void> {
  const listBtn = page.locator('.windrose-cd-head button[title="List view"]:visible').first();
  await listBtn.waitFor({ state: "visible", timeout: 10000 });
  await listBtn.click();
  await page.waitForTimeout(300);

  // Row appears once the async tileset folder scan completes
  const row = page.locator(`.windrose-tb-listrow[title="${filename}"]:visible`).first();
  await row.waitFor({ state: "visible", timeout: 15000 });
  await row.click();
  await page.waitForTimeout(400);
}

/** Read every layer's tile assignments for the smoke map from the saved JSON
 *  data file (waits for the debounced autosave to flush first). */
async function readPlacedTiles(page: any): Promise<SavedTile[]> {
  return await page.evaluate(async ({ dataPath, mapId }: { dataPath: string; mapId: string }) => {
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
    const file = w.app.vault.getAbstractFileByPath(dataPath);
    if (file == null) return [];
    const data = JSON.parse(await w.app.vault.read(file)) as {
      maps: Record<string, { layers: Array<{ tiles?: unknown[] }> }>;
    };
    const out: unknown[] = [];
    for (const layer of data.maps?.[mapId]?.layers ?? []) {
      out.push(...(layer.tiles ?? []));
    }
    return out;
  }, { dataPath: DATA_FILE_PATH, mapId: MAP_IDS.grid });
}

/** Shrink the smoke map before it is opened so a flood fill on the empty map
 *  stays small (fill bounds are dimension-derived; the default 300x300 map
 *  would run into the 10k-cell cap and bloat the data file). Must run before
 *  navigateToMap — the plugin reads the data file at map open. */
function shrinkSmokeMapForFloodFill(): void {
  const target = path.join(VAULT_DIR, DATA_FILE_PATH);
  const data = JSON.parse(readFileSync(target, "utf8"));
  const map = data.maps[MAP_IDS.grid];
  map.dimensions = { width: 8, height: 8 };
  map.viewState = { zoom: 1, center: { x: 4, y: 4 } };
  writeFileSync(target, JSON.stringify(data));
}

// ===========================================
// Tests
// ===========================================

test("Cell tile paints a grid-snapped tile (default 'paint' subtool)", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  // Selecting a cell-form tile arms tilePaint with the 'paint' default subtool
  await selectTileByFilename(page, CELL_TILE_FILENAME);

  await canvasClick(page, 0.4, 0.5);

  const placed = (await readPlacedTiles(page)).filter(t => t.tileId === "e2e-cell-tile");
  expect(placed.length).toBeGreaterThanOrEqual(1);

  const tile = placed[0];
  expect(typeof tile.col).toBe("number");
  expect(typeof tile.row).toBe("number");
  expect(tile.freeform).not.toBe(true);
  expect(tile.worldX).toBeUndefined();
  expect(tile.worldY).toBeUndefined();

  expect(errors).toHaveLength(0);
});

test("Stamp toggle places a freeform tile with world coordinates", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  await selectTileByFilename(page, CELL_TILE_FILENAME);

  // The compact footer's stamp button mirrors the subtool: OFF (paint) -> ON (stamp)
  const stampBtn = page.locator('.windrose-tb-footer button[title="Stamp: OFF"]:visible').first();
  await stampBtn.waitFor({ state: "visible", timeout: 5000 });
  await stampBtn.click();
  const stampOn = page.locator('.windrose-tb-footer button[title="Stamp: ON"]:visible').first();
  await stampOn.waitFor({ state: "visible", timeout: 3000 });

  await canvasClick(page, 0.45, 0.55);

  const placed = (await readPlacedTiles(page)).filter(t => t.tileId === "e2e-cell-tile");
  expect(placed.length).toBeGreaterThanOrEqual(1);

  const stamp = placed.find(t => t.freeform === true);
  expect(stamp).toBeDefined();
  expect(typeof stamp!.worldX).toBe("number");
  expect(typeof stamp!.worldY).toBe("number");

  expect(errors).toHaveLength(0);
});

test("Shift+click flood fills multiple snapped tiles", async ({ page }) => {
  const errors = setupErrorTracking(page);

  // Shrink the map before it is opened so the empty-map fill stays bounded
  shrinkSmokeMapForFloodFill();

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  await selectTileByFilename(page, CELL_TILE_FILENAME);

  // Shift+click is the flood-fill shortcut regardless of the armed subtool
  await canvasClick(page, 0.5, 0.5, true);

  // Assert on the SNAPPED subset: the prior test's Obsidian instance can
  // final-save during teardown and race this test's data-file reset, leaking
  // a stray freeform stamp into the file. Flood fill's own claim is that it
  // places many grid-snapped tiles.
  const placed = (await readPlacedTiles(page)).filter(t => t.tileId === "e2e-cell-tile");
  const snapped = placed.filter(t => t.freeform !== true);
  expect(snapped.length).toBeGreaterThan(1);
  for (const t of snapped.slice(0, 5)) {
    expect(typeof t.col).toBe("number");
    expect(typeof t.row).toBe("number");
  }

  expect(errors).toHaveLength(0);
});

test("Selecting a wall strip switches the active tool to wall", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  // The wall strip fixture carries depthAffinity 'structure', so switch the
  // depth band off the default 'ground' role to surface it in the browser
  const structureSeg = page.locator('.windrose-db-seg[title^="Structure"]:visible').first();
  await structureSeg.waitFor({ state: "visible", timeout: 10000 });
  await structureSeg.click();
  await page.waitForTimeout(300);

  // Selecting a walls/paths strip arms the WALL tool (not tilePaint). The tool's
  // controls live in the drawer footer (the old floating bar was removed), so the
  // grid-snap toggle appearing there is how we assert the wall tool is active.
  await selectTileByFilename(page, "Test_Wall_01.png");

  const footer = page.locator(".windrose-tb-footer");
  await footer.waitFor({ state: "visible", timeout: 5000 });
  const snap = footer.locator('button[title*="Grid snap"]');
  await snap.waitFor({ state: "visible", timeout: 5000 });
  expect(await snap.isVisible()).toBe(true);

  expect(errors).toHaveLength(0);
});
