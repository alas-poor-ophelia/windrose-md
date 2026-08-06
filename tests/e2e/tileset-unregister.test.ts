import { beforeAll, afterAll, beforeEach, afterEach } from "vitest";
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
// Tileset Unregistration Tests
//
// Covers windrose-0mc: removing a tile pack folder from the global plugin
// settings left its tiles registered. Tilesets live on MAP DATA, not settings,
// and useTilesetBuilder returned early on `folders.length === 0`, so the removed
// pack stayed in the drawer and stayed persisted through reloads.
//
// The committed test vault registers two tileset folders (Hex Samples,
// walls-fixture), so this spec starts from a genuinely populated registry and
// removes it at runtime through the real path: mutate plugin.settings and call
// plugin.saveSettings(), which dispatches windrose-settings-changed exactly the
// way the settings tab's onDelete handler does. data.json is snapshotted and
// restored because saveSettings persists the mutation.
// ===========================================

const VAULT_DIR = path.resolve(__dirname, "../fixtures/test-vault");
const PLUGIN_DATA_PATH = path.join(
  VAULT_DIR, ".obsidian", "plugins", "windrose-md", "data.json"
);

let pluginDataSnapshot: string | null = null;

beforeAll(() => {
  pluginDataSnapshot = readFileSync(PLUGIN_DATA_PATH, "utf8");
});

afterAll(() => {
  if (pluginDataSnapshot != null) {
    writeFileSync(PLUGIN_DATA_PATH, pluginDataSnapshot);
  }
});

beforeEach(() => resetDataFile());

// Every test here mutates tilesetFolders and persists it via saveSettings().
// Restore in afterEach, NOT beforeEach: plugin settings are read once at
// Obsidian BOOT, and the per-test boot fixture runs before beforeEach hooks — so
// a beforeEach restore lands too late and the next test (or a vitest retry of
// this one) boots a vault the previous attempt already emptied. Cleaning up
// immediately after each test guarantees every boot starts from the fixture.
afterEach(() => {
  if (pluginDataSnapshot != null) {
    writeFileSync(PLUGIN_DATA_PATH, pluginDataSnapshot);
  }
});

// ===========================================
// Helpers
// ===========================================

/** How many tilesets the live map currently has registered. Reads the running
 *  plugin's map instance via the MCP bridge rather than the DOM, so the
 *  assertion is about the registry itself and not about whatever the drawer
 *  happens to render. */
async function readRegisteredTilesetCount(page: any): Promise<number | null> {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __windrose?: { mcpInstances?: Record<string, { ops?: { listTiles?: () => unknown[] } }> };
    };
    const instances = w.__windrose?.mcpInstances;
    if (instances == null) return null;
    for (const key of Object.keys(instances)) {
      const list = instances[key]?.ops?.listTiles?.();
      if (list != null) return list.length;
    }
    return null;
  });
}

/** Remove every registered tileset folder through the real settings path. */
async function removeAllTilesetFolders(page: any): Promise<void> {
  await page.evaluate(async () => {
    const w = window as unknown as {
      app: { plugins: { plugins: Record<string, {
        settings: { tilesetFolders?: string[] };
        saveSettings: () => Promise<void>;
      }> } };
    };
    const plugin = w.app.plugins.plugins["windrose-md"];
    if (plugin == null) throw new Error("windrose-md plugin not found");
    plugin.settings.tilesetFolders = [];
    await plugin.saveSettings();
  });
}

// ===========================================
// Tests
// ===========================================

test("Removing every tileset folder unregisters its tiles", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  // The async tileset folder scan has to land before we can claim a baseline.
  await page.waitForFunction(() => {
    const w = window as unknown as {
      __windrose?: { mcpInstances?: Record<string, { ops?: { listTiles?: () => unknown[] } }> };
    };
    const instances = w.__windrose?.mcpInstances ?? {};
    for (const key of Object.keys(instances)) {
      const list = instances[key]?.ops?.listTiles?.();
      if (list != null && list.length > 0) return true;
    }
    return false;
  }, { timeout: 20000 });

  const before = await readRegisteredTilesetCount(page);
  expect(before).toBeGreaterThan(0);

  await removeAllTilesetFolders(page);

  // The rebuild is driven by the settings-changed event, so poll rather than
  // sleeping a fixed beat.
  await page.waitForFunction(() => {
    const w = window as unknown as {
      __windrose?: { mcpInstances?: Record<string, { ops?: { listTiles?: () => unknown[] } }> };
    };
    const instances = w.__windrose?.mcpInstances ?? {};
    for (const key of Object.keys(instances)) {
      const list = instances[key]?.ops?.listTiles?.();
      if (list != null) return list.length === 0;
    }
    return false;
  }, { timeout: 15000 });

  const after = await readRegisteredTilesetCount(page);
  expect(after).toBe(0);

  expect(errors).toHaveLength(0);
});

test("Drawer falls back to the empty state once the last pack is removed", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await waitForToolPalette(page);

  const emptyState = page.locator(".windrose-tile-browser-empty-state");
  await page.waitForTimeout(2000);

  // Regression guard: this vault HAS tile packs, so the drawer must open on the
  // Tiles pane. The no-packs default reads the folder settings synchronously —
  // keying it off mapData.tilesets instead raced the async tileset builder and
  // opened every tiled vault on Objects.
  const paneBefore = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".windrose-cd-segbtn"))
      .map(b => `${b.textContent}:${b.className.includes("active") ? "on" : "off"}`)
      .join(",")
  );
  expect(paneBefore).toContain("Tiles:on");
  expect(await emptyState.count()).toBe(0);

  await removeAllTilesetFolders(page);
  await page.waitForTimeout(4000);

  // The drawer must actually re-render to the empty state — the registry going
  // empty is only half the fix if the pane keeps painting stale tiles.
  const snapshot = await page.evaluate(() => {
    const count = (sel: string): number => document.querySelectorAll(sel).length;
    const drawer = document.querySelector(".windrose-tile-drawer");
    const browser = document.querySelector(".windrose-tile-browser");
    return {
      emptyState: count(".windrose-tile-browser-empty-state"),
      browser: count(".windrose-tile-browser"),
      listRows: count(".windrose-tb-listrow"),
      thumbs: count(".windrose-tile-thumb"),
      drawerClass: drawer?.className ?? "(no drawer)",
      browserClass: browser?.className ?? "(no browser)",
      browserWidth: browser?.getBoundingClientRect().width ?? -1,
      activeSeg: Array.from(document.querySelectorAll(".windrose-cd-segbtn"))
        .map(b => `${b.textContent}:${b.className.includes("active") ? "on" : "off"}`)
        .join(","),
    };
  });

  expect(JSON.stringify(snapshot)).toContain('"emptyState":1');
  expect(snapshot.listRows).toBe(0);
  expect(snapshot.thumbs).toBe(0);

  expect(errors).toHaveLength(0);
});
