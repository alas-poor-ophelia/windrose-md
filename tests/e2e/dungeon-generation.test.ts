import {
  test,
  expect,
  doWithApp,
  setupErrorTracking,
  navigateToMap,
  waitForContainer,
  DATA_FILE_PATH,
  AUTOSAVE_WAIT,
  TEST_MAPS
} from "./helpers";
import { beforeEach, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ===========================================
// Test Suite Setup
// ===========================================

// Reset the data file before any dungeon generation tests run.
// This ensures a clean state when running with other test suites.
const TEST_MODE = process.env.WINDROSE_TEST_MODE || "dev";
const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");
const TEST_VAULT_PATH = TEST_MODE === "compiled"
  ? path.join(FIXTURES_DIR, "test-vault-compiled")
  : path.join(FIXTURES_DIR, "test-vault");
const CLEAN_DATA_FILE = path.join(FIXTURES_DIR, "dungeon-maps-data.clean.json");

// Data file path differs between dev and compiled modes
const DATA_FILE_FULL_PATH = TEST_MODE === "compiled"
  ? path.join(TEST_VAULT_PATH, "windrose-md-data.json")
  : path.join(TEST_VAULT_PATH, "_test-data/dungeon-maps-data.json");

beforeAll(() => {
  // Reset data file to clean state before dungeon tests run
  if (fs.existsSync(CLEAN_DATA_FILE)) {
    const cleanData = fs.readFileSync(CLEAN_DATA_FILE, "utf-8");
    fs.writeFileSync(DATA_FILE_FULL_PATH, cleanData);
    console.log(`[Dungeon Tests] Reset data file to clean state (${TEST_MODE} mode)`);
  } else {
    console.warn("[Dungeon Tests] Clean data file not found at:", CLEAN_DATA_FILE);
  }
});

// ===========================================
// Dialog Handling Setup
// ===========================================

// Set up dialog auto-accept to prevent "No dialog is showing" race conditions.
// The obsidian-testing-framework's dialog handling can race with test cleanup,
// causing unhandled rejections. This handler accepts dialogs immediately and
// catches any errors from dialogs that were already dismissed.
beforeEach(({ page }: any) => {
  page.on("dialog", async (dialog: any) => {
    try {
      await dialog.accept();
    } catch {
      // Dialog was already dismissed - ignore
    }
  });
});

// ===========================================
// Constants
// ===========================================

const COMMAND_ID = "dungeon-map-tracker-settings:insert-random-dungeon";

const SELECTORS = {
  modal: ".dmt-insert-dungeon-modal",
  styleButtons: ".dmt-dungeon-style-btn",
  sizeButtons: ".dmt-dungeon-size-btn",
  sizeButtonRow: ".dmt-dungeon-size-buttons",
  generateButton: ".dmt-modal-buttons .mod-cta",
  cancelButton: ".dmt-modal-buttons button:not(.mod-cta)",
  rerollButton: ".dmt-reroll-btn",
  rerollOverlay: ".dmt-reroll-confirm-overlay",
  rerollDialog: ".dmt-reroll-confirm-dialog",
  rerollConfirmBtn: ".dmt-reroll-confirm-buttons .dmt-btn-primary",
  rerollCancelBtn: ".dmt-reroll-confirm-buttons .dmt-btn-secondary"
} as const;

// Test map for reroll tests (has generationSettings)
const DUNGEON_TEST_MAP = "_testing/dungeon-test-map.md";
const DUNGEON_TEST_MAP_ID = "dungeon-test-map-001";

// Dedicated file for generation tests (gets reset between runs)
const GENERATION_TEST_FILE = "_testing/dungeon-generation-test.md";

// Regular smoke test map (uses TEST_MAPS.grid which is mode-aware)
const SMOKE_TEST_MAP = TEST_MAPS.grid;

// ===========================================
// Helper Functions
// ===========================================

/** Execute a plugin command */
async function executeCommand(page: any, commandId: string): Promise<void> {
  return await doWithApp(page, async (app: any, id?: string) => {
    await app.commands.executeCommandById(id!);
  }, commandId);
}

/** Reset the generation test file to clean state */
async function resetGenerationTestFile(page: any): Promise<void> {
  return await doWithApp(page, async (app: any) => {
    const file = app.vault.getAbstractFileByPath("_testing/dungeon-generation-test.md");
    if (file) {
      const cleanContent = `# Dungeon Generation Test

This file is used for E2E testing of dungeon generation. Content will be inserted here during tests.

`;
      await app.vault.modify(file, cleanContent);
    }
  }, null);
}

/** Open the dungeon generation modal via command */
async function openDungeonModal(page: any): Promise<void> {
  await executeCommand(page, COMMAND_ID);
  await page.locator(SELECTORS.modal).waitFor({
    state: "visible",
    timeout: 5000
  });
}

/** Select a dungeon style */
async function selectDungeonStyle(
  page: any,
  style: "classic" | "cavern" | "fortress" | "crypt"
): Promise<void> {
  const styleLabels: Record<string, string> = {
    classic: "Classic",
    cavern: "Cavern",
    fortress: "Fortress",
    crypt: "Crypt"
  };
  const btn = page.locator(`${SELECTORS.styleButtons}:has-text("${styleLabels[style]}")`);
  await btn.click();
  await page.waitForTimeout(100);
}

/** Select a dungeon size */
async function selectDungeonSize(
  page: any,
  size: "small" | "medium" | "large"
): Promise<void> {
  const sizeLabels: Record<string, string> = {
    small: "Small",
    medium: "Medium",
    large: "Large"
  };
  const btn = page.locator(`${SELECTORS.sizeButtons}:has-text("${sizeLabels[size]}")`);
  await btn.click();
  await page.waitForTimeout(100);
}

/** Click the Generate button */
async function clickGenerateButton(page: any): Promise<void> {
  await page.locator(SELECTORS.generateButton).click();
}

/** Wait for modal to close */
async function waitForModalClose(page: any): Promise<void> {
  await page.locator(SELECTORS.modal).waitFor({
    state: "hidden",
    timeout: 15000 // Generation can take a moment
  });
}

/** Get map data from JSON file */
async function getMapData(page: any, mapId: string): Promise<any> {
  return await doWithApp(page, async (app: any, params?: { mapId: string; dataPath: string }) => {
    const dataFile = app.vault.getAbstractFileByPath(params!.dataPath);
    if (!dataFile) return null;

    const content = await app.vault.read(dataFile);
    const data = JSON.parse(content);
    return data.maps?.[params!.mapId] ?? null;
  }, { mapId, dataPath: DATA_FILE_PATH });
}

/** Get the most recently created map from JSON (by ID pattern with timestamp) */
async function getMostRecentGeneratedMap(page: any): Promise<{ id: string; data: any } | null> {
  return await doWithApp(page, async (app: any, dataPath?: string) => {
    const dataFile = app.vault.getAbstractFileByPath(dataPath!);
    if (!dataFile) return null;

    const content = await app.vault.read(dataFile);
    const parsed = JSON.parse(content);
    const maps = parsed.maps || parsed;

    // Find maps with timestamp-like IDs (generated maps have format: map-{timestamp}-{random})
    const mapIds = Object.keys(maps);

    // Sort by timestamp extracted from ID (format: map-1768801117741-nmzvjvq9t)
    const sorted = mapIds.sort((a, b) => {
      // Extract timestamp from second segment (e.g., "map-1768801117741-xxx" -> 1768801117741)
      const partsA = a.split("-");
      const partsB = b.split("-");
      const timeA = partsA.length >= 2 ? parseInt(partsA[1]) || 0 : 0;
      const timeB = partsB.length >= 2 ? parseInt(partsB[1]) || 0 : 0;
      return timeB - timeA;
    });

    if (sorted.length === 0) return null;
    return { id: sorted[0], data: maps[sorted[0]] };
  }, DATA_FILE_PATH);
}

/** Click the reroll button */
async function clickRerollButton(page: any): Promise<void> {
  await page.locator(SELECTORS.rerollButton).click();
  await page.waitForTimeout(100);
}

/** Confirm the reroll dialog */
async function confirmReroll(page: any): Promise<void> {
  await page.locator(SELECTORS.rerollConfirmBtn).click();
}

/** Cancel the reroll dialog */
async function cancelReroll(page: any): Promise<void> {
  await page.locator(SELECTORS.rerollCancelBtn).click();
}

// ===========================================
// Initial Generation Tests
// ===========================================

test("Dungeon: Generate command opens modal", async ({ page }) => {
  const errors = setupErrorTracking(page);

  // Navigate to a markdown file (need editor context for command)
  // Don't wait for container - this file has no map yet
  await navigateToMap(page, GENERATION_TEST_FILE);
  await page.waitForTimeout(1000); // Wait for editor to be ready

  // Execute the command
  await openDungeonModal(page);

  // Verify modal is visible
  const modal = page.locator(SELECTORS.modal);
  expect(await modal.isVisible()).toBe(true);

  // Close modal
  await page.locator(SELECTORS.cancelButton).click();

  expect(errors).toHaveLength(0);
});

test("Dungeon: Modal requires size selection before generating", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, GENERATION_TEST_FILE);
  await page.waitForTimeout(1000); // Wait for editor to be ready
  await openDungeonModal(page);

  // Try to generate without selecting size
  await clickGenerateButton(page);

  // Modal should still be open (generation didn't happen)
  const modal = page.locator(SELECTORS.modal);
  expect(await modal.isVisible()).toBe(true);

  // Clean up
  await page.locator(SELECTORS.cancelButton).click();

  expect(errors).toHaveLength(0);
});

