import { describe, beforeAll, afterAll, afterEach } from "vitest";
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import {
  test,
  expect,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  openSettingsModal,
  closeSettingsModal,
  selectSubTool,
  pressMapKey,
  TEST_MAPS,
} from "./helpers";

// ===========================================
// Lattice Ladder View Tests (Phase 1, read-only)
//
// Covers the lod/lattice-ladder Phase 1 feature (design
// .claude/lod-rd/06-integration-design.md): with the developer setting
// `lodLadder` on, an unrotated hex map renders a ladder of lattices instead
// of a single grid. The active level for a given zoom is the finest rung
// whose on-screen cell width is at least `minCellPx`; fine cells inherit
// their parent's fill colour across a crossing (inherit-down), so a crossing
// must never re-bake a static surface synchronously inside the same frame.
// `window.__windroseLadder = { minCellPx }` is a developer-only override
// (never persisted) that widens the zoom window a test can reach; it is read
// once when a map's ladder is built, so it must exist before the map mounts.
//
// Telemetry: `window.__windrose.ladder.snapshot()` returns recorded frames
// once at least one ladder frame has rendered; `.reset()` clears the ring.
//
// This spec mutates plugin settings via saveSettings() (the same real path
// the settings tab uses) and restores plugin data.json afterward, mirroring
// tileset-unregister.test.ts.
// ===========================================

const VAULT_DIR = path.resolve(__dirname, "../fixtures/test-vault");
const PLUGIN_DATA_PATH = path.join(
  VAULT_DIR, ".obsidian", "plugins", "windrose-md", "data.json"
);

let pluginDataSnapshot: string | null = null;

beforeAll(() => {
  pluginDataSnapshot = readFileSync(PLUGIN_DATA_PATH, "utf8");
});

// Restored after EACH test, not just at the end: plugin settings are read at
// Obsidian boot, and a per-test boot fixture runs before any hook body can
// intervene, so leaving the flag flipped until afterAll would leak into the
// next test's boot (same reasoning as tileset-unregister.test.ts).
afterEach(() => {
  if (pluginDataSnapshot != null) {
    writeFileSync(PLUGIN_DATA_PATH, pluginDataSnapshot);
  }
});

afterAll(() => {
  if (pluginDataSnapshot != null) {
    writeFileSync(PLUGIN_DATA_PATH, pluginDataSnapshot);
  }
});

// ===========================================
// Browser-side shapes (kept local: the ladder/surfaces bridge fields are
// developer telemetry, not yet part of the shipped WindroseGlobal type in
// types/core/global.types.ts).
// ===========================================

interface LadderFrame {
  level: number;
  crossing: boolean;
  frameMs: number;
  rebuildMs: number | null;
  phases: Record<string, number>;
}

interface LadderBridge {
  snapshot: () => { frames: LadderFrame[] };
  reset: () => void;
}

interface McpOps {
  setViewport: (x: number, y: number, zoom?: number) => unknown;
}

interface McpInstance {
  notePath: string;
  ops: McpOps;
  /** Phase 6 level accessors (camera rung / rung edits land on). */
  getActiveLevel?: () => number;
  getEditLevel?: () => number;
}

interface WindrosePageWindow {
  __windrose?: {
    mcpInstances?: Record<string, McpInstance>;
    ladder?: LadderBridge;
  };
  __windroseLadder?: { minCellPx?: number };
  app: {
    plugins: {
      plugins: Record<string, {
        settings: { lodLadder?: boolean; developerMode?: boolean };
        saveSettings: () => Promise<void>;
      }>;
    };
  };
}

// ===========================================
// Helpers
// ===========================================

/**
 * Set the dev-only zoom-window override and flip the `lodLadder` capability
 * flag through the real settings path. The override is applied two ways:
 * `addInitScript` covers a genuine page navigation (the flag-off/reload test
 * below), and an immediate `evaluate` covers the common case where Obsidian's
 * window is already loaded and `navigateToMap` only performs an in-app note
 * switch (no document reload), which an init script alone would never see.
 */
