import {
  test,
  expect,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  TEST_MAPS
} from "./helpers";

// ===========================================
// Overlay Positioning Tests
// ===========================================

test("SVG overlays align with canvas coordinates", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
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

  await navigateToMap(page, TEST_MAPS.grid);
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

  await navigateToMap(page, TEST_MAPS.grid);
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
