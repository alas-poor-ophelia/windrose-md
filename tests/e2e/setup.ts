/**
 * E2E Test Setup
 *
 * Installs the built standalone plugin into the test vault before tests run.
 * Resets fixture files to clean state.
 */

import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const TEST_VAULT = path.resolve(__dirname, "../fixtures/test-vault");
const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");

const PLUGIN_ID = "windrose-md";
const PLUGIN_FILES = ["main.js", "styles.css", "manifest.json"];
const PLUGIN_TARGET = path.join(TEST_VAULT, ".obsidian", "plugins", PLUGIN_ID);

const CLEAN_FIXTURE = path.join(FIXTURES_DIR, "dungeon-maps-data.clean.json");
const TEST_DATA_DIR = path.join(TEST_VAULT, "_test-data");
const DEV_FIXTURE_TARGET = path.join(TEST_DATA_DIR, "dungeon-maps-data.json");

const GENERATION_TEST_CLEAN = path.join(FIXTURES_DIR, "dungeon-generation-test.clean.md");
const GENERATION_TEST_TARGET = path.join(TEST_VAULT, "_testing/dungeon-generation-test.md");

export async function setup() {
  console.log("Setting up test vault...");

  // Clean up debug screenshots from previous test runs
  // Done at setup (not teardown) so screenshots remain observable after failures
  const screenshotsDir = path.resolve(__dirname, "screenshots");
  if (existsSync(screenshotsDir)) {
    const fs = await import("fs/promises");
    try {
      const files = await fs.readdir(screenshotsDir);
      if (files.length > 0) {
        for (const file of files) {
          await fs.unlink(path.join(screenshotsDir, file));
        }
        console.log(`  Cleaned ${files.length} screenshots from previous run`);
      }
    } catch {
      // Ignore errors
    }
  }

  // Reset the JSON fixture to a clean state before tests run
  if (existsSync(CLEAN_FIXTURE)) {
    if (!existsSync(TEST_DATA_DIR)) {
      mkdirSync(TEST_DATA_DIR, { recursive: true });
    }
    cpSync(CLEAN_FIXTURE, DEV_FIXTURE_TARGET);
    console.log("  Reset: _test-data/dungeon-maps-data.json to clean state");
  } else {
    throw new Error(`Clean fixture not found at ${CLEAN_FIXTURE} — tests cannot run with stale state`);
  }

  // Reset the generation test file (gets modified by dungeon generation tests)
  if (existsSync(GENERATION_TEST_CLEAN)) {
    cpSync(GENERATION_TEST_CLEAN, GENERATION_TEST_TARGET);
    console.log("  Reset: dungeon-generation-test.md to clean state");
  }

  // Install the standalone plugin into the test vault
  console.log("Installing standalone plugin into test vault...");

  if (!existsSync(PLUGIN_TARGET)) {
    mkdirSync(PLUGIN_TARGET, { recursive: true });
  }

  for (const file of PLUGIN_FILES) {
    const source = path.join(PROJECT_ROOT, file);
    const target = path.join(PLUGIN_TARGET, file);
    if (existsSync(source)) {
      cpSync(source, target);
      console.log(`  Installed: ${file} -> plugins/${PLUGIN_ID}/`);
    } else {
      if (file === "main.js") {
        throw new Error(
          `Built plugin not found at ${source}. Run 'npm run build' before E2E tests.`
        );
      }
      console.warn(`  Plugin file not found: ${source}`);
    }
  }

  // Pin onboardingState to 'done' in the plugin settings so neither the
  // first-run survey nor the What's-New banner appears during tests. The
  // settings data.json is plugin-owned and gitignored — on a fresh clone it
  // is absent, and the map fixture existing would otherwise resolve the
  // state to 'whatsnew' (banner in every test).
  const settingsFile = path.join(PLUGIN_TARGET, "data.json");
  let settings: Record<string, unknown> = {};
  if (existsSync(settingsFile)) {
    try {
      settings = JSON.parse(readFileSync(settingsFile, "utf-8")) as Record<string, unknown>;
    } catch {
      settings = {};
    }
  }
  if (settings.onboardingState !== "done") {
    settings.onboardingState = "done";
    writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
    console.log("  Pinned: plugin settings onboardingState = 'done'");
  }

  console.log("Test vault setup complete.");
}

export async function teardown() {
  console.log("Cleaning up test artifacts...");

  // Reset fixture to prevent accumulation
  if (existsSync(CLEAN_FIXTURE) && existsSync(TEST_DATA_DIR)) {
    cpSync(CLEAN_FIXTURE, DEV_FIXTURE_TARGET);
    console.log("  Reset: _test-data/dungeon-maps-data.json to clean state");
  }

  // Clean up obsidian-test-* temp directories created by obsidian-testing-framework
  const os = await import("os");
  const fs = await import("fs/promises");

  const tempDir = os.tmpdir();

  try {
    const entries = await fs.readdir(tempDir);
    const testDirs = entries.filter(name => name.startsWith("obsidian-test-"));

    if (testDirs.length > 0) {
      console.log(`  Found ${testDirs.length} obsidian-test-* directories to clean`);

      for (const dir of testDirs) {
        const fullPath = path.join(tempDir, dir);
        try {
          await fs.rm(fullPath, { recursive: true, force: true });
        } catch {
          // Ignore errors for individual directories (may be in use)
        }
      }
      console.log("  Cleanup complete");
    }
  } catch (e) {
    console.warn("  Cleanup warning:", e);
  }
}
