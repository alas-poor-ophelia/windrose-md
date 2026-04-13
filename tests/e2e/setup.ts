/**
 * E2E Test Setup
 *
 * Creates symlinks in the test vault to source files before tests run.
 * This ensures tests use the latest built files while keeping the test vault isolated.
 */

import { existsSync, symlinkSync, unlinkSync, mkdirSync, cpSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const TEST_VAULT = path.resolve(__dirname, "../fixtures/test-vault");
const TEST_VAULT_COMPILED = path.resolve(__dirname, "../fixtures/test-vault-compiled");
const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const MAIN_VAULT = "C:\\Users\\whipl\\OneDrive\\Documents\\Absalom";

// Plugins that live in the main vault and must be kept in sync with both test vaults.
// The settings plugin version must match the compiled artifact's expectations
// (e.g. v0.17.0 added the windrose-map code block processor and the obsidian bridge).
const PLUGINS_TO_SYNC = ["dungeon-map-tracker-settings"];

// Path to the clean fixture and its target locations
// Dev mode: _test-data/dungeon-maps-data.json (isolated test-only location)
// Compiled mode: windrose-md-data.json (at vault root)
const CLEAN_FIXTURE = path.join(FIXTURES_DIR, "dungeon-maps-data.clean.json");
const TEST_DATA_DIR = path.join(TEST_VAULT, "_test-data");
const DEV_FIXTURE_TARGET = path.join(TEST_DATA_DIR, "dungeon-maps-data.json");
const COMPILED_FIXTURE_TARGET = path.join(TEST_VAULT, "windrose-md-data.json");

// Generation test file that gets modified during tests and needs reset
const GENERATION_TEST_CLEAN = path.join(FIXTURES_DIR, "dungeon-generation-test.clean.md");
const GENERATION_TEST_TARGET = path.join(TEST_VAULT, "_testing/dungeon-generation-test.md");

interface SymlinkConfig {
  source: string;
  target: string;
  type: "file" | "dir";
}

const symlinks: SymlinkConfig[] = [
  // Windrose source files - symlink entire project folder for development testing
  {
    source: path.join(MAIN_VAULT, "Projects", "dungeon-map-tracker"),
    target: path.join(TEST_VAULT, "Projects", "dungeon-map-tracker"),
    type: "dir",
  },
  // Datacore plugin - symlink from main vault
  {
    source: path.join(MAIN_VAULT, ".obsidian", "plugins", "datacore"),
    target: path.join(TEST_VAULT, ".obsidian", "plugins", "datacore"),
    type: "dir",
  },
];

// Files to copy directly (for compiled artifacts that need Datacore indexing)
interface CopyConfig {
  source: string;
  target: string;
  /** Base path to rewrite dc.resolvePath calls */
  basePath?: string;
}

const copies: CopyConfig[] = [
  // Compiled Windrose artifact - copy to native vault location for Datacore to index
  {
    source: path.join(MAIN_VAULT, "Projects", "dungeon-map-tracker", "dist", "compiled-windrose-md.md"),
    target: path.join(TEST_VAULT, "_compiled", "compiled-windrose-md.md"),
    basePath: "_compiled",
  },
];

/**
 * Post-process compiled artifact to fix internal path references.
 * Updates dc.resolvePath calls to use the correct base path.
 */
function postProcessCompiledArtifact(targetPath: string, basePath: string): void {
  let content = readFileSync(targetPath, "utf-8");

  // Update dc.resolvePath("compiled-windrose-md") to use the base path
  content = content.replace(
    /dc\.resolvePath\("compiled-windrose-md"\)/g,
    `dc.resolvePath("${basePath}/compiled-windrose-md")`
  );

  writeFileSync(targetPath, content);
}

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
    } catch (e) {
      // Ignore errors
    }
  }

  // Reset the JSON fixtures to a clean state before tests run
  // This ensures tests don't inherit state from previous runs
  // Both dev and compiled mode fixtures need to be reset
  if (existsSync(CLEAN_FIXTURE)) {
    // Reset dev mode fixture (in dedicated _test-data directory)
    if (!existsSync(TEST_DATA_DIR)) {
      mkdirSync(TEST_DATA_DIR, { recursive: true });
    }
    cpSync(CLEAN_FIXTURE, DEV_FIXTURE_TARGET);
    console.log("  Reset: _test-data/dungeon-maps-data.json (dev mode) to clean state");

    // Reset compiled mode fixture
    cpSync(CLEAN_FIXTURE, COMPILED_FIXTURE_TARGET);
    console.log("  Reset: windrose-md-data.json (compiled mode) to clean state");
  } else {
    throw new Error(`Clean fixture not found at ${CLEAN_FIXTURE} — tests cannot run with stale state`);
  }

  // Reset the generation test file (gets modified by dungeon generation tests)
  if (existsSync(GENERATION_TEST_CLEAN)) {
    cpSync(GENERATION_TEST_CLEAN, GENERATION_TEST_TARGET);
    console.log("  Reset: dungeon-generation-test.md to clean state");
  }

  console.log("Setting up test vault symlinks...");

  // Sync plugins from the main vault into both test vaults.
  // Uses cpSync (not symlink) because OneDrive-backed sources can't be junctioned reliably,
  // and because the compiled test vault is a git-tracked fixture that shouldn't contain symlinks.
  for (const vault of [TEST_VAULT, TEST_VAULT_COMPILED]) {
    for (const pluginId of PLUGINS_TO_SYNC) {
      const source = path.join(MAIN_VAULT, ".obsidian", "plugins", pluginId);
      const target = path.join(vault, ".obsidian", "plugins", pluginId);
      if (!existsSync(source)) {
        console.warn(`  Plugin source not found: ${source}`);
        continue;
      }
      const fs = await import("fs/promises");
      if (existsSync(target)) {
        await fs.rm(target, { recursive: true, force: true });
      }
      mkdirSync(path.dirname(target), { recursive: true });
      cpSync(source, target, { recursive: true });
      console.log(`  Synced plugin: ${pluginId} -> ${path.basename(vault)}`);
    }
  }

  // Copy compiled artifacts first (for Datacore indexing)
  for (const copy of copies) {
    const parentDir = path.dirname(copy.target);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }
    if (existsSync(copy.source)) {
      cpSync(copy.source, copy.target);
      console.log(`  Copied: ${copy.source} -> ${copy.target}`);

      // Apply post-processing if basePath is specified
      if (copy.basePath) {
        postProcessCompiledArtifact(copy.target, copy.basePath);
        console.log(`  Post-processed for base path: ${copy.basePath}`);
      }
    } else {
      console.warn(`  Compiled artifact not found: ${copy.source}`);
    }
  }

  for (const link of symlinks) {
    // Remove existing symlink/file if present
    if (existsSync(link.target)) {
      try {
        unlinkSync(link.target);
      } catch (e) {
        // Directory symlinks on Windows need rmdir
        const fs = await import("fs/promises");
        await fs.rm(link.target, { recursive: true, force: true });
      }
    }

    // Ensure parent directory exists
    const parentDir = path.dirname(link.target);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    // Create symlink
    if (existsSync(link.source)) {
      try {
        // On Windows, symlinks may require admin or developer mode
        // Fall back to junction for directories or copy for files
        if (link.type === "dir") {
          symlinkSync(link.source, link.target, "junction");
        } else {
          symlinkSync(link.source, link.target, "file");
        }
        console.log(`  Linked: ${link.target} -> ${link.source}`);
      } catch (e: any) {
        // Fallback: copy instead of symlink
        console.warn(`  Symlink failed, copying instead: ${e.message}`);
        if (link.type === "dir") {
          cpSync(link.source, link.target, { recursive: true });
        } else {
          cpSync(link.source, link.target);
        }
        console.log(`  Copied: ${link.source} -> ${link.target}`);
      }
    } else {
      console.warn(`  Source not found, skipping: ${link.source}`);
    }
  }

  console.log("Test vault setup complete.");
}

export async function teardown() {
  console.log("Cleaning up test artifacts...");

  // Reset both dev and compiled mode fixtures to prevent accumulation
  if (existsSync(CLEAN_FIXTURE)) {
    if (existsSync(TEST_DATA_DIR)) {
      cpSync(CLEAN_FIXTURE, DEV_FIXTURE_TARGET);
      console.log("  Reset: _test-data/dungeon-maps-data.json to clean state");
    }
    cpSync(CLEAN_FIXTURE, COMPILED_FIXTURE_TARGET);
    console.log("  Reset: windrose-md-data.json (compiled mode) to clean state");
  }

  // Clean up obsidian-test-* temp directories created by obsidian-testing-framework
  // These accumulate quickly (~50MB each) and are not needed after tests complete
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
        } catch (e) {
          // Ignore errors for individual directories (may be in use)
        }
      }
      console.log("  Cleanup complete");
    }
  } catch (e) {
    console.warn("  Cleanup warning:", e);
  }
}
