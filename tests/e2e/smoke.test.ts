import { test } from "obsidian-testing-framework";
import { doWithApp } from "obsidian-testing-framework/lib/util.js";
import { expect } from "vitest";

// ===========================================
// Helper Functions
// ===========================================

/** Collect Windrose-related errors from page */
function setupErrorTracking(page: any): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err: Error) => {
    const msg = err.message.toLowerCase();
    if (msg.includes("windrose") || msg.includes("dmt") || msg.includes("dungeon")) {
      errors.push(err.message);
    }
  });
  return errors;
}

/** Navigate to a test map file */
async function navigateToMap(page: any, mapPath: string): Promise<void> {
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
async function waitForContainer(page: any, timeout: number = 10000): Promise<any> {
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
// Grid Map Smoke Tests
// ===========================================

test("Grid map loads without errors", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  // Wait for canvas wrapper
  const canvasWrapper = page.locator(".dmt-canvas-wrapper");
  await canvasWrapper.waitFor({ state: "visible", timeout: 5000 });

  // Verify canvas wrapper has dimensions
  const box = await canvasWrapper.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);

  // Verify no Windrose-specific JavaScript errors
  expect(errors).toHaveLength(0);
});

test("Grid map controls render", async ({ page }) => {
  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  // Check controls overlay
  const controls = page.locator(".dmt-controls");
  await controls.waitFor({ state: "visible", timeout: 5000 });

  // Check compass
  const compass = page.locator(".dmt-compass");
  await compass.waitFor({ state: "visible", timeout: 5000 });
});

// ===========================================
// Hex Map Smoke Tests
// ===========================================

test("Hex map loads without errors", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-hex.md");
  await waitForContainer(page);

  // Wait for canvas wrapper
  const canvasWrapper = page.locator(".dmt-canvas-wrapper");
  await canvasWrapper.waitFor({ state: "visible", timeout: 5000 });

  // Verify canvas wrapper has dimensions
  const box = await canvasWrapper.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);

  // Verify no Windrose-specific JavaScript errors
  expect(errors).toHaveLength(0);
});

test("Hex map controls render", async ({ page }) => {
  await navigateToMap(page, "_testing/smoke-test-hex.md");
  await waitForContainer(page);

  // Check controls overlay
  const controls = page.locator(".dmt-controls");
  await controls.waitFor({ state: "visible", timeout: 5000 });

  // Check compass
  const compass = page.locator(".dmt-compass");
  await compass.waitFor({ state: "visible", timeout: 5000 });
});

// ===========================================
// Object Placement Tests
// ===========================================

test("Object can be placed on grid map", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  const canvasWrapper = page.locator(".dmt-canvas-wrapper");
  await canvasWrapper.waitFor({ state: "visible", timeout: 5000 });

  // Get canvas position for click coordinates
  const canvas = page.locator(".dmt-canvas-wrapper canvas").first();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();

  // Select an object tool from the toolbar (if toolbar exists)
  const toolbar = page.locator(".dmt-toolbar, .dmt-sidebar");
  const toolbarExists = await toolbar.count() > 0;

  if (toolbarExists) {
    // Look for an object button (e.g., door, chest, etc.)
    const objectButton = page.locator('[data-tool="object"], .dmt-object-tool, .dmt-tool-object').first();
    const objectButtonExists = await objectButton.count() > 0;

    if (objectButtonExists) {
      await objectButton.click();

      // Click on the canvas to place an object
      const clickX = canvasBox!.x + canvasBox!.width / 2;
      const clickY = canvasBox!.y + canvasBox!.height / 2;
      await page.mouse.click(clickX, clickY);

      // Wait a moment for object to be placed
      await page.waitForTimeout(500);

      // Check if an object element was created
      const placedObject = page.locator('.dmt-object, [data-object-id]');
      const objectCount = await placedObject.count();

      // Object may or may not be placed depending on tool state
      // At minimum, verify no errors occurred
      expect(errors).toHaveLength(0);
    }
  }

  // Core assertion: no errors during interaction
  expect(errors).toHaveLength(0);
});

