import { beforeEach } from "vitest";
import {
  test,
  expect,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  getCanvasCenter,
  waitForToolPalette,
  selectToolByTitle,
  getActiveLayerId,
  getLayerTextLabelCount,
  resetDataFile,
  AUTOSAVE_WAIT,
  TEST_MAPS,
  MAP_IDS
} from "./helpers";

beforeEach(() => resetDataFile());

// ===========================================
// Text Label Tests
// ===========================================

test("Text label tool can be selected", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await waitForToolPalette(page);
  await selectToolByTitle(page, "Add Text");

  const textToolBtn = page.locator('.dmt-tool-btn[title*="Add Text"]');
  const classes = await textToolBtn.getAttribute("class") || "";
  expect(classes).toContain("dmt-tool-btn-active");

  expect(errors).toHaveLength(0);
});

test("Clicking canvas with text tool opens editor modal", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  await waitForToolPalette(page);
  await selectToolByTitle(page, "Add Text");

  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(500);

  // Check for either native or fallback modal
  const nativeModal = page.locator('.modal-title');
  const fallbackModal = page.locator('.dmt-text-editor-modal');
  const hasNative = await nativeModal.count() > 0;
  const hasFallback = await fallbackModal.count() > 0;
  expect(hasNative || hasFallback).toBe(true);

  expect(errors).toHaveLength(0);
});

test("Creating a text label persists to data", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.grid;

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const activeLayerId = await getActiveLayerId(page, mapId);
  expect(activeLayerId).not.toBeNull();

  const initialCount = await getLayerTextLabelCount(page, mapId, activeLayerId!);

  await waitForToolPalette(page);
  await selectToolByTitle(page, "Add Text");

  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(500);

  // Type text into the input field — try both native and fallback selectors
  const textInput = page.locator('.dmt-modal-input, .modal-content input[type="text"]').first();
  await textInput.waitFor({ state: "visible", timeout: 3000 });
  await textInput.fill("Test Label");
  await page.waitForTimeout(200);

  // Click save/submit — try native first, then fallback
  const saveBtn = page.locator('.modal-button-container .mod-cta, .dmt-modal-btn-submit').first();
  await saveBtn.dispatchEvent('click');
  await page.waitForTimeout(500);

  await page.waitForTimeout(AUTOSAVE_WAIT);
  const newCount = await getLayerTextLabelCount(page, mapId, activeLayerId!);
  expect(newCount).toBeGreaterThan(initialCount);

  expect(errors).toHaveLength(0);
});

test("Text label persists after navigation", async ({ page }) => {
  const errors = setupErrorTracking(page);
  const mapId = MAP_IDS.grid;

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const activeLayerId = await getActiveLayerId(page, mapId);
  expect(activeLayerId).not.toBeNull();

  await waitForToolPalette(page);
  await selectToolByTitle(page, "Add Text");

  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(500);

  const textInput = page.locator('.dmt-modal-input, .modal-content input[type="text"]').first();
  await textInput.waitFor({ state: "visible", timeout: 3000 });
  await textInput.fill("Persistent Label");
  await page.waitForTimeout(200);

  const saveBtn = page.locator('.modal-button-container .mod-cta, .dmt-modal-btn-submit').first();
  await saveBtn.dispatchEvent('click');
  await page.waitForTimeout(500);

  await page.waitForTimeout(AUTOSAVE_WAIT);
  const countAfterCreate = await getLayerTextLabelCount(page, mapId, activeLayerId!);
  expect(countAfterCreate).toBeGreaterThan(0);

  // Navigate away and back
  await navigateToMap(page, TEST_MAPS.hex);
  await waitForContainer(page);
  await page.waitForTimeout(500);

  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);
  await page.waitForTimeout(500);

  const countAfterReturn = await getLayerTextLabelCount(page, mapId, activeLayerId!);
  expect(countAfterReturn).toBe(countAfterCreate);

  expect(errors).toHaveLength(0);
});