test("Dungeon: Classic Medium generates cells and objects", async ({ page }) => {
  const errors = setupErrorTracking(page);

  // Reset the file before generating to avoid stacking codeblocks
  await navigateToMap(page, GENERATION_TEST_FILE);
  await page.waitForTimeout(500);
  await resetGenerationTestFile(page);
  await page.waitForTimeout(500);

  // Re-navigate to pick up the reset file
  await navigateToMap(page, SMOKE_TEST_MAP);
  await page.waitForTimeout(300);
  await navigateToMap(page, GENERATION_TEST_FILE);
  await page.waitForTimeout(1000);

  // Record map count before generation
  const beforeGeneration = await doWithApp(page, async (app: any, dataPath?: string) => {
    const dataFile = app.vault.getAbstractFileByPath(dataPath!);
    if (!dataFile) return { mapCount: 0 };
    const content = await app.vault.read(dataFile);
    const data = JSON.parse(content);
    const maps = data.maps || data;
    return { mapCount: Object.keys(maps).length };
  }, DATA_FILE_PATH);

  // Move cursor to end of file
  await page.keyboard.press("Control+End");
  await page.waitForTimeout(200);

  // Open modal and configure
  await openDungeonModal(page);
  await selectDungeonStyle(page, "classic");
  await selectDungeonSize(page, "medium");

  // Generate
  await clickGenerateButton(page);
  await waitForModalClose(page);

  // Move cursor out of the codeblock so it renders
  await page.keyboard.press("Control+End");
  await page.waitForTimeout(100);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);

  // Verify the map container renders
  await waitForContainer(page);

  // Wait for autosave (longer for generation which creates more data)
  await page.waitForTimeout(AUTOSAVE_WAIT + 2000);

  // Verify a new map was created
  const afterGeneration = await doWithApp(page, async (app: any, dataPath?: string) => {
    const dataFile = app.vault.getAbstractFileByPath(dataPath!);
    if (!dataFile) return { mapCount: 0 };
    const content = await app.vault.read(dataFile);
    const data = JSON.parse(content);
    const maps = data.maps || data;
    return { mapCount: Object.keys(maps).length };
  }, DATA_FILE_PATH);

  expect(afterGeneration.mapCount).toBeGreaterThan(beforeGeneration.mapCount);

  expect(errors).toHaveLength(0);
});

