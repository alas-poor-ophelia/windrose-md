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
        settings: { lodLadder?: boolean };
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

async function gotoLadderHexMap(page: any): Promise<void> {
  await enableLadder(page);
  await navigateToMap(page, TEST_MAPS.hex);
  await waitForContainer(page);
  await waitForHexInstance(page);
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

  test("flag off restores the classic grid", async ({ page }) => {
    const errors = setupErrorTracking(page);

    await gotoLadderHexMap(page);
    await disableLadder(page);
    await navigateToMap(page, TEST_MAPS.hex);
    await waitForContainer(page);
    await waitForHexInstance(page);

    await resetLadderTelemetry(page);
    await wheelZoomAtCenter(page, 10);

    const snapshot = await ladderSnapshot(page);
    if (snapshot != null) {
      expect(
        snapshot.frames.length,
        `expected no new ladder frames with lodLadder off, got ${JSON.stringify(snapshot.frames)}`
      ).toBe(0);
    }

    expect(errors).toHaveLength(0);
  });
});

// ===========================================
// Phase 6 UI: level overlay, edit-level lock, settings section
//
// The numbers quoted in the design notes (zoom 8 -> L2; clicking the L1 chip
// -> zoom 3.2 = crossingZoom(1) 1.6 * sqrt(m=4)) belong to the dev vault's
// `lod-fixture` map, which is NOT in tests/fixtures/test-vault. These tests
// therefore run on the smoke-test hex map and derive every expected level from
// the DOM / the instance accessors instead of hardcoding rungs.
// ===========================================

interface OverlayState {
  present: boolean;
  chips: Array<{ level: number; current: boolean; locked: boolean; isButton: boolean }>;
  lockLabel: string | null;
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
      current: el.classList.contains("windrose-breadcrumb-current"),
      locked: el.classList.contains("windrose-ladder-chip-locked"),
      isButton: el.tagName === "BUTTON",
    }));
    const lock = document.querySelector(".windrose-ladder-lock");
    return {
      present: root != null,
      chips,
      lockLabel: lock?.getAttribute("aria-label") ?? null,
      lockIsLocked: lock?.classList.contains("is-locked") ?? false,
      readout: document.querySelector(".windrose-ladder-readout")?.textContent ?? "",
      activeLevel: inst?.getActiveLevel?.() ?? null,
      editLevel: inst?.getEditLevel?.() ?? null,
    };
  }, TEST_MAPS.hex);
}

/** Never leave the edit-level lock set: it is per-mount state. */
async function ensureUnlocked(page: any): Promise<void> {
  const lock = page.locator('.windrose-ladder-lock[aria-label="Unlock edit level"]');
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
      if (before.activeLevel != null) expect(before.activeLevel).toBe(current[0].level);

      // Click a rung other than the camera's; zoom jumps to that rung and the
      // readout follows (fixture: L1 chip -> zoom 3.2, see header comment).
      const target = before.chips.find((c) => !c.current)!;
      await page.locator(`.windrose-ladder-chip[aria-label="Zoom to level ${target.level}"]`).click();
      await page.waitForTimeout(500);

      const after = await readOverlay(page);
      expect(after.readout).toContain(`level: L${target.level}`);
      expect(after.chips.find((c) => c.current)?.level).toBe(target.level);
      if (after.activeLevel != null) expect(after.activeLevel).toBe(target.level);
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

      await page.locator('.windrose-ladder-lock[aria-label="Lock edit level"]').click();
      await setHexViewport(page, 0, 0, 8);
      await page.waitForTimeout(500);

      const locked = await readOverlay(page);
      const cameraLevel = locked.chips.find((c) => c.current)!.level;
      expect(cameraLevel, "zoom 8 vs 0.5 must land on different rungs for this test to mean anything").not.toBe(lockedLevel);
      expect(locked.lockLabel).toBe("Unlock edit level");
      expect(locked.lockIsLocked).toBe(true);
      expect(locked.readout).toContain(`edit: L${lockedLevel}`);
      expect(locked.chips.find((c) => c.level === lockedLevel)?.locked).toBe(true);
      if (locked.activeLevel != null) expect(locked.activeLevel).toBe(cameraLevel);
      if (locked.editLevel != null) expect(locked.editLevel).toBe(lockedLevel);

      await page.locator('.windrose-ladder-lock[aria-label="Unlock edit level"]').click();
      await page.waitForTimeout(200);
      const unlocked = await readOverlay(page);
      expect(unlocked.lockIsLocked).toBe(false);
      expect(unlocked.readout).not.toContain("edit:");
      if (unlocked.editLevel != null) expect(unlocked.editLevel).toBe(cameraLevel);
    } finally {
      await ensureUnlocked(page);
      await setHexViewport(page, 0, 0, 0.8);
    }
    expect(errors).toHaveLength(0);
  });

  test("level overlay is absent on a classic grid map", async ({ page }) => {
    const errors = setupErrorTracking(page);
    await enableLadder(page);
    await navigateToMap(page, TEST_MAPS.grid);
    await waitForContainer(page);
    await page.waitForTimeout(500);
    expect(await page.locator(".windrose-ladder-levels").count()).toBe(0);
    expect(errors).toHaveLength(0);
  });

  test("hex settings tab shows the detail ladder section", async ({ page }) => {
    const errors = setupErrorTracking(page);
    await enableLadder(page);
    await navigateToMap(page, TEST_MAPS.hex);
    await waitForContainer(page);
    await openSettingsModal(page);
    await page.locator('.windrose-settings-tab:has-text("Hex Grid")').click();
    const modal = page.locator(".windrose-settings-modal");
    // A classic hex map shows only the opt-in toggle; the parameter rows appear
    // once it is switched on. Cancel afterwards so no lod block is ever saved.
    expect(await modal.getByText("Enable detail ladder", { exact: false }).count(), 'missing "Enable detail ladder"').toBeGreaterThan(0);
    for (const label of ["Subdivision", "Minimum cell size", "Deepest level"]) {
      expect(await modal.getByText(label, { exact: false }).count(), `"${label}" shown before opt-in`).toBe(0);
    }
    await modal.locator('.setting-item:has-text("Enable detail ladder") .checkbox-container').first().click();
    await page.waitForTimeout(300);
    for (const label of ["Subdivision", "Minimum cell size", "Deepest level"]) {
      expect(await modal.getByText(label, { exact: false }).count(), `missing "${label}" after opt-in`).toBeGreaterThan(0);
    }
    expect(await modal.getByText("Opens at L", { exact: false }).count(), 'missing "Opens at L" readout').toBeGreaterThan(0);
    await closeSettingsModal(page);
    expect(errors).toHaveLength(0);
  });

  // Needs a map holding depth content (toggle ON + disabled, reason "(this map
  // holds depth content)"); the E2E vault has no such map (the dev-vault
  // `lod-fixture` lives outside tests/fixtures), so there is nothing to assert on.
  test.skip("settings toggle is on and disabled on a map holding depth content", async () => {});

  // NewMapModal "Detail ladder" dropdown: no existing E2E test creates a map
  // through the modal, so the open/create path is unestablished.
  test.skip("new hex map modal offers a Detail ladder preset", async () => {});
});