async function enableLadder(page: any): Promise<void> {
  const applyOverride = (): void => {
    (window as unknown as WindrosePageWindow).__windroseLadder = { minCellPx: 40 };
  };
  await page.addInitScript(applyOverride);
  await page.evaluate(applyOverride);
  await page.evaluate(async () => {
    const w = window as unknown as WindrosePageWindow;
    const plugin = w.app.plugins.plugins["windrose-md"];
    if (plugin == null) throw new Error("windrose-md plugin not found");
    plugin.settings.lodLadder = true;
    // The override and the frame telemetry are read only in Developer mode.
    plugin.settings.developerMode = true;
    await plugin.saveSettings();
  });
}

async function disableLadder(page: any): Promise<void> {
  await page.evaluate(async () => {
    const w = window as unknown as WindrosePageWindow;
    const plugin = w.app.plugins.plugins["windrose-md"];
    if (plugin == null) return;
    plugin.settings.lodLadder = false;
    await plugin.saveSettings();
  });
}

/** Waits until the hex map's MCP instance is registered (post-mount). */
async function waitForHexInstance(page: any): Promise<void> {
  await page.waitForFunction((notePath: string) => {
    const w = window as unknown as WindrosePageWindow;
    const instances = w.__windrose?.mcpInstances ?? {};
    return Object.values(instances).some((inst) => inst.notePath === notePath);
  }, TEST_MAPS.hex, { timeout: 10000 });
}

/**
 * Give the open smoke-test hex map detail levels through the real UI: Map
 * settings > Hex Grid > "Enable detail levels" > confirm Enable > Save. A map
 * without `lod` is never a ladder view (the capability only gates authoring),
 * so every ladder-dependent test opts the map in first. The in-memory map
 * takes the `lod` block on Save; cleanVault resets the store before the next
 * test boots, so nothing leaks.
 */
async function optInDetailLevels(page: any): Promise<void> {
  await openSettingsModal(page);
  await page.locator('.windrose-settings-tab:has-text("Hex Grid")').click();
  const modal = page.locator(".windrose-settings-modal");
  const toggle = modal.locator('.setting-item:has-text("Enable detail levels") .checkbox-container').first();
  await toggle.waitFor({ state: "visible", timeout: 5000 });
  await toggle.click();
  const confirm = page.locator(".modal:has-text('Enable detail levels?')");
  await confirm.waitFor({ state: "visible", timeout: 5000 });
  await confirm.locator("button", { hasText: "Enable" }).click();
  await modal.getByText("Child hexes per parent edge", { exact: false }).first().waitFor({ state: "visible", timeout: 3000 });
  const saveBtn = page.locator('.modal-button-container .mod-cta, .windrose-modal-btn-submit').first();
  await saveBtn.dispatchEvent("click");
  await page.waitForTimeout(500);
  // The level overlay mounts only on a ladder view: proof the opt-in took.
  await page.locator(".windrose-ladder-levels").first().waitFor({ state: "visible", timeout: 5000 });
}

async function gotoLadderHexMap(page: any): Promise<void> {
  await enableLadder(page);
  await navigateToMap(page, TEST_MAPS.hex);
  await waitForContainer(page);
  await waitForHexInstance(page);
  await optInDetailLevels(page);
}

/** Calls ops.setViewport on the hex map's MCP instance from inside the page. */
async function setHexViewport(page: any, x: number, y: number, zoom: number): Promise<void> {
  await page.evaluate(({ notePath, x, y, zoom }: { notePath: string; x: number; y: number; zoom: number }) => {
    const w = window as unknown as WindrosePageWindow;
    const instances = w.__windrose?.mcpInstances ?? {};
    const inst = Object.values(instances).find((candidate) => candidate.notePath === notePath);
    if (inst == null) throw new Error("hex map MCP instance not found");
    inst.ops.setViewport(x, y, zoom);
  }, { notePath: TEST_MAPS.hex, x, y, zoom });
}

async function resetLadderTelemetry(page: any): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as WindrosePageWindow).__windrose?.ladder?.reset();
  });
}

async function ladderSnapshot(page: any): Promise<{ frames: LadderFrame[] } | null> {
  return page.evaluate(() => {
    const bridge = (window as unknown as WindrosePageWindow).__windrose?.ladder;
    return bridge == null ? null : bridge.snapshot();
  });
}

/**
 * Median RGB of a 5x5 block at the canvas centre. A single-pixel sample can
 * land on a thin lattice line and flake; the median of a small block is
 * stable against that without hiding a genuine colour change.
 */
