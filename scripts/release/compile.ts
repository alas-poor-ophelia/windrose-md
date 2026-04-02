/**
 * Compile Windrose via Obsidian's Datacore Compiler
 *
 * Launches Obsidian using Playwright's Electron driver, executes the compile command,
 * waits for output file to be updated, then exits cleanly.
 */

import { _electron as electron, ElectronApplication, Page } from "playwright";
import * as path from "path";
import { existsSync, mkdirSync, writeFileSync, statSync, rmSync, readFileSync } from "fs";
import { randomBytes } from "crypto";

// Configuration
const OBSIDIAN_EXE = path.join(
  process.env.LOCALAPPDATA || "",
  "Programs",
  "Obsidian",
  "resources",
  "app.asar"
);

const VAULT_PATH = "C:\\Users\\whipl\\OneDrive\\Documents\\Absalom";

export interface CompileOptions {
  /** Obsidian command ID for compilation (e.g., "datacore-compiler:compile-windrose") */
  commandId: string;
  /** Path to compiled output file for completion detection */
  outputPath: string;
  /** Max wait time in ms (default: 120000) */
  timeout?: number;
  /** Keep Obsidian open after compilation (for debugging) */
  keepOpen?: boolean;
}

export interface CompileResult {
  success: boolean;
  duration: number;
  error?: string;
}

/**
 * Set up vault config in a temporary data directory.
 * This allows us to launch Obsidian without conflicting with the main instance.
 */
function setupVaultConfig(dataDir: string, vaultPath: string): string {
  const vaultHash = randomBytes(8).toString("hex").toLowerCase();

  const obsidianJson = {
    vaults: {
      [vaultHash]: {
        path: vaultPath,
        ts: Date.now(),
      },
    },
  };

  writeFileSync(
    path.join(dataDir, "obsidian.json"),
    JSON.stringify(obsidianJson)
  );
  writeFileSync(path.join(dataDir, `${vaultHash}.json`), "{}");

  return vaultHash;
}

/**
 * Handle the "Safe Mode" modal that appears when opening a vault
 * in a fresh Obsidian data directory.
 */
async function handleTrustModal(page: Page): Promise<void> {
  try {
    const enableButton = page.locator(
      '.modal-button-container button:has-text("Turn off"), ' +
        '.modal-button-container button:has-text("Enable"), ' +
        '.modal-button-container button:has-text("Trust")'
    );
    await enableButton.waitFor({ state: "visible", timeout: 5000 });
    console.log("  Safe mode modal detected, enabling plugins...");
    await enableButton.first().click();

    // Settings window may open after enabling - close it
    try {
      const settingsModal = page.locator(".modal-container");
      await settingsModal.waitFor({ state: "visible", timeout: 2000 });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(100);
      await page.keyboard.press("Escape");
    } catch {
      // Settings didn't open, fine
    }
  } catch {
    // Modal didn't appear, vault already trusted
  }
}

/**
 * Post-process the compiled output to fix path resolution.
 * This applies the same fixes as the finalize-release.js post-script.
 *
 * @param outputPath - Path to the compiled output file
 * @param basePath - Base path prefix for dc.resolvePath calls (e.g., "_compiled")
 */
function postProcessCompiledOutput(outputPath: string, basePath?: string): void {
  console.log("  Post-processing compiled output...");

  let content = readFileSync(outputPath, "utf-8");

  // Remove orphaned pathResolverImport line (handles both formatted and minified output)
  content = content.replace(
    /const \{?\s*getJsonPath\s*\}? = pathResolverImport;\r?\n?/g,
    ""
  );

  // Replace DATA_FILE_PATH assignment with dc.resolvePath()
  content = content.replace(
    /const DATA_FILE_PATH: string = getJsonPath\(\);/g,
    'const DATA_FILE_PATH: string = dc.resolvePath("windrose-md-data.json");'
  );

  // Remove empty Datacore Imports section header (optional cleanup)
  content = content.replace(
    /\/\/ =+\r?\n\/\/ Datacore Imports\r?\n\/\/ =+\r?\n\r?\n(?=\/\/ =+\r?\n\/\/ Theme Configuration)/,
    ""
  );

  // If basePath is provided, update internal dc.resolvePath calls to use the prefix
  if (basePath) {
    // Update dc.resolvePath("compiled-windrose-md") to use the base path
    content = content.replace(
      /dc\.resolvePath\("compiled-windrose-md"\)/g,
      `dc.resolvePath("${basePath}/compiled-windrose-md")`
    );
  }

  writeFileSync(outputPath, content);
  console.log("  Post-processing complete");
}

/**
 * Wait for Obsidian's app object to be available.
 */
async function waitForApp(page: Page, timeout: number = 30000): Promise<void> {
  await page.waitForFunction(
    () => {
      const app = (window as any).app;
      return app?.commands !== undefined && app?.workspace !== undefined;
    },
    { timeout }
  );
}

/**
 * Wait for a specific command to become available.
 * dc-compiler scans the vault for .compilersettings files and registers commands dynamically,
 * which can take time after plugins are enabled.
 */
