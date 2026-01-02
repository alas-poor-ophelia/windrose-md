/**
 * E2E Test Setup
 *
 * Creates symlinks in the test vault to source files before tests run.
 * This ensures tests use the latest built files while keeping the test vault isolated.
 */

import { existsSync, symlinkSync, unlinkSync, mkdirSync, cpSync } from "fs";
import path from "path";

const TEST_VAULT = path.resolve(__dirname, "../fixtures/test-vault");
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const MAIN_VAULT = "C:\\Users\\whipl\\OneDrive\\Documents\\Absalom";

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

export async function setup() {
  console.log("Setting up test vault symlinks...");

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
  // Optional: clean up symlinks after tests
  // For now, leave them in place for debugging
}
