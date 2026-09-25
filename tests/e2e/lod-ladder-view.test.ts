import { describe, beforeAll, afterAll, afterEach } from "vitest";
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import {
  test,
  expect,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
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