async function sampleCenterPixelMedian(page: any): Promise<[number, number, number]> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".windrose-canvas-container canvas");
    if (canvas == null) throw new Error("windrose canvas not found");
    const ctx = canvas.getContext("2d");
    if (ctx == null) throw new Error("2d context not available");
    const size = 5;
    const half = Math.floor(size / 2);
    const cx = Math.floor(canvas.width / 2) - half;
    const cy = Math.floor(canvas.height / 2) - half;
    const data = ctx.getImageData(cx, cy, size, size).data;
    const medianChannel = (offset: number): number => {
      const values: number[] = [];
      for (let i = offset; i < data.length; i += 4) values.push(data[i]);
      values.sort((a, b) => a - b);
      return values[Math.floor(values.length / 2)];
    };
    return [medianChannel(0), medianChannel(1), medianChannel(2)];
  });
}

async function wheelZoomAtCenter(page: any, notches: number): Promise<void> {
  const canvas = page.locator(".windrose-canvas-container canvas").first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const centerX = box!.x + box!.width / 2;
  const centerY = box!.y + box!.height / 2;
  await page.mouse.move(centerX, centerY);
  for (let i = 0; i < notches; i++) {
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(500);
}

// ===========================================
// Tests
// ===========================================

describe("Lattice ladder view", () => {
  test("zooming across two crossings changes the active level and never bakes in a crossing frame", async ({ page }) => {
    const errors = setupErrorTracking(page);

    await gotoLadderHexMap(page);
    await setHexViewport(page, 0, 0, 0.5);
    await page.waitForTimeout(300);
    await resetLadderTelemetry(page);

    await wheelZoomAtCenter(page, 20);

    const snapshot = await ladderSnapshot(page);
    expect(snapshot, "expected window.__windrose.ladder to be published").not.toBeNull();
    const frames = snapshot!.frames;
    expect(frames.length, "expected at least one recorded ladder frame").toBeGreaterThan(0);

    const levelsSeen = new Set(frames.map((f) => f.level));
    expect(
      levelsSeen.size,
      `expected zooming across the range to visit >=2 levels, saw levels [${[...levelsSeen].join(", ")}] in frames ${JSON.stringify(frames)}`
    ).toBeGreaterThanOrEqual(2);

    // The very first recorded frame can legitimately carry an initial build
    // cost; every crossing after that must be inherit-down (no synchronous
    // rebuild) and cheap.
    const afterFirst = frames.slice(1);
    for (const frame of afterFirst) {
      if (frame.crossing !== true) continue;
      expect(
        frame.rebuildMs,
        `crossing frame baked a static surface synchronously: ${JSON.stringify(frame)} in frames ${JSON.stringify(frames)}`
      ).toBeNull();
      expect(
        frame.frameMs,
        `crossing frame exceeded the 16ms budget: ${JSON.stringify(frame)} in frames ${JSON.stringify(frames)}`
      ).toBeLessThan(16);
    }

    expect(errors).toHaveLength(0);
  });

  test("fills inherit across a crossing: colour under the cursor is unchanged", async ({ page }) => {
    const errors = setupErrorTracking(page);

    await gotoLadderHexMap(page);
    await setHexViewport(page, 0, 0, 0.8);
    await page.waitForTimeout(300);

    // NOTE: the MCP bridge exposes cell colours via getCells() but not a
    // world-to-screen projection, so this samples whatever cell currently
    // sits at the canvas centre rather than steering a specific painted cell
    // under the cursor. It still exercises the inherit-down guarantee: if the
    // level changes across the wheel-zoom below, the sampled colour must not.
    const before = await sampleCenterPixelMedian(page);

    await wheelZoomAtCenter(page, 15);
    await setHexViewport(page, 0, 0, 2.0);
    await page.waitForTimeout(300);

    const after = await sampleCenterPixelMedian(page);

    const tolerance = 24;
    for (let channel = 0; channel < 3; channel++) {
      expect(
        Math.abs(before[channel] - after[channel]),
        `centre pixel channel ${channel} drifted beyond tolerance: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`
      ).toBeLessThanOrEqual(tolerance);
    }

    expect(errors).toHaveLength(0);
  });

  test("a hex map without detail levels renders the classic grid, capability on or not", async ({ page }) => {
    const errors = setupErrorTracking(page);

    // Capability ON, map never opted in: no ladder frames, no level overlay.
    await enableLadder(page);
    await navigateToMap(page, TEST_MAPS.hex);
    await waitForContainer(page);
    await waitForHexInstance(page);

    await resetLadderTelemetry(page);
    await wheelZoomAtCenter(page, 10);

    const snapshot = await ladderSnapshot(page);
    // The bridge may be absent (null) or empty; it must never hold frames.
    expect(
      snapshot?.frames.length ?? 0,
      `expected no ladder frames on a map without lod, got ${JSON.stringify(snapshot?.frames)}`
    ).toBe(0);
    expect(await page.locator(".windrose-ladder-levels").count(), "no level overlay on a classic map").toBe(0);

    // Capability OFF: same answer.
    await disableLadder(page);
    await navigateToMap(page, TEST_MAPS.hex);
    await waitForContainer(page);
    await waitForHexInstance(page);
    await resetLadderTelemetry(page);
    await wheelZoomAtCenter(page, 10);
    const offSnapshot = await ladderSnapshot(page);
    expect(offSnapshot?.frames.length ?? 0, "no ladder frames with the capability off").toBe(0);
    expect(await page.locator(".windrose-ladder-levels").count()).toBe(0);

    expect(errors).toHaveLength(0);
  });
});

// ===========================================
// Phase 6 UI: level overlay, edit-level lock, settings section
//
// These tests run on the smoke-test hex map after gotoLadderHexMap opts it
// into detail levels (default parameters, m = 4, plus the minCellPx override
// from enableLadder), and derive every expected level from the DOM / the
// instance accessors instead of hardcoding rungs.
// ===========================================

interface OverlayState {
  present: boolean;
  chips: Array<{ level: number; current: boolean; locked: boolean; isButton: boolean }>;
  lockPressed: string | null;
  lockIsLocked: boolean;
  readout: string;
  activeLevel: number | null;
  editLevel: number | null;
}

async function readOverlay(page: any): Promise<OverlayState> {
  return page.evaluate((notePath: string) => {
    const w = window as unknown as WindrosePageWindow;
    const inst = Object.values(w.__windrose?.mcpInstances ?? {}).find((c) => c.notePath === notePath);
    const root = document.querySelector(".windrose-ladder-levels");
    const chips = Array.from(document.querySelectorAll(".windrose-ladder-chip")).map((el) => ({
      level: Number((el.textContent ?? "").replace(/\D/g, "")),
      current: el.classList.contains("is-current"),
      locked: el.classList.contains("is-locked"),
      isButton: el.tagName === "BUTTON",
    }));
    const lock = document.querySelector(".windrose-ladder-lock");
    return {
      present: root != null,
      chips,
      lockPressed: lock?.getAttribute("aria-pressed") ?? null,
      lockIsLocked: lock?.classList.contains("is-locked") ?? false,
      readout: document.querySelector(".windrose-ladder-readout")?.textContent ?? "",
      activeLevel: inst?.getActiveLevel?.() ?? null,
      editLevel: inst?.getEditLevel?.() ?? null,
    };
  }, TEST_MAPS.hex);
}

/** Never leave the edit-level lock set: it is per-mount state. */
async function ensureUnlocked(page: any): Promise<void> {
  const lock = page.locator('.windrose-ladder-lock[aria-pressed="true"]');
  if (await lock.count() > 0) await lock.first().click();
}

describe("Lattice ladder phase 6 UI", () => {
  test("level overlay chips, readout and chip click agree with the active level", async ({ page }) => {
    const errors = setupErrorTracking(page);
    await gotoLadderHexMap(page);
    try {
      await setHexViewport(page, 0, 0, 8);
      await page.waitForTimeout(400);

      const before = await readOverlay(page);
      expect(before.present, "expected .windrose-ladder-levels on a ladder map").toBe(true);
      expect(before.chips.length, "expected >=2 rung chips").toBeGreaterThanOrEqual(2);
      const current = before.chips.filter((c) => c.current);
      expect(current, "exactly one current chip").toHaveLength(1);
      expect(current[0].isButton, "the camera rung is a span, not a button").toBe(false);
      expect(before.readout).toContain(`level: L${current[0].level}`);
      expect(before.activeLevel, "instance exposes getActiveLevel").not.toBeNull();
      expect(before.activeLevel).toBe(current[0].level);

      // Click a rung other than the camera's; zoom jumps to that rung and the
      // readout follows (fixture: L1 chip -> zoom 3.2, see header comment).
      const target = before.chips.find((c) => !c.current)!;
      await page.locator(`.windrose-ladder-chip[aria-label="Zoom to level ${target.level}"]`).click();
      await page.waitForTimeout(500);

      const after = await readOverlay(page);
      expect(after.readout).toContain(`level: L${target.level}`);
      expect(after.chips.find((c) => c.current)?.level).toBe(target.level);
      expect(after.activeLevel, "instance exposes getActiveLevel").not.toBeNull();
      expect(after.activeLevel).toBe(target.level);
    } finally {
      await ensureUnlocked(page);
      await setHexViewport(page, 0, 0, 0.8);
    }
    expect(errors).toHaveLength(0);
  });

  test("edit-level lock pins edits to the locked rung while the camera moves", async ({ page }) => {
    const errors = setupErrorTracking(page);
    await gotoLadderHexMap(page);
    try {
      await setHexViewport(page, 0, 0, 0.5);
      await page.waitForTimeout(400);
      const low = await readOverlay(page);
      const lockedLevel = low.chips.find((c) => c.current)!.level;

      await page.locator(".windrose-ladder-lock").click();
      await setHexViewport(page, 0, 0, 8);
      await page.waitForTimeout(500);

      const locked = await readOverlay(page);
      const cameraLevel = locked.chips.find((c) => c.current)!.level;
      expect(cameraLevel, "zoom 8 vs 0.5 must land on different rungs for this test to mean anything").not.toBe(lockedLevel);
      expect(locked.lockPressed).toBe("true");
      expect(locked.lockIsLocked).toBe(true);
      expect(locked.readout).toContain(`edit: L${lockedLevel}`);
      expect(locked.chips.find((c) => c.level === lockedLevel)?.locked).toBe(true);
      expect(locked.activeLevel, "instance exposes getActiveLevel").not.toBeNull();
      expect(locked.activeLevel).toBe(cameraLevel);
      expect(locked.editLevel, "instance exposes getEditLevel").not.toBeNull();
      expect(locked.editLevel).toBe(lockedLevel);

      await page.locator(".windrose-ladder-lock").click();
      await page.waitForTimeout(200);
      const unlocked = await readOverlay(page);
      expect(unlocked.lockIsLocked).toBe(false);
      expect(unlocked.lockPressed).toBe("false");
      expect(unlocked.readout).not.toContain("edit:");
      expect(unlocked.editLevel, "instance exposes getEditLevel").not.toBeNull();
      expect(unlocked.editLevel).toBe(cameraLevel);
    } finally {
      await ensureUnlocked(page);
      await setHexViewport(page, 0, 0, 0.8);
    }
    expect(errors).toHaveLength(0);
  });

  test("level overlay is absent on a grid map", async ({ page }) => {
    const errors = setupErrorTracking(page);
    await enableLadder(page);
    await navigateToMap(page, TEST_MAPS.grid);
    await waitForContainer(page);
    await page.waitForTimeout(500);
    expect(await page.locator(".windrose-ladder-levels").count()).toBe(0);
    expect(errors).toHaveLength(0);
  });

  test("hex settings tab shows the detail levels section behind a confirmation", async ({ page }) => {
    const errors = setupErrorTracking(page);
    await enableLadder(page);
    await navigateToMap(page, TEST_MAPS.hex);
    await waitForContainer(page);
    await openSettingsModal(page);
    await page.locator('.windrose-settings-tab:has-text("Hex Grid")').click();
    const modal = page.locator(".windrose-settings-modal");
    // A classic hex map shows only the opt-in toggle; the parameter rows appear
    // once it is switched on and confirmed. Cancel afterwards so no lod block
    // is ever saved.
    const params = ["Child hexes per parent edge", "Minimum cell size", "Deepest level"];
    expect(await modal.getByText("Enable detail levels", { exact: false }).count(), 'missing "Enable detail levels"').toBeGreaterThan(0);
    expect(await modal.getByText(/ladder|rung/i).count(), "no ladder/rung wording in the modal").toBe(0);
    for (const label of params) {
      expect(await modal.getByText(label, { exact: false }).count(), `"${label}" shown before opt-in`).toBe(0);
    }
    const toggleSel = '.setting-item:has-text("Enable detail levels") .checkbox-container';

    // Cancel in the confirmation leaves the map classic: no parameter rows.
    await modal.locator(toggleSel).first().click();
    const confirm = page.locator(".modal:has-text('Enable detail levels?')");
    await confirm.waitFor({ state: "visible", timeout: 5000 });
    expect(await confirm.getByText("Windrose 2.5.0 or later", { exact: false }).count()).toBeGreaterThan(0);
    await confirm.locator("button", { hasText: "Cancel" }).click();
    await page.waitForTimeout(300);
    for (const label of params) {
      expect(await modal.getByText(label, { exact: false }).count(), `"${label}" shown after Cancel`).toBe(0);
    }

    // Enable in the confirmation opts in.
    await modal.locator(toggleSel).first().click();
    await confirm.waitFor({ state: "visible", timeout: 5000 });
    await confirm.locator("button", { hasText: "Enable" }).click();
    await page.waitForTimeout(300);
    for (const label of params) {
      expect(await modal.getByText(label, { exact: false }).count(), `missing "${label}" after opt-in`).toBeGreaterThan(0);
    }
    expect(await modal.getByText("Opens at level", { exact: false }).count(), 'missing "Opens at level" readout').toBeGreaterThan(0);
    await closeSettingsModal(page);
    expect(errors).toHaveLength(0);
  });

  test("settings toggle is on and disabled on a map holding depth content", async ({ page }) => {
    const errors = setupErrorTracking(page);
    await gotoLodFixture(page);
    await openSettingsModal(page);
    await page.locator('.windrose-settings-tab:has-text("Hex Grid")').click();
    const modal = page.locator(".windrose-settings-modal");
    const row = modal.locator('.setting-item:has-text("Enable detail levels")').first();
    await row.waitFor({ state: "visible", timeout: 5000 });
    const toggle = row.locator(".checkbox-container").first();
    expect(await toggle.evaluate((el: Element) => el.classList.contains("is-enabled")), "toggle is on").toBe(true);
    expect(await toggle.evaluate((el: Element) => el.classList.contains("is-disabled")), "toggle is disabled").toBe(true);
    expect(await row.getByText("content above level 0", { exact: false }).count(), "reason shown").toBeGreaterThan(0);

    // D-4: the child-hexes select is locked, with the reason in its description.
    const mRow = modal.locator('.setting-item:has-text("Child hexes per parent edge")').first();
    expect(await mRow.locator("select").first().isDisabled(), "child hexes select is disabled").toBe(true);
    expect(await mRow.getByText("cannot change once the map has content above level 0", { exact: false }).count()).toBeGreaterThan(0);
    await closeSettingsModal(page);
    expect(errors).toHaveLength(0);
  });

  // The New map dialog is reachable only from the full-pane view header
  // ("Create new map", MapHeader.tsx:88-92, rendered only with fullPane). A
  // fresh "open-new-map-view" tab (main.ts addCommand) has no map yet and shows
  // FullPaneMapPicker (WindroseMapView.ts renderPicker) instead of the header,
  // so the test picks the smoke hex map there first. It never creates a map
  // (Cancel at both dialogs), then closes the tab.
  test("new hex map modal offers detail levels, off by default, behind a confirmation", async ({ page }) => {
    const errors = setupErrorTracking(page);
    await enableLadder(page);
    await page.evaluate(() => {
      const w = window as unknown as { app: { commands: { executeCommandById: (id: string) => boolean } } };
      w.app.commands.executeCommandById("windrose-md:open-new-map-view");
    });
    try {
      // Both elements exist only in a full-pane view: the picker is
      // WindroseMapView.ts FullPaneMapPicker, and the header button is passed
      // onNewMap only when fullPane (DungeonMapTracker.tsx:671). The note's
      // embedded map renders neither, so page-level locators are unambiguous.
      const pickerItem = page.locator(".windrose-fullpane-picker-item", { hasText: "Smoke Test Hex Map" }).first();
      await pickerItem.waitFor({ state: "visible", timeout: 10000 });
      await pickerItem.click();
      const newMapBtn = page.locator('.windrose-header-action-btn[aria-label="Create new map"]').first();
      await newMapBtn.waitFor({ state: "visible", timeout: 10000 });
      await newMapBtn.click();
      const dialog = page.locator(".modal:has(.windrose-insert-map-modal)").last();
      await dialog.waitFor({ state: "visible", timeout: 5000 });

      const row = dialog.locator('.setting-item:has-text("Detail levels")').first();
      expect(await row.isVisible(), "detail levels row hidden until Hex is chosen").toBe(false);
      await dialog.locator(".windrose-map-type-btn", { hasText: "Hex" }).click();
      await row.waitFor({ state: "visible", timeout: 3000 });

      const select = row.locator("select").first();
      expect(await select.inputValue(), "Off (classic) is the default").toBe("off");
      const labels: string[] = await select.locator("option").allTextContents();
      expect(labels[0]).toBe("Off (classic)");
      expect(labels.some((l) => /child hexes per edge/.test(l)), "plain preset labels").toBe(true);
      expect(labels.some((l) => /m = |ladder/i.test(l)), "no raw m = / ladder labels").toBe(false);

      // A preset asks first; Cancel keeps the dialog open and creates nothing.
      await select.selectOption("4");
      await dialog.locator("button.mod-cta", { hasText: "Create" }).click();
      const confirm = page.locator(".modal:has-text('Enable detail levels?')");
      await confirm.waitFor({ state: "visible", timeout: 5000 });
      await confirm.locator("button", { hasText: "Cancel" }).click();
      await page.waitForTimeout(300);
      expect(await dialog.isVisible(), "new map dialog stays open after Cancel").toBe(true);
      await dialog.locator(".windrose-modal-buttons button", { hasText: "Cancel" }).first().click();
    } finally {
      await page.evaluate(() => {
        const w = window as unknown as { app: { workspace: { getLeavesOfType: (t: string) => Array<{ detach: () => void }> } } };
        for (const leaf of w.app.workspace.getLeavesOfType("windrose-map-view")) leaf.detach();
      });
    }
    expect(errors).toHaveLength(0);
  });
});

// ===========================================
// Depth authoring on the `lod-fixture` map (TEST-08). NOT RUN yet (needs the
// Guildmaster's go-ahead for E2E). The map ships in tests/fixtures/test-vault
// (_test-data/dungeon-maps-data.json, mirrored in dungeon-maps-data.clean.json)
// with a note at _testing/lod-fixture.md: one rung-2 cell at (3,-1), and two
// objects homed at rung 1, one of them pinned to visibleLevels [2].
// ===========================================

const LOD_FIXTURE_NOTE = "_testing/lod-fixture.md";

/** Run ops[fn](...args) in the page against the lod-fixture instance. */
async function onFixtureOps<T>(page: any, fn: string, args: unknown[] = []): Promise<T> {
  return page.evaluate(({ notePath, fn, args }: { notePath: string; fn: string; args: unknown[] }) => {
    const w = window as unknown as { __windrose?: { mcpInstances?: Record<string, { notePath: string; ops: Record<string, (...a: unknown[]) => unknown> }> } };
    const inst = Object.values(w.__windrose?.mcpInstances ?? {}).find((c) => c.notePath === notePath);
    if (inst == null) throw new Error("lod-fixture instance not found");
    if (typeof inst.ops[fn] !== "function") throw new Error("ops." + fn + " missing");
    return inst.ops[fn](...args);
  }, { notePath: LOD_FIXTURE_NOTE, fn, args }) as Promise<T>;
}

async function gotoLodFixture(page: any): Promise<void> {
  await enableLadder(page);
  await navigateToMap(page, LOD_FIXTURE_NOTE);
  await waitForContainer(page);
  await page.waitForFunction((notePath: string) => {
    const w = window as unknown as WindrosePageWindow;
    return Object.values(w.__windrose?.mcpInstances ?? {}).some((i) => i.notePath === notePath);
  }, LOD_FIXTURE_NOTE, { timeout: 10000 });
}

type RungCell = { x: number; y: number };

describe("Lattice ladder depth authoring (lod-fixture)", () => {
  test("the fixture loads with its authored rung-2 cell and both objects", async ({ page }) => {
    const errors = setupErrorTracking(page);
    await gotoLodFixture(page);
    const rung2 = await onFixtureOps<RungCell[]>(page, "getCells", [undefined, 2]);
    expect(rung2.some((c) => c.x === 3 && c.y === -1), "rung-2 cell (3,-1) is authored").toBe(true);
    const objects = await onFixtureOps<Array<{ id: string; visibleLevels?: number[] }>>(page, "listObjects", [1]);
    expect(objects.map((o) => o.id).sort()).toEqual(["lod-obj-home1", "lod-obj-pinned2"]);
    expect(objects.find((o) => o.id === "lod-obj-pinned2")?.visibleLevels).toEqual([2]);
    expect(errors).toHaveLength(0);
  });

  test("paint at depth lands in levels, undo reverts it, redo restores it", async ({ page }) => {
    const errors = setupErrorTracking(page);
    await gotoLodFixture(page);
    const has = async (x: number, y: number): Promise<boolean> =>
      (await onFixtureOps<RungCell[]>(page, "getCells", [undefined, 2])).some((c) => c.x === x && c.y === y);
    expect(await has(4, -1)).toBe(false);

    await onFixtureOps(page, "paintCell", [4, -1, "#8b5a2b", 1, 2]);
    expect(await has(4, -1), "cell painted on rung 2").toBe(true);

    await onFixtureOps(page, "undo");
    expect(await has(4, -1), "undo removes the deep cell").toBe(false);
    expect(await has(3, -1), "the authored fixture cell survives the undo").toBe(true);

    await onFixtureOps(page, "redo");
    expect(await has(4, -1), "redo restores the deep cell").toBe(true);
    expect(errors).toHaveLength(0);
  });

  // Selection without screen coordinates: Area Select (two corner clicks)
  // across the whole canvas at level 2, where the pinned object is visible,
  // then the selection toolbar's "Visible levels" action opens the picker.
  // Assertions are on the pinned object's data, read back through listObjects.
  test("level picker toggles hide the pinned object at its rung", async ({ page }) => {
    const errors = setupErrorTracking(page);
    await gotoLodFixture(page);
    type Obj = { id: string; visibleLevels?: number[] };
    const pinned = async (): Promise<Obj | undefined> =>
      (await onFixtureOps<Obj[]>(page, "listObjects", [1])).find((o) => o.id === "lod-obj-pinned2");
    expect((await pinned())?.visibleLevels).toEqual([2]);

    await onFixtureOps(page, "setViewport", [0, 0, undefined, 2]);
    await page.waitForTimeout(400);

    // Area Select is a sub-tool of the select group (ToolPalette.tsx:297-304):
    // right-click the group button (aria-label from setTooltip, "Select/Move")
    // and pick it from the .windrose-subtool-menu flyout (ToolPalette.tsx:154-166).
    await selectSubTool(page, "Select/Move", "Area Select");
    const canvas = page.locator(".windrose-canvas-wrapper canvas").first();
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    if (box == null) throw new Error("canvas not found");
    await page.mouse.click(box.x + 12, box.y + 12);
    await page.waitForTimeout(150);
    await page.mouse.click(box.x + box.width - 12, box.y + box.height - 12);
    await page.waitForTimeout(300);

    const levelsBtn = page.locator('.windrose-sel-icon-btn[aria-label="Visible levels"]').first();
    await levelsBtn.waitFor({ state: "visible", timeout: 5000 });
    await levelsBtn.click();
    const picker = page.locator(".windrose-level-picker");
    await picker.waitFor({ state: "visible", timeout: 3000 });

    // Turn level 1 on: the pinned object now shows on 1 and 2.
    await picker.locator('[aria-label="Level 1 visible"]').click();
    await page.waitForTimeout(200);
    expect([...((await pinned())?.visibleLevels ?? [])].sort()).toEqual([1, 2]);

    // Turn level 2 off: the pinned object is hidden at its rung-2 pin and
    // shows on level 1 only.
    await picker.locator('[aria-label="Level 2 visible"]').click();
    await page.waitForTimeout(200);
    const after = (await pinned())?.visibleLevels ?? [];
    expect(after.includes(2), "level 2 switched off for the pinned object").toBe(false);
    expect(after.includes(1)).toBe(true);

    await pressMapKey(page, "Escape");
    expect(errors).toHaveLength(0);
  });
});
