import { test } from "obsidian-testing-framework";
import { doWithApp } from "obsidian-testing-framework/lib/util.js";
import { expect } from "vitest";

// Re-export for convenience
export { test, expect, doWithApp };

const CONTAINER_TIMEOUT = 10000;

export const AUTOSAVE_WAIT = 3000;

export const DATA_FILE_PATH = "_test-data/dungeon-maps-data.json";

/**
 * Reset the windrose data file to the clean fixture.
 * Use in beforeEach for tests that mutate cell/object/layer data and assert on counts,
 * to prevent state pollution from prior tests in the same file.
 */
export function resetDataFile(): void {
  const fs = require("fs");
  const path = require("path");
  const fixturesDir = path.resolve(__dirname, "../fixtures");
  const cleanFile = path.join(fixturesDir, "dungeon-maps-data.clean.json");
  const target = path.join(fixturesDir, "test-vault", DATA_FILE_PATH);
  if (fs.existsSync(cleanFile)) {
    fs.copyFileSync(cleanFile, target);
  }
}

// ===========================================
// Error Tracking
// ===========================================

/** Collect Windrose-related errors from page */
export function setupErrorTracking(page: any): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err: Error) => {
    const msg = err.message.toLowerCase();
    if (msg.includes("windrose") || msg.includes("dmt") || msg.includes("dungeon")) {
      errors.push(err.message);
    }
  });
  return errors;
}

// ===========================================
// Navigation Helpers
// ===========================================

/** Navigate to a test map file */
export async function navigateToMap(page: any, mapPath: string): Promise<void> {
  await doWithApp(page, async (app: any, path?: string) => {
    const file = app.vault.getAbstractFileByPath(path!);
    if (file) {
      await app.workspace.openLinkText(file.path, "", false);
    } else {
      throw new Error(`Test file ${path!} not found in vault`);
    }
  }, mapPath);

  await page.waitForTimeout(300);
}

// ===========================================
// Plugin Installer Helpers
// ===========================================

/**
 * Handle the Settings Plugin Installer if it appears.
 * This installer blocks the main canvas when a plugin install/upgrade is offered.
 * Clicks through the install/upgrade flow and enables the plugin.
 * Only needs to run once per test run since the plugin persists.
 */
export async function handlePluginInstallerIfPresent(page: any, timeout: number = 5000): Promise<boolean> {
  const installer = page.locator(".windrose-plugin-installer");

  // Quick check if installer is visible
  try {
    const isVisible = await installer.isVisible({ timeout: 500 });
    if (!isVisible) return false;
  } catch {
    return false; // Not visible or doesn't exist
  }

  console.log("[Test Helper] Plugin installer detected, handling install/upgrade flow...");

  // Click the primary action button (Install Plugin / Update Plugin)
  const primaryBtn = installer.locator(".windrose-plugin-installer-btn-primary");
  await primaryBtn.waitFor({ state: "visible", timeout: 3000 });
  await primaryBtn.click();

  // Wait for success modal to appear
  const successModal = page.locator(".windrose-plugin-success-modal-overlay");
  await successModal.waitFor({ state: "visible", timeout: timeout });

  // Click the primary button in success modal (Enable Now / Continue)
  const modalPrimaryBtn = successModal.locator(".windrose-plugin-installer-btn-primary");
  await modalPrimaryBtn.waitFor({ state: "visible", timeout: 3000 });
  await modalPrimaryBtn.click();

  // Wait for modal to close and container to start rendering
  await page.waitForTimeout(500);

  console.log("[Test Helper] Plugin installer flow completed");
  return true;
}