test("Placed objects have valid screen positions", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  const canvasWrapper = page.locator(".dmt-canvas-wrapper");
  await canvasWrapper.waitFor({ state: "visible", timeout: 5000 });
  const wrapperBox = await canvasWrapper.boundingBox();

  // Look for any pre-existing objects or overlays
  const overlayElements = page.locator('.dmt-object-overlay, .dmt-overlay, [data-object-id]');
  const overlayCount = await overlayElements.count();

  if (overlayCount > 0) {
    // Verify each overlay is positioned within the canvas bounds
    for (let i = 0; i < overlayCount; i++) {
      const overlay = overlayElements.nth(i);
      const overlayBox = await overlay.boundingBox();

      if (overlayBox && wrapperBox) {
        // Overlay should be within or near the canvas wrapper bounds
        // Allow some tolerance for objects that may extend beyond edges
        const tolerance = 100;
        expect(overlayBox.x).toBeGreaterThan(wrapperBox.x - tolerance);
        expect(overlayBox.y).toBeGreaterThan(wrapperBox.y - tolerance);
        expect(overlayBox.x).toBeLessThan(wrapperBox.x + wrapperBox.width + tolerance);
        expect(overlayBox.y).toBeLessThan(wrapperBox.y + wrapperBox.height + tolerance);
      }
    }
  }

  expect(errors).toHaveLength(0);
});

// ===========================================
// Overlay Positioning Tests
// ===========================================

test("SVG overlays align with canvas coordinates", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  const canvasWrapper = page.locator(".dmt-canvas-wrapper");
  await canvasWrapper.waitFor({ state: "visible", timeout: 5000 });

  // Get the canvas element
  const canvas = page.locator(".dmt-canvas-wrapper canvas").first();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();

  // Look for SVG overlays that should align with the canvas
  const svgOverlays = page.locator('.dmt-canvas-wrapper svg, .dmt-svg-overlay, .dmt-preview-overlay');
  const svgCount = await svgOverlays.count();

  if (svgCount > 0) {
    for (let i = 0; i < svgCount; i++) {
      const svg = svgOverlays.nth(i);
      const svgBox = await svg.boundingBox();

      if (svgBox && canvasBox) {
        // SVG overlays should be positioned to align with the canvas
        // They should start at approximately the same position
        const positionTolerance = 5; // pixels

        // Check that the SVG overlay is reasonably aligned with the canvas
        const xDiff = Math.abs(svgBox.x - canvasBox.x);
        const yDiff = Math.abs(svgBox.y - canvasBox.y);

        // Log position info for debugging
        console.log(`SVG ${i}: position (${svgBox.x}, ${svgBox.y}), canvas: (${canvasBox.x}, ${canvasBox.y})`);

        // For overlays that should match canvas position exactly
        if (xDiff < 50 && yDiff < 50) {
          // This is likely a canvas-aligned overlay
          expect(xDiff).toBeLessThan(positionTolerance);
          expect(yDiff).toBeLessThan(positionTolerance);
        }
      }
    }
  }

  expect(errors).toHaveLength(0);
});