test("Dungeon: Generated map has cells with colors", async ({ page }) => {
  const errors = setupErrorTracking(page);

  // Reset the file before generating
  await navigateToMap(page, GENERATION_TEST_FILE);
  await page.waitForTimeout(500);
  await resetGenerationTestFile(page);
  await page.waitForTimeout(500);

  // Re-navigate to pick up the reset file
  await navigateToMap(page, SMOKE_TEST_MAP);
  await page.waitForTimeout(300);
  await navigateToMap(page, GENERATION_TEST_FILE);
  await page.waitForTimeout(1000);

  // Move cursor to end of file
  await page.keyboard.press("Control+End");
  await page.waitForTimeout(200);

  await openDungeonModal(page);
  await selectDungeonStyle(page, "classic");
  await selectDungeonSize(page, "small"); // Small for faster generation
  await clickGenerateButton(page);
  await waitForModalClose(page);

  // Move cursor out of the codeblock so it renders
  await page.keyboard.press("Control+End");
  await page.waitForTimeout(100);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);

  // Verify the map container renders
  await waitForContainer(page);
  await page.waitForTimeout(AUTOSAVE_WAIT + 2000);

  // Get the most recent map
  const recentMap = await getMostRecentGeneratedMap(page);
  expect(recentMap).not.toBeNull();

  // Check that cells exist
  const layers = recentMap!.data?.layers;
  expect(layers).toBeDefined();
  expect(layers.length).toBeGreaterThan(0);

  const activeLayer = layers[0];
  expect(activeLayer.cells).toBeDefined();
  expect(activeLayer.cells.length).toBeGreaterThan(0);

  // Verify cells have color property
  const cellWithColor = activeLayer.cells.find((c: any) => c.color);
  expect(cellWithColor).toBeDefined();

  expect(errors).toHaveLength(0);
});

