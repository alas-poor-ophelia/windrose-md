import { test } from "obsidian-testing-framework";
import { doWithApp } from "obsidian-testing-framework/lib/util.js";
import { expect } from "vitest";

// Re-export for convenience
export { test, expect, doWithApp };

// Test mode: "dev" uses uncompiled source, "compiled" uses compiled artifact
const TEST_MODE = process.env.WINDROSE_TEST_MODE || "dev";

// Compiled mode needs longer timeouts for initial Datacore indexing
const CONTAINER_TIMEOUT = TEST_MODE === "compiled" ? 60000 : 10000;

// Autosave wait time - needs to be longer than the app's autosave delay (2s)
// Compiled mode may be slower due to larger bundle size
export const AUTOSAVE_WAIT = TEST_MODE === "compiled" ? 4000 : 3000;

// Data file path differs between dev and compiled modes
// Dev: uses dedicated _test-data folder (isolated from manual testing)
// Compiled: uses vault-root windrose-md-data.json
export const DATA_FILE_PATH = TEST_MODE === "compiled"
  ? "windrose-md-data.json"
  : "_test-data/dungeon-maps-data.json";

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
  await doWithApp(page, async (app: any, path: string) => {
    const file = app.vault.getAbstractFileByPath(path);
    if (file) {
      await app.workspace.openLinkText(file.path, "", false);
    } else {
      throw new Error(`Test file ${path} not found in vault`);
    }
  }, mapPath);

  // Brief wait for Obsidian to switch views and Datacore to start rendering
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
  const installer = page.locator(".dmt-plugin-installer");

  // Quick check if installer is visible
  try {
    const isVisible = await installer.isVisible({ timeout: 500 });
    if (!isVisible) return false;
  } catch {
    return false; // Not visible or doesn't exist
  }

  console.log("[Test Helper] Plugin installer detected, handling install/upgrade flow...");

  // Click the primary action button (Install Plugin / Update Plugin)
  const primaryBtn = installer.locator(".dmt-plugin-installer-btn-primary");
  await primaryBtn.waitFor({ state: "visible", timeout: 3000 });
  await primaryBtn.click();

  // Wait for success modal to appear
  const successModal = page.locator(".dmt-plugin-success-modal-overlay");
  await successModal.waitFor({ state: "visible", timeout: timeout });

  // Click the primary button in success modal (Enable Now / Continue)
  const modalPrimaryBtn = successModal.locator(".dmt-plugin-installer-btn-primary");
  await modalPrimaryBtn.waitFor({ state: "visible", timeout: 3000 });
  await modalPrimaryBtn.click();

  // Wait for modal to close and container to start rendering
  await page.waitForTimeout(500);

  console.log("[Test Helper] Plugin installer flow completed");
  return true;
}