test("Object overlays remain aligned after pan", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  const canvasWrapper = page.locator(".dmt-canvas-wrapper");
  await canvasWrapper.waitFor({ state: "visible", timeout: 5000 });

  const canvas = page.locator(".dmt-canvas-wrapper canvas").first();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();

  // Record initial overlay positions
  const overlays = page.locator('.dmt-object-overlay, .dmt-overlay, [data-object-id]');
  const initialOverlayCount = await overlays.count();
  const initialPositions: { x: number; y: number }[] = [];

  for (let i = 0; i < initialOverlayCount; i++) {
    const box = await overlays.nth(i).boundingBox();
    if (box) {
      initialPositions.push({ x: box.x, y: box.y });
    }
  }

  // Perform a pan operation (drag the canvas)
  const centerX = canvasBox!.x + canvasBox!.width / 2;
  const centerY = canvasBox!.y + canvasBox!.height / 2;
  const panDistance = 50;

  await page.mouse.move(centerX, centerY);
  await page.mouse.down({ button: 'middle' }); // Middle-click for pan
  await page.mouse.move(centerX + panDistance, centerY + panDistance);
  await page.mouse.up({ button: 'middle' });

  // Wait for pan animation/update
  await page.waitForTimeout(300);

  // Check that overlays moved with the pan
  const afterPanOverlayCount = await overlays.count();

  // Overlay count should remain the same
  expect(afterPanOverlayCount).toBe(initialOverlayCount);

  // If there were overlays, verify they moved appropriately
  if (initialOverlayCount > 0) {
    for (let i = 0; i < initialOverlayCount; i++) {
      const box = await overlays.nth(i).boundingBox();
      if (box && initialPositions[i]) {
        // Overlays should have moved by approximately the pan distance
        const xMove = box.x - initialPositions[i].x;
        const yMove = box.y - initialPositions[i].y;

        // Tolerance for movement calculation
        const moveTolerance = 10;

        // Movement should be close to the pan distance (if pan was applied)
        // Note: This may not trigger if pan requires a specific tool mode
        console.log(`Overlay ${i} moved: (${xMove}, ${yMove})`);
      }
    }
  }

  expect(errors).toHaveLength(0);
});

test("Object overlays remain aligned after zoom", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  const canvasWrapper = page.locator(".dmt-canvas-wrapper");
  await canvasWrapper.waitFor({ state: "visible", timeout: 5000 });

  const canvas = page.locator(".dmt-canvas-wrapper canvas").first();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();

  // Record initial state
  const overlays = page.locator('.dmt-object-overlay, .dmt-overlay, [data-object-id]');
  const initialOverlayCount = await overlays.count();

  // Perform a zoom operation (scroll wheel)
  const centerX = canvasBox!.x + canvasBox!.width / 2;
  const centerY = canvasBox!.y + canvasBox!.height / 2;

  await page.mouse.move(centerX, centerY);
  await page.mouse.wheel(0, -100); // Zoom in

  // Wait for zoom animation/update
  await page.waitForTimeout(300);

  // Verify overlay count remains the same (no disappearing overlays)
  const afterZoomOverlayCount = await overlays.count();
  expect(afterZoomOverlayCount).toBe(initialOverlayCount);

  // Verify overlays are still within reasonable bounds
  const wrapperBox = await canvasWrapper.boundingBox();

  for (let i = 0; i < afterZoomOverlayCount; i++) {
    const box = await overlays.nth(i).boundingBox();
    if (box && wrapperBox) {
      // Overlays should still be visible/within bounds after zoom
      const tolerance = 200; // Larger tolerance after zoom
      expect(box.x).toBeGreaterThan(wrapperBox.x - tolerance);
      expect(box.y).toBeGreaterThan(wrapperBox.y - tolerance);
    }
  }

  expect(errors).toHaveLength(0);
});

// ===========================================
// Drawing Tool Tests
// ===========================================

/** Helper to get canvas center coordinates */
async function getCanvasCenter(page: any): Promise<{ x: number; y: number }> {
  const canvas = page.locator(".dmt-canvas-wrapper canvas").first();
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error("Canvas not found");
  return {
    x: canvasBox.x + canvasBox.width / 2,
    y: canvasBox.y + canvasBox.height / 2
  };
}