test("Dungeon: Generated map has objects (doors, stairs)", async ({ page }) => {
  const errors = setupErrorTracking(page);

  // Reset the file before generating
  await navigateToMap(page, GENERATION_TEST_FILE);
  await page.waitForTimeout(500);
  await resetGenerationTestFile(page);
  await page.waitForTimeout(500);

  // Re-navigate to pick up the reset file
  await navigateToMap(page, SMOKE_TEST_MAP);
  await page.waitForTimeout(300);
  await navigateToMap(page, GENERATION_TEST_FILE);
  await page.waitForTimeout(1000);

  // Move cursor to end of file
  await page.keyboard.press("Control+End");
  await page.waitForTimeout(200);

  await openDungeonModal(page);
  await selectDungeonStyle(page, "classic");
  await selectDungeonSize(page, "small");
  await clickGenerateButton(page);
  await waitForModalClose(page);

  // Move cursor out of the codeblock so it renders
  await page.keyboard.press("Control+End");
  await page.waitForTimeout(100);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);

  // Verify the map container renders
  await waitForContainer(page);
  await page.waitForTimeout(AUTOSAVE_WAIT + 2000);

  const recentMap = await getMostRecentGeneratedMap(page);
  expect(recentMap).not.toBeNull();

  const layers = recentMap!.data?.layers;
  const activeLayer = layers?.[0];
  expect(activeLayer?.objects).toBeDefined();
  expect(activeLayer.objects.length).toBeGreaterThan(0);

  // Check for door types
  const hasDoor = activeLayer.objects.some((obj: any) =>
    obj.type?.includes("door") || obj.category === "doors"
  );
  expect(hasDoor).toBe(true);

  // Check for stairs
  const hasStairs = activeLayer.objects.some((obj: any) =>
    obj.type?.includes("stairs") || obj.category === "stairs"
  );
  expect(hasStairs).toBe(true);

  expect(errors).toHaveLength(0);
});