/** Wait for Windrose container to be ready */
export async function waitForContainer(page: any, timeout: number = CONTAINER_TIMEOUT): Promise<any> {
  const container = page.locator(".windrose-container").first();

  const markdownView = page.locator(".markdown-reading-view, .markdown-source-view");
  try {
    await markdownView.first().waitFor({ state: "visible", timeout: 5000 });
  } catch {
    // View not found - proceed anyway
  }

  await page.waitForTimeout(100);
  await handlePluginInstallerIfPresent(page, 10000);

  try {
    await container.waitFor({ state: "visible", timeout });
    return container;
  } catch {
    const containerCount = await container.count();

    const screenshotPath = `tests/e2e/screenshots/container-timeout-${Date.now()}.png`;
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`[Debug] Screenshot saved to ${screenshotPath}`);
    } catch (e) {
      console.log(`[Debug] Failed to capture screenshot: ${e}`);
    }

    throw new Error(
      `Timeout waiting for .windrose-container after ${timeout}ms. ` +
      `Container count: ${containerCount}. ` +
      `Screenshot: ${screenshotPath}`
    );
  }
}

// ===========================================
// Canvas Helpers
// ===========================================

/** Helper to get canvas center coordinates */
export async function getCanvasCenter(page: any): Promise<{ x: number; y: number }> {
  const canvas = page.locator(".windrose-canvas-wrapper canvas").first();
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error("Canvas not found");
  return {
    x: canvasBox.x + canvasBox.width / 2,
    y: canvasBox.y + canvasBox.height / 2
  };
}

/** Helper to focus the canvas area for keyboard shortcuts */
export async function focusCanvas(page: any): Promise<void> {
  const canvas = page.locator(".windrose-canvas-wrapper canvas").first();
  await canvas.click();
  await page.waitForTimeout(100);
}

// ===========================================
// Tool Palette Helpers
// ===========================================

/** Wait for tool palette to be visible */
export async function waitForToolPalette(page: any): Promise<any> {
  const toolPalette = page.locator(".windrose-tool-palette");
  await toolPalette.waitFor({ state: "visible", timeout: 5000 });
  return toolPalette;
}

/** Select a tool by index (0=select, 1=draw, 2=erase, 3=rect, 4=circle) */
export async function selectToolByIndex(page: any, index: number): Promise<void> {
  const toolBtn = page.locator(".windrose-tool-palette .windrose-tool-btn").nth(index);
  await toolBtn.click();
  await page.waitForTimeout(100);
}

/**
 * Map a loose tool title pattern to a precise, non-colliding selector.
 * The wall tool's title is "Draw Wall/Path (select from Walls tab)", which
 * collides with a `[title*="Draw"]` match against the paint tool
 * ("Draw (fill cells)"). Normalize common patterns to unambiguous ones.
 */
function toolTitleSelector(titlePattern: string): string {
  const p = titlePattern.toLowerCase();
  // "Draw" alone (or "Draw (fill cells)") should mean the paint/fill tool,
  // NOT the wall tool. Disambiguate via "fill cells".
  if (p === "draw" || p.includes("fill cells")) {
    return `.windrose-tool-btn[title*="fill cells"]`;
  }
  if (p.includes("wall")) {
    return `.windrose-tool-btn[title*="Wall"]`;
  }
  return `.windrose-tool-btn[title*="${titlePattern}"]`;
}

/** Select a tool by title attribute */
export async function selectToolByTitle(page: any, titlePattern: string): Promise<void> {
  const toolBtn = page.locator(toolTitleSelector(titlePattern)).first();
  await toolBtn.waitFor({ state: "visible", timeout: 5000 });
  await toolBtn.click();
  await page.waitForTimeout(100);
}

/** Select a sub-tool from a tool group's flyout menu */
export async function selectSubTool(page: any, parentToolTitle: string, subToolLabel: string): Promise<void> {
  // Right-click the parent tool button to open the flyout (sub-menu opens via context menu).
  // Use the disambiguated selector so "Draw" resolves to the paint tool, not the wall tool.
  const parentBtn = page.locator(toolTitleSelector(parentToolTitle)).first();
  await parentBtn.waitFor({ state: "visible", timeout: 5000 });
  await parentBtn.click({ button: 'right' });
  await page.waitForTimeout(200);

  // Click the sub-tool option in the flyout
  const subToolOption = page.locator(`.windrose-subtool-menu .windrose-subtool-option`).filter({ hasText: subToolLabel });
  await subToolOption.waitFor({ state: "visible", timeout: 3000 });
  await subToolOption.click();
  await page.waitForTimeout(100);
}