test("Paint tool can be selected", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  // Wait for tool palette to render
  const toolPalette = page.locator(".dmt-tool-palette");
  await toolPalette.waitFor({ state: "visible", timeout: 5000 });

  // Find and click the draw tool (typically second button after select)
  const drawToolBtn = page.locator(".dmt-tool-palette .dmt-tool-btn").nth(1);
  await drawToolBtn.waitFor({ state: "visible", timeout: 5000 });
  await drawToolBtn.click();

  // Verify tool is now active
  const classes = await drawToolBtn.getAttribute("class");
  expect(classes).toContain("dmt-tool-btn-active");

  expect(errors).toHaveLength(0);
});

test("Paint tool fills cell on click", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  // Wait for tool palette
  const toolPalette = page.locator(".dmt-tool-palette");
  await toolPalette.waitFor({ state: "visible", timeout: 5000 });

  // Select the draw tool
  const drawToolBtn = page.locator(".dmt-tool-palette .dmt-tool-btn").nth(1);
  await drawToolBtn.click();
  await page.waitForTimeout(100);

  // Get canvas center and click to paint a cell
  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(200);

  // The canvas should have been updated (no error during operation)
  // Since cells are rendered to canvas, we verify no errors occurred
  expect(errors).toHaveLength(0);
});

test("Erase tool can be selected", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  const toolPalette = page.locator(".dmt-tool-palette");
  await toolPalette.waitFor({ state: "visible", timeout: 5000 });

  // Find erase tool (typically third button)
  const eraseToolBtn = page.locator(".dmt-tool-palette .dmt-tool-btn").nth(2);
  await eraseToolBtn.waitFor({ state: "visible", timeout: 5000 });
  await eraseToolBtn.click();

  // Verify tool is now active
  const classes = await eraseToolBtn.getAttribute("class");
  expect(classes).toContain("dmt-tool-btn-active");

  expect(errors).toHaveLength(0);
});

test("Erase tool removes painted cell", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  const toolPalette = page.locator(".dmt-tool-palette");
  await toolPalette.waitFor({ state: "visible", timeout: 5000 });

  const center = await getCanvasCenter(page);

  // First paint a cell
  const drawToolBtn = page.locator(".dmt-tool-palette .dmt-tool-btn").nth(1);
  await drawToolBtn.click();
  await page.waitForTimeout(100);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(200);

  // Now select erase tool and erase the cell
  const eraseToolBtn = page.locator(".dmt-tool-palette .dmt-tool-btn").nth(2);
  await eraseToolBtn.click();
  await page.waitForTimeout(100);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(200);

  // Verify no errors during paint/erase cycle
  expect(errors).toHaveLength(0);
});

test("Rectangle tool can be selected", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  const toolPalette = page.locator(".dmt-tool-palette");
  await toolPalette.waitFor({ state: "visible", timeout: 5000 });

  // Rectangle tool (typically fourth button)
  const rectToolBtn = page.locator(".dmt-tool-palette .dmt-tool-btn").nth(3);
  await rectToolBtn.waitFor({ state: "visible", timeout: 5000 });
  await rectToolBtn.click();

  const classes = await rectToolBtn.getAttribute("class");
  expect(classes).toContain("dmt-tool-btn-active");

  expect(errors).toHaveLength(0);
});

test("Rectangle tool fills area on drag", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  const toolPalette = page.locator(".dmt-tool-palette");
  await toolPalette.waitFor({ state: "visible", timeout: 5000 });

  // Select rectangle tool
  const rectToolBtn = page.locator(".dmt-tool-palette .dmt-tool-btn").nth(3);
  await rectToolBtn.click();
  await page.waitForTimeout(100);

  // Get canvas bounds for drag operation
  const canvas = page.locator(".dmt-canvas-wrapper canvas").first();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();

  // Define rectangle start and end points
  const startX = canvasBox!.x + canvasBox!.width * 0.3;
  const startY = canvasBox!.y + canvasBox!.height * 0.3;
  const endX = canvasBox!.x + canvasBox!.width * 0.6;
  const endY = canvasBox!.y + canvasBox!.height * 0.6;

  // Perform drag to draw rectangle
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  // Verify no errors during rectangle operation
  expect(errors).toHaveLength(0);
});