/** Wait for Windrose container to be ready, with Datacore error detection */
export async function waitForContainer(page: any, timeout: number = CONTAINER_TIMEOUT): Promise<any> {
  const container = page.locator(".dmt-container").first();

  // First, wait for a markdown view to be present (indicates Obsidian has loaded the file)
  const markdownView = page.locator(".markdown-reading-view, .markdown-source-view");
  try {
    await markdownView.first().waitFor({ state: "visible", timeout: 5000 });
  } catch {
    // View not found - proceed anyway
  }

  // Handle plugin installer if it appears (blocks the main canvas until handled)
  await page.waitForTimeout(100);
  await handlePluginInstallerIfPresent(page, 10000);

  // Wait for either the container or an error to appear
  // Use a race between success and error conditions
  const startTime = Date.now();
  let datacoreReadyLogged = false;

  while (Date.now() - startTime < timeout) {
    // Check if container is visible (success)
    if (await container.count() > 0 && await container.isVisible()) {
      return container;
    }

    // Check for "Datacore is getting ready" message - this means we need to wait longer
    const datacoreReady = page.locator('text=/Datacore is getting ready/i');
    if (await datacoreReady.count() > 0) {
      if (!datacoreReadyLogged) {
        console.log("[Test Helper] Datacore is indexing, waiting...");
        datacoreReadyLogged = true;
      }
      await page.waitForTimeout(1000);
      continue;
    }

    // Check for Datacore error box
    const errorBox = page.locator(".datacore-error-box");
    if (await errorBox.count() > 0 && await errorBox.isVisible()) {
      // Get the error text
      try {
        const errorText = await errorBox.first().innerText({ timeout: 500 });
        const trimmed = errorText?.trim() || "";

        // Ignore loading states - these are not errors
        if (trimmed.includes("View is rendering") || trimmed.includes("Loading") || trimmed.includes("getting ready")) {
          // Still loading, wait and continue
          await page.waitForTimeout(200);
          continue;
        }

        // This is a real error
        if (trimmed) {
          throw new Error(`Datacore script failed:\n${trimmed}`);
        }
      } catch (e: any) {
        if (e.message.includes("Datacore script failed")) throw e;
        // Couldn't read error, might be transient
      }
    }

    // Brief wait before next check
    await page.waitForTimeout(100);
  }

  // Timeout reached - do final check
  if (await container.count() > 0 && await container.isVisible()) {
    return container;
  }

  // Check for error one more time
  const errorBox = page.locator(".datacore-error-box");
  if (await errorBox.count() > 0 && await errorBox.isVisible()) {
    try {
      const errorText = await errorBox.first().innerText({ timeout: 500 });
      if (errorText?.trim()) {
        throw new Error(`Datacore script failed:\n${errorText.trim()}`);
      }
    } catch (e: any) {
      if (e.message.includes("Datacore script failed")) throw e;
    }
    throw new Error("Datacore script failed: Error box visible but couldn't read error details");
  }

  // Get diagnostic info
  const containerCount = await container.count();
  const diagErrorBox = page.locator(".datacore-error-box");
  const errorCount = await diagErrorBox.count();
  let diagErrorText = "";
  if (errorCount > 0) {
    try {
      diagErrorText = await diagErrorBox.first().innerText({ timeout: 500 });
    } catch {
      diagErrorText = "(couldn't read error text)";
    }
  }

  // Capture screenshot for debugging
  const screenshotPath = `tests/e2e/screenshots/container-timeout-${Date.now()}.png`;
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`[Debug] Screenshot saved to ${screenshotPath}`);
  } catch (e) {
    console.log(`[Debug] Failed to capture screenshot: ${e}`);
  }

  throw new Error(
    `Timeout waiting for .dmt-container after ${timeout}ms. ` +
    `Container count: ${containerCount}, Error boxes: ${errorCount}, Error text: "${diagErrorText}". ` +
    `Screenshot: ${screenshotPath}`
  );
}

// ===========================================
// Canvas Helpers
// ===========================================

/** Helper to get canvas center coordinates */
export async function getCanvasCenter(page: any): Promise<{ x: number; y: number }> {
  const canvas = page.locator(".dmt-canvas-wrapper canvas").first();
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error("Canvas not found");
  return {
    x: canvasBox.x + canvasBox.width / 2,
    y: canvasBox.y + canvasBox.height / 2
  };
}

/** Helper to focus the canvas area for keyboard shortcuts */
export async function focusCanvas(page: any): Promise<void> {
  const canvas = page.locator(".dmt-canvas-wrapper canvas").first();
  await canvas.click();
  await page.waitForTimeout(100);
}

// ===========================================
// Tool Palette Helpers
// ===========================================

/** Wait for tool palette to be visible */
export async function waitForToolPalette(page: any): Promise<any> {
  const toolPalette = page.locator(".dmt-tool-palette");
  await toolPalette.waitFor({ state: "visible", timeout: 5000 });
  return toolPalette;
}

/** Select a tool by index (0=select, 1=draw, 2=erase, 3=rect, 4=circle) */
export async function selectToolByIndex(page: any, index: number): Promise<void> {
  const toolBtn = page.locator(".dmt-tool-palette .dmt-tool-btn").nth(index);
  await toolBtn.click();
  await page.waitForTimeout(100);
}

/** Select a tool by title attribute */
export async function selectToolByTitle(page: any, titlePattern: string): Promise<void> {
  const toolBtn = page.locator(`.dmt-tool-btn[title*="${titlePattern}"]`);
  await toolBtn.waitFor({ state: "visible", timeout: 5000 });
  await toolBtn.click();
  await page.waitForTimeout(100);
}