test("Dungeon: Generation settings are saved with map", async ({ page }) => {
  const errors = setupErrorTracking(page);

  // Reset the file before generating
  await navigateToMap(page, GENERATION_TEST_FILE);
  await page.waitForTimeout(500);
  await resetGenerationTestFile(page);
  await page.waitForTimeout(500);

  // Re-navigate to pick up the reset file
  await navigateToMap(page, SMOKE_TEST_MAP);
  await page.waitForTimeout(300);
  await navigateToMap(page, GENERATION_TEST_FILE);
  await page.waitForTimeout(1000);

  // Move cursor to end of file
  await page.keyboard.press("Control+End");
  await page.waitForTimeout(200);

  await openDungeonModal(page);
  await selectDungeonStyle(page, "cavern");
  await selectDungeonSize(page, "medium");
  await clickGenerateButton(page);
  await waitForModalClose(page);

  // Move cursor out of the codeblock so it renders
  await page.keyboard.press("Control+End");
  await page.waitForTimeout(100);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);

  // Verify the map container renders
  await waitForContainer(page);
  await page.waitForTimeout(AUTOSAVE_WAIT + 2000);

  const recentMap = await getMostRecentGeneratedMap(page);
  expect(recentMap).not.toBeNull();

  // Verify generation settings are saved
  const settings = recentMap!.data?.generationSettings;
  expect(settings).toBeDefined();
  expect(settings.preset).toBe("medium");
  expect(settings.configOverrides).toBeDefined();

  expect(errors).toHaveLength(0);
});

// ===========================================
// Reroll Tests
// ===========================================

test("Reroll: Button appears on map with generationSettings", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, DUNGEON_TEST_MAP);
  await waitForContainer(page);

  // Wait for reroll button to appear
  const rerollBtn = page.locator(SELECTORS.rerollButton);
  await rerollBtn.waitFor({ state: "visible", timeout: 5000 });

  expect(await rerollBtn.isVisible()).toBe(true);

  expect(errors).toHaveLength(0);
});

test("Reroll: Click shows confirmation dialog", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, DUNGEON_TEST_MAP);
  await waitForContainer(page);

  await clickRerollButton(page);

  // Verify dialog appears
  const dialog = page.locator(SELECTORS.rerollDialog);
  await dialog.waitFor({ state: "visible", timeout: 3000 });
  expect(await dialog.isVisible()).toBe(true);

  // Verify dialog has expected text
  const dialogText = await dialog.innerText();
  expect(dialogText).toContain("Re-roll Dungeon");

  // Cancel to clean up
  await cancelReroll(page);

  expect(errors).toHaveLength(0);
});

test("Reroll: Cancel closes dialog without changes", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, DUNGEON_TEST_MAP);
  await waitForContainer(page);

  // Get initial data
  const beforeData = await getMapData(page, DUNGEON_TEST_MAP_ID);
  const initialObjectCount = beforeData?.layers?.[0]?.objects?.length ?? 0;

  await clickRerollButton(page);
  await cancelReroll(page);

  // Dialog should be closed
  const dialog = page.locator(SELECTORS.rerollDialog);
  await page.waitForTimeout(200);
  expect(await dialog.count()).toBe(0);

  // Data should be unchanged
  const afterData = await getMapData(page, DUNGEON_TEST_MAP_ID);
  const afterObjectCount = afterData?.layers?.[0]?.objects?.length ?? 0;
  expect(afterObjectCount).toBe(initialObjectCount);

  expect(errors).toHaveLength(0);
});

test("Reroll: Confirm generates new content", async ({ page }) => {
  const errors = setupErrorTracking(page);

  await navigateToMap(page, DUNGEON_TEST_MAP);
  await waitForContainer(page);

  // Get initial object IDs
  const beforeData = await getMapData(page, DUNGEON_TEST_MAP_ID);
  const initialObjectIds = (beforeData?.layers?.[0]?.objects ?? [])
    .map((obj: any) => obj.id)
    .sort()
    .join(",");

  // Perform reroll
  await clickRerollButton(page);
  await confirmReroll(page);

  // Wait for generation and autosave
  await page.waitForTimeout(AUTOSAVE_WAIT + 1000);

  // Get new object IDs
  const afterData = await getMapData(page, DUNGEON_TEST_MAP_ID);
  const newObjectIds = (afterData?.layers?.[0]?.objects ?? [])
    .map((obj: any) => obj.id)
    .sort()
    .join(",");

  // Object IDs should be different (new generation)
  expect(newObjectIds).not.toBe(initialObjectIds);

  // Should still have objects
  expect(afterData?.layers?.[0]?.objects?.length).toBeGreaterThan(0);

  expect(errors).toHaveLength(0);
});