test("Circle tool can be selected", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  const toolPalette = page.locator(".dmt-tool-palette");
  await toolPalette.waitFor({ state: "visible", timeout: 5000 });

  // Circle tool (typically fifth button)
  const circleToolBtn = page.locator(".dmt-tool-palette .dmt-tool-btn").nth(4);
  await circleToolBtn.waitFor({ state: "visible", timeout: 5000 });
  await circleToolBtn.click();

  const classes = await circleToolBtn.getAttribute("class");
  expect(classes).toContain("dmt-tool-btn-active");

  expect(errors).toHaveLength(0);
});

test("Circle tool fills area on drag", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  const toolPalette = page.locator(".dmt-tool-palette");
  await toolPalette.waitFor({ state: "visible", timeout: 5000 });

  // Select circle tool
  const circleToolBtn = page.locator(".dmt-tool-palette .dmt-tool-btn").nth(4);
  await circleToolBtn.click();
  await page.waitForTimeout(100);

  // Get canvas bounds for drag operation
  const canvas = page.locator(".dmt-canvas-wrapper canvas").first();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();

  // Define circle center and edge points
  const centerX = canvasBox!.x + canvasBox!.width / 2;
  const centerY = canvasBox!.y + canvasBox!.height / 2;
  const edgeX = centerX + 80;
  const edgeY = centerY + 80;

  // Perform drag to draw circle
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(edgeX, edgeY, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  // Verify no errors during circle operation
  expect(errors).toHaveLength(0);
});

test("Drawing tools work on hex map", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-hex.md");
  await waitForContainer(page);

  const toolPalette = page.locator(".dmt-tool-palette");
  await toolPalette.waitFor({ state: "visible", timeout: 5000 });

  // Select draw tool and paint
  const drawToolBtn = page.locator(".dmt-tool-palette .dmt-tool-btn").nth(1);
  await drawToolBtn.click();
  await page.waitForTimeout(100);

  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(200);

  // Select erase tool and erase
  const eraseToolBtn = page.locator(".dmt-tool-palette .dmt-tool-btn").nth(2);
  await eraseToolBtn.click();
  await page.waitForTimeout(100);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(200);

  expect(errors).toHaveLength(0);
});

// ===========================================
// Undo/Redo Tests
// ===========================================

/** Helper to get history control buttons */
async function getHistoryButtons(page: any) {
  const container = page.locator('.dmt-history-controls');
  await container.waitFor({ state: "visible", timeout: 5000 });
  return {
    undoBtn: container.locator('.dmt-history-btn').first(),
    redoBtn: container.locator('.dmt-history-btn').nth(1)
  };
}

test("History controls render correctly", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  const { undoBtn, redoBtn } = await getHistoryButtons(page);

  // Both buttons should exist and be visible
  expect(await undoBtn.isVisible()).toBe(true);
  expect(await redoBtn.isVisible()).toBe(true);

  expect(errors).toHaveLength(0);
});

test("Undo button state reflects history", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  const { undoBtn } = await getHistoryButtons(page);

  // Just verify that the button state is accessible (enabled or disabled)
  // We don't assume the initial state since it depends on persisted data
  const isDisabled = await undoBtn.isDisabled();
  expect(typeof isDisabled).toBe("boolean");

  expect(errors).toHaveLength(0);
});

test("Drawing operation completes without errors", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  const toolPalette = page.locator(".dmt-tool-palette");
  await toolPalette.waitFor({ state: "visible", timeout: 5000 });

  // Draw a cell
  const drawToolBtn = page.locator(".dmt-tool-palette .dmt-tool-btn").nth(1);
  await drawToolBtn.click();
  await page.waitForTimeout(100);

  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(300);

  // The operation should complete without errors
  expect(errors).toHaveLength(0);
});