async function waitForCommand(
  page: Page,
  commandId: string,
  timeout: number = 30000
): Promise<{ available: boolean; allCommands: string[] }> {
  const startTime = Date.now();
  let lastCommandCount = 0;

  while (Date.now() - startTime < timeout) {
    const result = await page.evaluate((cmdId: string) => {
      const app = (window as any).app;
      const commands = app?.commands?.commands || {};
      const commandKeys = Object.keys(commands);
      return {
        exists: !!commands[cmdId],
        count: commandKeys.length,
        dcCompilerCommands: commandKeys.filter(
          (k) => k.startsWith("dc-compiler:") || k.includes("datacore")
        ),
      };
    }, commandId);

    if (result.exists) {
      return { available: true, allCommands: result.dcCompilerCommands };
    }

    // Log progress if command count changed
    if (result.count !== lastCommandCount) {
      console.log(
        `  Commands registered: ${result.count}, dc-compiler commands: ${result.dcCompilerCommands.length}`
      );
      lastCommandCount = result.count;
    }

    await page.waitForTimeout(500);
  }

  // Final check - return what we have
  const finalResult = await page.evaluate((cmdId: string) => {
    const app = (window as any).app;
    const commands = app?.commands?.commands || {};
    return {
      exists: !!commands[cmdId],
      dcCompilerCommands: Object.keys(commands).filter(
        (k) => k.startsWith("dc-compiler:") || k.includes("datacore")
      ),
    };
  }, commandId);

  return {
    available: finalResult.exists,
    allCommands: finalResult.dcCompilerCommands,
  };
}

/**
 * Compile Windrose by launching Obsidian and executing the compiler command.
 */
export async function compileViaObsidian(
  options: CompileOptions
): Promise<CompileResult> {
  const { commandId, outputPath, timeout = 120000, keepOpen = false } = options;
  const startTime = Date.now();

  // Get output file's initial mtime (if exists)
  const initialMtime = existsSync(outputPath)
    ? statSync(outputPath).mtimeMs
    : 0;

  // Setup isolated Obsidian data directory
  const testDataDir = path.join(
    process.env.TEMP || "/tmp",
    `obsidian-compile-${randomBytes(4).toString("hex")}`
  );
  mkdirSync(testDataDir, { recursive: true });
  console.log(`  Temp data dir: ${testDataDir}`);

  const vaultHash = setupVaultConfig(testDataDir, VAULT_PATH);
  const vaultUri = `obsidian://open?vault=${vaultHash}`;

  let electronApp: ElectronApplication | null = null;

  try {
    // Launch Obsidian
    console.log("  Launching Obsidian...");
    electronApp = await electron.launch({
      timeout: 60000,
      args: [OBSIDIAN_EXE, "--user-data-dir=" + testDataDir, vaultUri],
    });

    const windows = electronApp.windows();
    let page = windows[windows.length - 1];
    if (!page) {
      page = await electronApp.firstWindow();
    }
    await page.waitForLoadState("domcontentloaded");

    // Handle trust modal
    await handleTrustModal(page);

    // Wait for app to be ready
    console.log("  Waiting for Obsidian to be ready...");
    await waitForApp(page);

    // Wait for the specific compile command to become available
    // dc-compiler needs time to scan the vault for .compilersettings files
    console.log(`  Waiting for command: ${commandId}`);
    const commandResult = await waitForCommand(page, commandId, 30000);

    if (!commandResult.available) {
      throw new Error(
        `Command "${commandId}" not found after 30s. ` +
          `Available dc-compiler commands: ${commandResult.allCommands.join(", ") || "none"}`
      );
    }

    console.log(`  Command available, executing...`);

    // Execute the compile command
    await page.evaluate(async (cmdId: string) => {
      const app = (window as any).app;
      await app.commands.executeCommandById(cmdId);
    }, commandId);

    // Poll for output file update
    console.log("  Waiting for compilation to complete...");
    const pollStart = Date.now();
    while (Date.now() - pollStart < timeout) {
      if (existsSync(outputPath)) {
        const currentMtime = statSync(outputPath).mtimeMs;
        if (currentMtime > initialMtime) {
          const duration = Date.now() - startTime;
          console.log(`  Compilation complete in ${duration}ms`);

          // Apply post-processing fixes
          postProcessCompiledOutput(outputPath);

          if (keepOpen) {
            console.log("  Keeping Obsidian open (--keep-open flag)");
            await new Promise((resolve) => setTimeout(resolve, 60000));
          }

          return { success: true, duration };
        }
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    throw new Error(`Compilation timed out after ${timeout}ms`);
  } catch (error: any) {
    return {
      success: false,
      duration: Date.now() - startTime,
      error: error.message,
    };
  } finally {
    if (electronApp && !keepOpen) {
      console.log("  Closing Obsidian...");
      await electronApp.close();
    }

    // Cleanup temp directory
    if (!keepOpen) {
      try {
        rmSync(testDataDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

// CLI entry point
if (process.argv[1]?.endsWith("compile.ts") || process.argv[1]?.endsWith("compile.js")) {
  const commandId = process.argv[2] || "dc-compiler:compile-projects-dungeon-map-tracker--compilersettings";
  const outputPath =
    process.argv[3] ||
    "C:\\Users\\whipl\\OneDrive\\Documents\\Absalom\\Projects\\dungeon-map-tracker\\dist\\compiled-windrose-md.md";
  const keepOpen = process.argv.includes("--keep-open");

  console.log("Windrose Compiler\n");
  console.log(`Command ID: ${commandId}`);
  console.log(`Output: ${outputPath}\n`);

  compileViaObsidian({ commandId, outputPath, keepOpen })
    .then((result) => {
      if (result.success) {
        console.log("\nCompilation succeeded!");
        process.exit(0);
      } else {
        console.error("\nCompilation failed:", result.error);
        process.exit(1);
      }
    })
    .catch((e) => {
      console.error("\nUnexpected error:", e);
      process.exit(1);
    });
}