// ===========================================
// History Controls Helpers
// ===========================================

/** Helper to get history control buttons */
export async function getHistoryButtons(page: any) {
  const container = page.locator('.windrose-history-controls');
  await container.waitFor({ state: "visible", timeout: 5000 });
  return {
    undoBtn: container.locator('.windrose-history-btn').first(),
    redoBtn: container.locator('.windrose-history-btn').nth(1)
  };
}

// ===========================================
// Object Sidebar Helpers
// ===========================================

/**
 * Whether the object palette is showing (expanded, with grid items).
 * In block mode the ObjectSidebar is a pane inside the right tile drawer
 * (`.windrose-cd`), selected via the "Objects" segmented control — not a
 * standalone collapsible sidebar.
 */
export async function isObjectSidebarExpanded(page: any): Promise<boolean> {
  const sidebar = page.locator('.windrose-object-sidebar:not(.windrose-object-sidebar-collapsed)');
  return await sidebar.count() > 0;
}

/**
 * Ensure the object palette is visible by switching the drawer to the Objects
 * pane (and expanding the drawer first if it's folded to its ribbon).
 */
export async function expandObjectSidebarIfNeeded(page: any): Promise<void> {
  if (await isObjectSidebarExpanded(page)) return;

  // If the tile drawer is folded to its ribbon, expand it via the pane spine btn.
  const collapsedDrawer = page.locator('.windrose-tile-drawer:not(.is-open)');
  if (await collapsedDrawer.count() > 0) {
    const openBtn = page.locator('.windrose-tile-spine-panebtn').first();
    if (await openBtn.count() > 0) {
      await openBtn.click();
      await page.waitForTimeout(500);
    }
  }

  // Switch to the Objects pane.
  const objSeg = page.locator('.windrose-cd-segbtn', { hasText: 'Objects' });
  if (await objSeg.count() > 0) {
    await objSeg.first().click();
    await page.waitForTimeout(400);
  }
}

// ===========================================
// Settings Modal Helpers
// ===========================================

/**
 * Open the map settings modal.
 * In block/embed mode the old `.windrose-controls` hover → `.windrose-expand-btn`
 * settings button is gone (MapControls renders with `minimalControls`). Settings
 * now lives in the left EdgeRail's "View" panel as `.windrose-dock-view-settings`.
 */
export async function openSettingsModal(page: any): Promise<void> {
  // Open the View panel from the EdgeRail
  const viewRailBtn = page.locator('.windrose-edge-rail-btn[title="View"]');
  await viewRailBtn.waitFor({ state: "visible", timeout: 5000 });
  await viewRailBtn.click();
  await page.waitForTimeout(500); // fold animation

  const settingsBtn = page.locator('.windrose-dock-view-settings');
  await settingsBtn.waitFor({ state: "visible", timeout: 5000 });
  await settingsBtn.click();
  await page.waitForTimeout(300);
}

/** Helper to close the settings modal via Cancel button (supports both native and fallback modals) */
export async function closeSettingsModal(page: any): Promise<void> {
  // Native modal uses plain button text, fallback uses .windrose-modal-btn-cancel
  const cancelBtn = page.locator('.windrose-modal-btn-cancel, .modal-button-container button:not(.mod-cta)').first();
  await cancelBtn.dispatchEvent('click');
  await page.waitForTimeout(200);
}

// ===========================================
// Layer Panel Helpers
// ===========================================

/**
 * Toggle the layer panel via the block-mode EdgeRail.
 * In block/embed mode the old `.windrose-expand-btn[title="Toggle layer panel"]`
 * (rendered only in non-minimal MapControls) is not present — layers open from
 * the left EdgeRail icon (`title="Layers"`) into `.windrose-edge-rail-drawer`.
 * This helper is a toggle: calling it again folds the drawer closed.
 */