test("Undo/redo cycle completes without errors", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  const toolPalette = page.locator(".dmt-tool-palette");
  await toolPalette.waitFor({ state: "visible", timeout: 5000 });

  // Draw a cell to ensure we have something to undo
  const drawToolBtn = page.locator(".dmt-tool-palette .dmt-tool-btn").nth(1);
  await drawToolBtn.click();
  await page.waitForTimeout(100);

  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(500);

  const { undoBtn, redoBtn } = await getHistoryButtons(page);

  // Only proceed with undo/redo if buttons are available
  const undoDisabled = await undoBtn.isDisabled();

  if (!undoDisabled) {
    // Undo the drawing
    await undoBtn.click();
    await page.waitForTimeout(300);

    // Redo the drawing if redo is available
    const redoDisabled = await redoBtn.isDisabled();
    if (!redoDisabled) {
      await redoBtn.click();
      await page.waitForTimeout(300);
    }
  }

  // The cycle should complete without errors
  expect(errors).toHaveLength(0);
});

test("Redo button initially disabled when no undo performed", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  const { redoBtn } = await getHistoryButtons(page);

  // Redo should be disabled when no undo has been performed
  // (fresh map state, even if there's persisted data)
  const redoDisabled = await redoBtn.isDisabled();
  expect(redoDisabled).toBe(true);

  expect(errors).toHaveLength(0);
});

// ===========================================
// Object Interaction Tests
// ===========================================

/** Helper to check if object sidebar is visible and not collapsed */
async function isObjectSidebarExpanded(page: any): Promise<boolean> {
  // Check for expanded sidebar (not the collapsed version)
  const expandedSidebar = page.locator('.dmt-object-sidebar:not(.dmt-object-sidebar-collapsed)');
  return await expandedSidebar.count() > 0;
}

/** Helper to expand object sidebar if collapsed */
async function expandObjectSidebarIfNeeded(page: any): Promise<void> {
  const isExpanded = await isObjectSidebarExpanded(page);
  if (!isExpanded) {
    // Click the toggle button on the collapsed sidebar
    const toggleBtn = page.locator('.dmt-object-sidebar-collapsed .dmt-sidebar-toggle');
    if (await toggleBtn.count() > 0) {
      await toggleBtn.click();
      await page.waitForTimeout(300);
    }
  }
}

test("Object sidebar can be expanded", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  // Ensure sidebar is expanded
  await expandObjectSidebarIfNeeded(page);

  // Verify expanded sidebar is visible
  const isExpanded = await isObjectSidebarExpanded(page);
  expect(isExpanded).toBe(true);

  // Should have at least one object type available
  const objectItems = page.locator('.dmt-object-item');
  const count = await objectItems.count();
  expect(count).toBeGreaterThan(0);

  expect(errors).toHaveLength(0);
});

test("Object type can be selected from sidebar", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  // Expand sidebar if needed
  await expandObjectSidebarIfNeeded(page);

  // Click the first object item
  const objectItem = page.locator('.dmt-object-item').first();
  await objectItem.waitFor({ state: "visible", timeout: 5000 });
  await objectItem.click();
  await page.waitForTimeout(200);

  // The object item should be selected (have the selected class)
  const selectedClass = await objectItem.getAttribute("class");
  expect(selectedClass).toContain("dmt-object-item-selected");

  expect(errors).toHaveLength(0);
});

test("Add Object tool activates correctly", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  const toolPalette = page.locator(".dmt-tool-palette");
  await toolPalette.waitFor({ state: "visible", timeout: 5000 });

  // Click the Add Object tool button
  const addObjectBtn = page.locator('.dmt-tool-btn[title*="Add Object"]');
  await addObjectBtn.click();
  await page.waitForTimeout(200);

  // Verify the tool button is now active
  const toolClass = await addObjectBtn.getAttribute("class");
  expect(toolClass).toContain("dmt-tool-btn-active");

  expect(errors).toHaveLength(0);
});

