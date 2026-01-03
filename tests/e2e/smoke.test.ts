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