export async function openLayerPanel(page: any): Promise<void> {
  const railBtn = page.locator('.windrose-edge-rail-btn[title="Layers"]');
  await railBtn.waitFor({ state: "visible", timeout: 5000 });
  await railBtn.click();
  await page.waitForTimeout(500); // fold animation ~0.42s
}

// ===========================================
// Data Access Helpers
// ===========================================

/** Helper to read cell count from a specific layer in the JSON data file */
export async function getLayerCellCount(page: any, mapId: string, layerId: string): Promise<number> {
  return await doWithApp(page, async (app: any, params?: { mapId: string; layerId: string; dataPath: string }) => {
    const dataFile = app.vault.getAbstractFileByPath(params!.dataPath);
    if (!dataFile) return -1;

    const content = await app.vault.read(dataFile);
    const data = JSON.parse(content);
    const map = data.maps?.[params!.mapId];
    if (!map) return -1;

    const layer = map.layers?.find((l: any) => l.id === params!.layerId);
    return layer?.cells?.length ?? 0;
  }, { mapId, layerId, dataPath: DATA_FILE_PATH });
}

/** Helper to get the active layer ID from the map data */
export async function getActiveLayerId(page: any, mapId: string): Promise<string | null> {
  return await doWithApp(page, async (app: any, params?: { mapId: string; dataPath: string }) => {
    const dataFile = app.vault.getAbstractFileByPath(params!.dataPath);
    if (!dataFile) return null;

    const content = await app.vault.read(dataFile);
    const data = JSON.parse(content);
    return data.maps?.[params!.mapId]?.activeLayerId ?? null;
  }, { mapId, dataPath: DATA_FILE_PATH });
}

/** Helper to get total cell count across all layers */
export async function getTotalCellCount(page: any, mapId: string): Promise<number> {
  return await doWithApp(page, async (app: any, params?: { mapId: string; dataPath: string }) => {
    const dataFile = app.vault.getAbstractFileByPath(params!.dataPath);
    if (!dataFile) return -1;

    const content = await app.vault.read(dataFile);
    const data = JSON.parse(content);
    const map = data.maps?.[params!.mapId];
    if (!map?.layers) return -1;

    return map.layers.reduce((sum: number, layer: any) => sum + (layer.cells?.length ?? 0), 0);
  }, { mapId, dataPath: DATA_FILE_PATH });
}

/** Helper to get the full map data object from JSON */
export async function getMapData(page: any, mapId: string): Promise<any> {
  return await doWithApp(page, async (app: any, params?: { mapId: string; dataPath: string }) => {
    const dataFile = app.vault.getAbstractFileByPath(params!.dataPath);
    if (!dataFile) return null;

    const content = await app.vault.read(dataFile);
    const data = JSON.parse(content);
    return data.maps?.[params!.mapId] ?? null;
  }, { mapId, dataPath: DATA_FILE_PATH });
}

/** Helper to get object count from a specific layer */
export async function getLayerObjectCount(page: any, mapId: string, layerId: string): Promise<number> {
  return await doWithApp(page, async (app: any, params?: { mapId: string; layerId: string; dataPath: string }) => {
    const dataFile = app.vault.getAbstractFileByPath(params!.dataPath);
    if (!dataFile) return -1;

    const content = await app.vault.read(dataFile);
    const data = JSON.parse(content);
    const map = data.maps?.[params!.mapId];
    if (!map) return -1;

    const layer = map.layers?.find((l: any) => l.id === params!.layerId);
    return layer?.objects?.length ?? 0;
  }, { mapId, layerId, dataPath: DATA_FILE_PATH });
}

/** Helper to get text label count from a specific layer */
export async function getLayerTextLabelCount(page: any, mapId: string, layerId: string): Promise<number> {
  return await doWithApp(page, async (app: any, params?: { mapId: string; layerId: string; dataPath: string }) => {
    const dataFile = app.vault.getAbstractFileByPath(params!.dataPath);
    if (!dataFile) return -1;

    const content = await app.vault.read(dataFile);
    const data = JSON.parse(content);
    const map = data.maps?.[params!.mapId];
    if (!map) return -1;

    const layer = map.layers?.find((l: any) => l.id === params!.layerId);
    return layer?.textLabels?.length ?? 0;
  }, { mapId, layerId, dataPath: DATA_FILE_PATH });
}