/** Select a sub-tool from a tool group's flyout menu */
export async function selectSubTool(page: any, parentToolTitle: string, subToolLabel: string): Promise<void> {
  // Right-click the parent tool button to open the flyout (sub-menu opens via context menu)
  const parentBtn = page.locator(`.dmt-tool-btn[title*="${parentToolTitle}"]`);
  await parentBtn.waitFor({ state: "visible", timeout: 5000 });
  await parentBtn.click({ button: 'right' });
  await page.waitForTimeout(200);

  // Click the sub-tool option in the flyout
  const subToolOption = page.locator(`.dmt-subtool-menu .dmt-subtool-option`).filter({ hasText: subToolLabel });
  await subToolOption.waitFor({ state: "visible", timeout: 3000 });
  await subToolOption.click();
  await page.waitForTimeout(100);
}

// ===========================================
// History Controls Helpers
// ===========================================

/** Helper to get history control buttons */
export async function getHistoryButtons(page: any) {
  const container = page.locator('.dmt-history-controls');
  await container.waitFor({ state: "visible", timeout: 5000 });
  return {
    undoBtn: container.locator('.dmt-history-btn').first(),
    redoBtn: container.locator('.dmt-history-btn').nth(1)
  };
}

// ===========================================
// Object Sidebar Helpers
// ===========================================

/** Helper to check if object sidebar is visible and not collapsed */
export async function isObjectSidebarExpanded(page: any): Promise<boolean> {
  const expandedSidebar = page.locator('.dmt-object-sidebar:not(.dmt-object-sidebar-collapsed)');
  return await expandedSidebar.count() > 0;
}

/** Helper to expand object sidebar if collapsed */
export async function expandObjectSidebarIfNeeded(page: any): Promise<void> {
  const isExpanded = await isObjectSidebarExpanded(page);
  if (!isExpanded) {
    const toggleBtn = page.locator('.dmt-object-sidebar-collapsed .dmt-sidebar-toggle');
    if (await toggleBtn.count() > 0) {
      await toggleBtn.click();
      await page.waitForTimeout(300);
    }
  }
}

// ===========================================
// Settings Modal Helpers
// ===========================================

/** Helper to open the settings modal by hovering over controls and clicking settings button */
export async function openSettingsModal(page: any): Promise<void> {
  const controlsArea = page.locator('.dmt-controls');
  await controlsArea.waitFor({ state: "visible", timeout: 5000 });
  await controlsArea.hover();
  await page.waitForTimeout(300);

  const settingsBtn = page.locator('.dmt-expand-btn[title="Map Settings"]');
  await settingsBtn.waitFor({ state: "visible", timeout: 5000 });
  await settingsBtn.click();
  await page.waitForTimeout(300);
}

/** Helper to close the settings modal via Cancel button (supports both native and fallback modals) */
export async function closeSettingsModal(page: any): Promise<void> {
  // Native modal uses plain button text, fallback uses .dmt-modal-btn-cancel
  const cancelBtn = page.locator('.dmt-modal-btn-cancel, .modal-button-container button:not(.mod-cta)').first();
  await cancelBtn.dispatchEvent('click');
  await page.waitForTimeout(200);
}

// ===========================================
// Layer Panel Helpers
// ===========================================

/** Helper to open layer panel via controls drawer */
export async function openLayerPanel(page: any): Promise<void> {
  const controlsArea = page.locator('.dmt-controls');
  await controlsArea.waitFor({ state: "visible", timeout: 5000 });
  await controlsArea.hover();
  await page.waitForTimeout(400);

  const layerToggleBtn = page.locator('.dmt-expand-btn[title="Toggle layer panel"]');
  await layerToggleBtn.waitFor({ state: "visible", timeout: 5000 });
  await layerToggleBtn.click();
  await page.waitForTimeout(300);
}

// ===========================================
// Data Access Helpers
// ===========================================

/** Helper to read cell count from a specific layer in the JSON data file */
export async function getLayerCellCount(page: any, mapId: string, layerId: string): Promise<number> {
  return await doWithApp(page, async (app: any, params: { mapId: string; layerId: string; dataPath: string }) => {
    const dataFile = app.vault.getAbstractFileByPath(params.dataPath);
    if (!dataFile) return -1;

    const content = await app.vault.read(dataFile);
    const data = JSON.parse(content);
    const map = data.maps?.[params.mapId];
    if (!map) return -1;

    const layer = map.layers?.find((l: any) => l.id === params.layerId);
    return layer?.cells?.length ?? 0;
  }, { mapId, layerId, dataPath: DATA_FILE_PATH });
}