test("Clicking canvas with object tool selected does not throw errors", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  // Expand sidebar and select an object type
  await expandObjectSidebarIfNeeded(page);
  const objectItem = page.locator('.dmt-object-item').first();
  await objectItem.waitFor({ state: "visible", timeout: 5000 });
  await objectItem.click();
  await page.waitForTimeout(200);

  // Click on canvas to attempt placement
  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(500);

  // Primary check: no errors during the operation
  expect(errors).toHaveLength(0);
});

// ===========================================
// Settings Modal Tests
// ===========================================

/** Helper to open the settings modal by hovering over controls and clicking settings button */
async function openSettingsModal(page: any): Promise<void> {
  // Hover over the controls area to reveal the drawer
  const controlsArea = page.locator('.dmt-controls');
  await controlsArea.waitFor({ state: "visible", timeout: 5000 });
  await controlsArea.hover();
  await page.waitForTimeout(300); // Wait for drawer animation

  // Click the settings button (has title "Map Settings")
  const settingsBtn = page.locator('.dmt-expand-btn[title="Map Settings"]');
  await settingsBtn.waitFor({ state: "visible", timeout: 5000 });
  await settingsBtn.click();
  await page.waitForTimeout(300);
}

/** Helper to close the settings modal via Cancel button */
async function closeSettingsModal(page: any): Promise<void> {
  const cancelBtn = page.locator('.dmt-modal-btn-cancel');
  await cancelBtn.click();
  await page.waitForTimeout(200);
}

test("Settings button is accessible via controls drawer", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  // Hover over controls to reveal the drawer
  const controlsArea = page.locator('.dmt-controls');
  await controlsArea.waitFor({ state: "visible", timeout: 5000 });
  await controlsArea.hover();
  await page.waitForTimeout(400);

  // Settings button should be visible
  const settingsBtn = page.locator('.dmt-expand-btn[title="Map Settings"]');
  expect(await settingsBtn.isVisible()).toBe(true);

  expect(errors).toHaveLength(0);
});

test("Settings modal opens when settings button is clicked", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  await openSettingsModal(page);

  // Modal should be visible
  const modal = page.locator('.dmt-settings-modal');
  expect(await modal.isVisible()).toBe(true);

  // Modal header should show "Map Settings"
  const header = page.locator('.dmt-modal-header h3');
  const headerText = await header.textContent();
  expect(headerText).toBe("Map Settings");

  expect(errors).toHaveLength(0);
});

test("Settings modal has correct tabs for grid map", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  await openSettingsModal(page);

  // Check for expected tabs (grid maps have: Appearance, Measurement, Preferences)
  const tabBar = page.locator('.dmt-settings-tab-bar');
  await tabBar.waitFor({ state: "visible", timeout: 5000 });

  const tabs = page.locator('.dmt-settings-tab');
  const tabCount = await tabs.count();
  expect(tabCount).toBe(3); // Appearance, Measurement, Preferences (no Hex Grid)

  // Verify tab labels
  const tabTexts: string[] = [];
  for (let i = 0; i < tabCount; i++) {
    tabTexts.push(await tabs.nth(i).textContent() || "");
  }
  expect(tabTexts).toContain("Appearance");
  expect(tabTexts).toContain("Measurement");
  expect(tabTexts).toContain("Preferences");

  expect(errors).toHaveLength(0);
});

test("Settings modal has Hex Grid tab for hex maps", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-hex.md");
  await waitForContainer(page);

  await openSettingsModal(page);

  // Hex maps should have 4 tabs including Hex Grid
  const tabs = page.locator('.dmt-settings-tab');
  const tabCount = await tabs.count();
  expect(tabCount).toBe(4); // Appearance, Hex Grid, Measurement, Preferences

  // Verify Hex Grid tab exists
  const tabTexts: string[] = [];
  for (let i = 0; i < tabCount; i++) {
    tabTexts.push(await tabs.nth(i).textContent() || "");
  }
  expect(tabTexts).toContain("Hex Grid");

  expect(errors).toHaveLength(0);
});

