import { test } from "obsidian-testing-framework";
import { doWithApp } from "obsidian-testing-framework/lib/util.js";
import { expect } from "vitest";

// Re-export for convenience
export { test, expect, doWithApp };

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
}

/** Wait for Windrose container to be ready, with Datacore error detection */
export async function waitForContainer(page: any, timeout: number = 10000): Promise<any> {
  const container = page.locator(".dmt-container");
  const errorBox = page.locator(".datacore-error-box");

  // Brief wait for Datacore to initialize (errors appear immediately if they occur)
  await page.waitForTimeout(500);

  // Fast check: did an error already appear?
  if (await errorBox.count() > 0 && await errorBox.isVisible()) {
    const errorPre = page.locator(".datacore-error-pre");
    const errorText = await errorPre.textContent() || "Unknown Datacore error";
    throw new Error(`Datacore script failed:\n${errorText}`);
  }

  // No error, wait for container normally
  await container.waitFor({ state: "visible", timeout });
  return container;
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

/** Helper to close the settings modal via Cancel button */
export async function closeSettingsModal(page: any): Promise<void> {
  const cancelBtn = page.locator('.dmt-modal-btn-cancel');
  await cancelBtn.click();
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
  return await doWithApp(page, async (app: any, params: { mapId: string; layerId: string }) => {
    const dataFile = app.vault.getAbstractFileByPath("Garden/90 - Data/12 - Meta/JSON/dungeon-maps-data.json");
    if (!dataFile) return -1;

    const content = await app.vault.read(dataFile);
    const data = JSON.parse(content);
    const map = data.maps?.[params.mapId];
    if (!map) return -1;

    const layer = map.layers?.find((l: any) => l.id === params.layerId);
    return layer?.cells?.length ?? 0;
  }, { mapId, layerId });
}

/** Helper to get the active layer ID from the map data */
export async function getActiveLayerId(page: any, mapId: string): Promise<string | null> {
  return await doWithApp(page, async (app: any, id: string) => {
    const dataFile = app.vault.getAbstractFileByPath("Garden/90 - Data/12 - Meta/JSON/dungeon-maps-data.json");
    if (!dataFile) return null;

    const content = await app.vault.read(dataFile);
    const data = JSON.parse(content);
    return data.maps?.[id]?.activeLayerId ?? null;
  }, mapId);
}

/** Helper to get total cell count across all layers */
export async function getTotalCellCount(page: any, mapId: string): Promise<number> {
  return await doWithApp(page, async (app: any, id: string) => {
    const dataFile = app.vault.getAbstractFileByPath("Garden/90 - Data/12 - Meta/JSON/dungeon-maps-data.json");
    if (!dataFile) return -1;

    const content = await app.vault.read(dataFile);
    const data = JSON.parse(content);
    const map = data.maps?.[id];
    if (!map?.layers) return -1;

    return map.layers.reduce((sum: number, layer: any) => sum + (layer.cells?.length ?? 0), 0);
  }, mapId);
}

// ===========================================
// Test Constants
// ===========================================

export const TEST_MAPS = {
  grid: "_testing/smoke-test-map.md",
  hex: "_testing/smoke-test-hex.md"
} as const;

export const MAP_IDS = {
  grid: "smoke-test-map-001"
} as const;