/** Helper to get edge count from a specific layer */
export async function getLayerEdgeCount(page: any, mapId: string, layerId: string): Promise<number> {
  return await doWithApp(page, async (app: any, params?: { mapId: string; layerId: string; dataPath: string }) => {
    const dataFile = app.vault.getAbstractFileByPath(params!.dataPath);
    if (!dataFile) return -1;

    const content = await app.vault.read(dataFile);
    const data = JSON.parse(content);
    const map = data.maps?.[params!.mapId];
    if (!map) return -1;

    const layer = map.layers?.find((l: any) => l.id === params!.layerId);
    return layer?.edges?.length ?? 0;
  }, { mapId, layerId, dataPath: DATA_FILE_PATH });
}

// ===========================================
// Layer Context Menu Helpers
// ===========================================

/**
 * Ensure the layer dock is in Strata mode, where per-layer rows
 * (`.windrose-dock-layer-row`) and per-stratum add buttons render.
 *
 * Tile-capable maps default to "Simple" (Floors-only) mode, which shows floor
 * rows instead of layer rows — so flat layer add/switch/delete assertions need
 * Strata mode. Requires the layer drawer to already be open.
 *
 * The mode toggle button (`.windrose-dock-board-btn.mode`) switches Simple↔Strata;
 * its title is "Switch to Strata (layers)" in Simple mode. If the map is a
 * non-board (flat-list) map, no toggle is present and we no-op.
 */
export async function ensureStrataMode(page: any): Promise<void> {
  // Already showing layer rows (strata or flat list) → nothing to do.
  if (await page.locator('.windrose-dock-layer-row').count() > 0) return;

  const toStrata = page.locator('.windrose-dock-board-btn.mode[title="Switch to Strata (layers)"]');
  if (await toStrata.count() > 0) {
    await toStrata.first().click();
    await page.waitForTimeout(400);
  }
}

/** Open the layer drawer and switch it into Strata mode (layer rows visible). */
export async function openLayerPanelStrata(page: any): Promise<void> {
  await openLayerPanel(page);
  await page.locator('.windrose-edge-rail-drawer.is-open').waitFor({ state: "visible", timeout: 5000 });
  await ensureStrataMode(page);
}

/**
 * Right-click a layer row to open its actions.
 * Block-mode layers render as `.windrose-dock-layer-row` inside the EdgeRail
 * drawer. The redesigned dock exposes per-row actions via a "more" button
 * rather than a right-click context menu, so this expands that action menu.
 */
export async function openLayerContextMenu(page: any, layerIndex: number): Promise<void> {
  // Open layer panel in Strata mode so per-layer rows are shown
  await openLayerPanelStrata(page);
  await page.waitForTimeout(300);

  // Find the layer row by index (layers are in reverse order in UI - bottom layer is last)
  const row = page.locator('.windrose-dock-layer-row').nth(layerIndex);
  await row.waitFor({ state: "visible", timeout: 5000 });
  const moreBtn = row.locator('.windrose-dock-layer-action.more');
  await moreBtn.waitFor({ state: "visible", timeout: 3000 });
  await moreBtn.click();
  await page.waitForTimeout(200);
}

/** Helper to click the transparency toggle for a specific layer row */
export async function clickTransparencyToggle(page: any, layerIndex: number = 1): Promise<void> {
  // Scope to the specific layer row's transparency action button
  const row = page.locator('.windrose-dock-layer-row').nth(layerIndex);
  const transparencyBtn = row.locator('.windrose-dock-layer-action.transparency');
  await transparencyBtn.waitFor({ state: "visible", timeout: 3000 });

  // Ensure button is in viewport and clickable
  await transparencyBtn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);

  // Click with force option to ensure click registers
  await transparencyBtn.click({ force: true });
  await page.waitForTimeout(300);
}