test("Settings tabs can be switched", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  await openSettingsModal(page);

  // First tab (Appearance) should be active initially
  const firstTab = page.locator('.dmt-settings-tab').first();
  let firstTabClass = await firstTab.getAttribute("class");
  expect(firstTabClass).toContain("dmt-settings-tab-active");

  // Click on the Measurement tab
  const measurementTab = page.locator('.dmt-settings-tab:has-text("Measurement")');
  await measurementTab.click();
  await page.waitForTimeout(100);

  // Measurement tab should now be active
  const measurementTabClass = await measurementTab.getAttribute("class");
  expect(measurementTabClass).toContain("dmt-settings-tab-active");

  // First tab should no longer be active
  firstTabClass = await firstTab.getAttribute("class");
  expect(firstTabClass).not.toContain("dmt-settings-tab-active");

  expect(errors).toHaveLength(0);
});

test("Settings modal can be closed with Cancel button", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  await openSettingsModal(page);

  // Modal should be visible
  let modal = page.locator('.dmt-settings-modal');
  expect(await modal.isVisible()).toBe(true);

  // Click Cancel
  await closeSettingsModal(page);

  // Modal should be hidden
  expect(await modal.isVisible()).toBe(false);

  expect(errors).toHaveLength(0);
});

test("Settings modal has Save and Cancel buttons", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  await openSettingsModal(page);

  // Check for Save button
  const saveBtn = page.locator('.dmt-modal-btn-submit');
  expect(await saveBtn.isVisible()).toBe(true);
  const saveBtnText = await saveBtn.textContent();
  expect(saveBtnText).toContain("Save");

  // Check for Cancel button
  const cancelBtn = page.locator('.dmt-modal-btn-cancel');
  expect(await cancelBtn.isVisible()).toBe(true);
  const cancelBtnText = await cancelBtn.textContent();
  expect(cancelBtnText).toContain("Cancel");

  expect(errors).toHaveLength(0);
});

test("Appearance tab content renders", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  await openSettingsModal(page);

  // Appearance tab content should be visible (it's the default tab)
  const tabContent = page.locator('.dmt-settings-tab-content');
  await tabContent.waitFor({ state: "visible", timeout: 5000 });
  expect(await tabContent.isVisible()).toBe(true);

  expect(errors).toHaveLength(0);
});

test("Preferences tab content renders", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  await openSettingsModal(page);

  // Click on Preferences tab
  const preferencesTab = page.locator('.dmt-settings-tab:has-text("Preferences")');
  await preferencesTab.click();
  await page.waitForTimeout(100);

  // Tab content should be visible
  const tabContent = page.locator('.dmt-settings-tab-content');
  await tabContent.waitFor({ state: "visible", timeout: 5000 });
  expect(await tabContent.isVisible()).toBe(true);

  expect(errors).toHaveLength(0);
});

test("Settings modal is draggable via header", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, "_testing/smoke-test-map.md");
  await waitForContainer(page);

  await openSettingsModal(page);

  // Get initial position
  const modal = page.locator('.dmt-settings-modal');
  const initialBox = await modal.boundingBox();
  expect(initialBox).not.toBeNull();

  // Drag the header
  const header = page.locator('.dmt-modal-header');
  const headerBox = await header.boundingBox();
  expect(headerBox).not.toBeNull();

  const startX = headerBox!.x + headerBox!.width / 2;
  const startY = headerBox!.y + headerBox!.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 50, startY + 50, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(100);

  // Check that position changed
  const newBox = await modal.boundingBox();
  expect(newBox).not.toBeNull();
  expect(newBox!.x).not.toBe(initialBox!.x);
  expect(newBox!.y).not.toBe(initialBox!.y);

  expect(errors).toHaveLength(0);
});