/** Helper to get the active layer ID from the map data */
export async function getActiveLayerId(page: any, mapId: string): Promise<string | null> {
  return await doWithApp(page, async (app: any, params: { mapId: string; dataPath: string }) => {
    const dataFile = app.vault.getAbstractFileByPath(params.dataPath);
    if (!dataFile) return null;

    const content = await app.vault.read(dataFile);
    const data = JSON.parse(content);
    return data.maps?.[params.mapId]?.activeLayerId ?? null;
  }, { mapId, dataPath: DATA_FILE_PATH });
}

/** Helper to get total cell count across all layers */
export async function getTotalCellCount(page: any, mapId: string): Promise<number> {
  return await doWithApp(page, async (app: any, params: { mapId: string; dataPath: string }) => {
    const dataFile = app.vault.getAbstractFileByPath(params.dataPath);
    if (!dataFile) return -1;

    const content = await app.vault.read(dataFile);
    const data = JSON.parse(content);
    const map = data.maps?.[params.mapId];
    if (!map?.layers) return -1;

    return map.layers.reduce((sum: number, layer: any) => sum + (layer.cells?.length ?? 0), 0);
  }, { mapId, dataPath: DATA_FILE_PATH });
}

// ===========================================
// Layer Context Menu Helpers
// ===========================================

/** Helper to right-click a layer button to open context menu */
export async function openLayerContextMenu(page: any, layerIndex: number): Promise<void> {
  // Open layer panel first
  await openLayerPanel(page);
  await page.waitForTimeout(300);

  // Find the layer button by index (layers are in reverse order in UI - bottom layer is last)
  const layerBtn = page.locator('.dmt-layer-btn').nth(layerIndex);
  await layerBtn.waitFor({ state: "visible", timeout: 5000 });
  await layerBtn.click({ button: 'right' });
  await page.waitForTimeout(200);
}

/** Helper to click the transparency toggle for a specific layer */
export async function clickTransparencyToggle(page: any, layerIndex: number = 1): Promise<void> {
  // Scope to the specific layer's transparency button
  const layerWrapper = page.locator('.dmt-layer-btn-wrapper').nth(layerIndex);
  const transparencyBtn = layerWrapper.locator('.dmt-layer-option-btn.transparency');
  await transparencyBtn.waitFor({ state: "visible", timeout: 3000 });

  // Ensure button is in viewport and clickable
  await transparencyBtn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);

  // Click with force option to ensure click registers
  await transparencyBtn.click({ force: true });
  await page.waitForTimeout(300);
}

/** Helper to check if transparency toggle is active for a specific layer */
export async function isTransparencyToggleActive(page: any, layerIndex: number = 1): Promise<boolean> {
  const layerWrapper = page.locator('.dmt-layer-btn-wrapper').nth(layerIndex);
  const activeBtn = layerWrapper.locator('.dmt-layer-option-btn.transparency.active');
  return await activeBtn.count() > 0;
}

/** Helper to hover over transparency button for a specific layer */
export async function hoverTransparencyButton(page: any, layerIndex: number = 1): Promise<void> {
  const layerWrapper = page.locator('.dmt-layer-btn-wrapper').nth(layerIndex);
  const wrapper = layerWrapper.locator('.dmt-layer-transparency-wrapper');
  await wrapper.hover();
  await page.waitForTimeout(200);
}

/** Helper to get layer transparency settings from JSON data */
export async function getLayerTransparency(page: any, mapId: string, layerId: string): Promise<{ showLayerBelow: boolean; layerBelowOpacity: number } | null> {
  return await doWithApp(page, async (app: any, params: { mapId: string; layerId: string; dataPath: string }) => {
    const dataFile = app.vault.getAbstractFileByPath(params.dataPath);
    if (!dataFile) return null;

    const content = await app.vault.read(dataFile);
    const data = JSON.parse(content);
    const map = data.maps?.[params.mapId];
    if (!map) return null;

    const layer = map.layers?.find((l: any) => l.id === params.layerId);
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

export const TEST_MAPS = TEST_MODE === "compiled"
  ? {
      grid: "_testing/smoke-test-compiled.md",
      hex: "_testing/smoke-test-hex-compiled.md"
    } as const
  : {
      grid: "_testing/smoke-test-map.md",
      hex: "_testing/smoke-test-hex.md"
    } as const;

export const MAP_IDS = {
  grid: "smoke-test-map-001",
  dungeonTest: "dungeon-test-map-001"
} as const;