/** Helper to check if transparency toggle is active for a specific layer row */
export async function isTransparencyToggleActive(page: any, layerIndex: number = 1): Promise<boolean> {
  const row = page.locator('.windrose-dock-layer-row').nth(layerIndex);
  const activeBtn = row.locator('.windrose-dock-layer-action.transparency.active');
  return await activeBtn.count() > 0;
}

/** Helper to hover over transparency button for a specific layer row */
export async function hoverTransparencyButton(page: any, layerIndex: number = 1): Promise<void> {
  const row = page.locator('.windrose-dock-layer-row').nth(layerIndex);
  const transparencyBtn = row.locator('.windrose-dock-layer-action.transparency');
  await transparencyBtn.hover();
  await page.waitForTimeout(200);
}

// ===========================================
// Floor Ghost ("Show floor below") Helpers
// ===========================================

/**
 * Ensure the map has at least two floors (boards). In Simple/Floors mode the
 * footer "Add Floor" button both adds a board and promotes the map to Strata
 * mode, switching to the new (upper) floor. Requires the layer drawer open.
 */
export async function ensureTwoFloors(page: any): Promise<void> {
  const boardSelect = page.locator('.windrose-dock-board-select');
  if (await boardSelect.count() > 0) {
    if (await boardSelect.locator('option').count() >= 2) return;
    await page.locator('.windrose-dock-board-btn[title="Add floor"]').click();
    await page.waitForTimeout(400);
    return;
  }
  if (await page.locator('.windrose-dock-floor-row').count() >= 2) return;
  const addFloor = page.locator('.windrose-dock-layer-add[title="Add floor"]');
  await addFloor.waitFor({ state: "visible", timeout: 5000 });
  await addFloor.click();
  await page.waitForTimeout(400);
}

/** Click the strata board bar's floor-ghost toggle ("Show floor below"). */
export async function clickFloorGhostToggle(page: any): Promise<void> {
  const btn = page.locator('.windrose-dock-board-btn.ghost');
  await btn.waitFor({ state: "visible", timeout: 3000 });
  await btn.click();
  await page.waitForTimeout(300);
}

/** Whether the board-bar floor-ghost toggle shows its active state. */
export async function isFloorGhostToggleActive(page: any): Promise<boolean> {
  return await page.locator('.windrose-dock-board-btn.ghost.active').count() > 0;
}

/** Switch the active floor via the strata board bar's dropdown (0 = bottom). */
export async function selectFloorByIndex(page: any, index: number): Promise<void> {
  const boardSelect = page.locator('.windrose-dock-board-select');
  await boardSelect.waitFor({ state: "visible", timeout: 3000 });
  const value = await boardSelect.locator('option').nth(index).getAttribute('value');
  await boardSelect.selectOption(value);
  await page.waitForTimeout(300);
}

/** Helper to get layer transparency settings from JSON data */
export async function getLayerTransparency(page: any, mapId: string, layerId: string): Promise<{ showLayerBelow: boolean; layerBelowOpacity: number } | null> {
  return await doWithApp(page, async (app: any, params?: { mapId: string; layerId: string; dataPath: string }) => {
    const dataFile = app.vault.getAbstractFileByPath(params!.dataPath);
    if (!dataFile) return null;

    const content = await app.vault.read(dataFile);
    const data = JSON.parse(content);
    const map = data.maps?.[params!.mapId];
    if (!map) return null;

    const layer = map.layers?.find((l: any) => l.id === params!.layerId);
    if (!layer) return null;

    return {
      showLayerBelow: layer.showLayerBelow ?? false,
      layerBelowOpacity: layer.layerBelowOpacity ?? 0.25
    };
  }, { mapId, layerId, dataPath: DATA_FILE_PATH });
}

// ===========================================
// Test Constants
// ===========================================

export const TEST_MAPS = {
  grid: "_testing/smoke-test-map.md",
  hex: "_testing/smoke-test-hex.md"
} as const;

export const MAP_IDS = {
  grid: "smoke-test-map-001",
  hex: "smoke-test-hex-001",
  dungeonTest: "dungeon-test-map-001"
} as const;