test("Reroll: Button absent on maps without generationSettings", async ({ page }) => {
  const errors = setupErrorTracking(page);

  // Use the regular smoke test map which has no generationSettings
  await navigateToMap(page, SMOKE_TEST_MAP);
  await waitForContainer(page);

  // Brief wait for any buttons to render
  await page.waitForTimeout(500);

  // Reroll button should not exist
  const rerollBtn = page.locator(SELECTORS.rerollButton);
  expect(await rerollBtn.count()).toBe(0);

  expect(errors).toHaveLength(0);
});

// ===========================================
// Style Variation Tests
// ===========================================

test("Dungeon: Cavern style generates without errors", async ({ page }) => {
  const errors = setupErrorTracking(page);

  // Reset the file before generating to avoid stacking codeblocks
  await navigateToMap(page, GENERATION_TEST_FILE);
  await page.waitForTimeout(500);
  await resetGenerationTestFile(page);
  await page.waitForTimeout(500);

  // Re-navigate to pick up the reset file
  await navigateToMap(page, SMOKE_TEST_MAP);
  await page.waitForTimeout(300);
  await navigateToMap(page, GENERATION_TEST_FILE);
  await page.waitForTimeout(1000);

  // Move cursor to end of file like a real user would (Ctrl+End)
  await page.keyboard.press("Control+End");
  await page.waitForTimeout(200);

  await openDungeonModal(page);
  await selectDungeonStyle(page, "cavern");
  await selectDungeonSize(page, "small");
  await clickGenerateButton(page);
  await waitForModalClose(page);

  // Move cursor out of the codeblock so it renders (add newline after)
  await page.keyboard.press("Control+End");
  await page.waitForTimeout(100);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);

  // Verify the map container renders after generation
  await waitForContainer(page);

  // Take a screenshot to verify the result
  await page.screenshot({ path: "tests/e2e/screenshots/cavern-generation-result.png" });

  expect(errors).toHaveLength(0);
});

test("Dungeon: Fortress style generates without errors", async ({ page }) => {
  const errors = setupErrorTracking(page);

  // Reset the file before generating
  await navigateToMap(page, GENERATION_TEST_FILE);
  await page.waitForTimeout(500);
  await resetGenerationTestFile(page);
  await page.waitForTimeout(500);

  // Re-navigate to pick up the reset file
  await navigateToMap(page, SMOKE_TEST_MAP);
  await page.waitForTimeout(300);
  await navigateToMap(page, GENERATION_TEST_FILE);
  await page.waitForTimeout(1000);

  // Move cursor to end of file
  await page.keyboard.press("Control+End");
  await page.waitForTimeout(200);

  await openDungeonModal(page);
  await selectDungeonStyle(page, "fortress");
  await selectDungeonSize(page, "small");
  await clickGenerateButton(page);
  await waitForModalClose(page);

  // Move cursor out of the codeblock so it renders
  await page.keyboard.press("Control+End");
  await page.waitForTimeout(100);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);

  // Verify the map container renders
  await waitForContainer(page);

  expect(errors).toHaveLength(0);
});

test("Dungeon: Crypt style generates without errors", async ({ page }) => {
  const errors = setupErrorTracking(page);

  // Reset the file before generating
  await navigateToMap(page, GENERATION_TEST_FILE);
  await page.waitForTimeout(500);
  await resetGenerationTestFile(page);
  await page.waitForTimeout(500);

  // Re-navigate to pick up the reset file
  await navigateToMap(page, SMOKE_TEST_MAP);
  await page.waitForTimeout(300);
  await navigateToMap(page, GENERATION_TEST_FILE);
  await page.waitForTimeout(1000);

  // Move cursor to end of file
  await page.keyboard.press("Control+End");
  await page.waitForTimeout(200);

  await openDungeonModal(page);
  await selectDungeonStyle(page, "crypt");
  await selectDungeonSize(page, "small");
  await clickGenerateButton(page);
  await waitForModalClose(page);

  // Move cursor out of the codeblock so it renders
  await page.keyboard.press("Control+End");
  await page.waitForTimeout(100);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);

  // Verify the map container renders
  await waitForContainer(page);

  expect(errors).toHaveLength(0);
});
